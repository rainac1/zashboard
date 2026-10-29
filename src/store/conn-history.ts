import { closedBatch } from '@/assembly/connections'
import {
  getConnectionChains,
  getConnectionDownload,
  getConnectionHostname,
  getConnectionSourceIP,
  getConnectionUpload,
  getProcessFromConnection,
} from '@/helper'
import {
  clearConnectionHistoryFromIndexedDB,
  ConnectionHistoryType,
  getConnectionHistoryFromIndexedDB,
  saveConnectionHistoryToIndexedDB,
  type ConnectionHistoryData,
} from '@/helper/indexeddb'
import type { Connection } from '@/types'
import ipaddr from 'ipaddr.js'
import { getDomain } from 'tldts'
import { shallowRef, watch } from 'vue'
import { activeBackend } from './setup'

const uuid = () => activeBackend.value?.uuid || ''
const allHistoryTypes: ConnectionHistoryType[] = [
  ConnectionHistoryType.SourceIP,
  ConnectionHistoryType.Destination,
  ConnectionHistoryType.Process,
  ConnectionHistoryType.Outbound,
  ConnectionHistoryType.ProxyGroup,
]

type AggregationMaps = Record<ConnectionHistoryType, Map<string, ConnectionHistoryData>>

const createAggregationMaps = (): AggregationMaps => ({
  [ConnectionHistoryType.SourceIP]: new Map<string, ConnectionHistoryData>(),
  [ConnectionHistoryType.Destination]: new Map<string, ConnectionHistoryData>(),
  [ConnectionHistoryType.Process]: new Map<string, ConnectionHistoryData>(),
  [ConnectionHistoryType.Outbound]: new Map<string, ConnectionHistoryData>(),
  [ConnectionHistoryType.ProxyGroup]: new Map<string, ConnectionHistoryData>(),
})

const emptyView = (): Record<ConnectionHistoryType, ConnectionHistoryData[]> => ({
  [ConnectionHistoryType.SourceIP]: [],
  [ConnectionHistoryType.Destination]: [],
  [ConnectionHistoryType.Process]: [],
  [ConnectionHistoryType.Outbound]: [],
  [ConnectionHistoryType.ProxyGroup]: [],
})

export const aggregatedDataMap = shallowRef(emptyView())

const VIEW_REFRESH_MS = 5_000
const FLUSH_DELAY_MS = 30_000
const TRIM_THRESHOLD = 2000
const TRIM_KEEP = 1500

interface Session {
  uuid: string
  maps: AggregationMaps
  pending: Connection[]
  ready: boolean
  dirty: boolean
  disposed: boolean
}

let session: Session | undefined
let viewDirty = false
let flushTimer: ReturnType<typeof setTimeout> | undefined
let persistenceQueue: Promise<void> = Promise.resolve()

const enqueuePersistence = <T>(operation: () => Promise<T>) => {
  const result = persistenceQueue.then(operation)

  persistenceQueue = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

const refreshView = () => {
  if (!viewDirty || !session?.ready) {
    return
  }
  const next = emptyView()

  for (const type of allHistoryTypes) {
    next[type] = Array.from(session.maps[type].values())
  }
  viewDirty = false
  aggregatedDataMap.value = next
}

const trimMap = (map: Map<string, ConnectionHistoryData>) => {
  if (map.size <= TRIM_THRESHOLD) {
    return
  }
  const kept = Array.from(map.values())
    .sort((a, b) => b.download - a.download)
    .slice(0, TRIM_KEEP)

  map.clear()
  for (const item of kept) {
    map.set(item.key, item)
  }
}

const snapshotMaps = (
  maps: AggregationMaps,
): Record<ConnectionHistoryType, ConnectionHistoryData[]> =>
  Object.fromEntries(
    allHistoryTypes.map((type) => [type, Array.from(maps[type].values(), (item) => ({ ...item }))]),
  ) as Record<ConnectionHistoryType, ConnectionHistoryData[]>

const saveSnapshot = async (
  targetUuid: string,
  snapshot: Record<ConnectionHistoryType, ConnectionHistoryData[]>,
) => {
  let success = true

  for (const type of allHistoryTypes) {
    try {
      await saveConnectionHistoryToIndexedDB(targetUuid, type, snapshot[type])
    } catch (error) {
      success = false
      console.error(`Failed to save connection history for ${type}:`, error)
    }
  }
  return success
}

const flush = (target = session) => {
  clearTimeout(flushTimer)
  flushTimer = undefined
  if (!target?.ready || !target.dirty) {
    return
  }

  const snapshot = snapshotMaps(target.maps)

  target.dirty = false
  enqueuePersistence(async () => {
    if (!(await saveSnapshot(target.uuid, snapshot)) && !target.disposed) {
      markDirty(target)
    }
  })
}

const markDirty = (target: Session) => {
  target.dirty = true
  flushTimer ??= setTimeout(() => flush(), FLUSH_DELAY_MS)
}

const accumulate = (target: Session, connections: Connection[]) => {
  for (const type of allHistoryTypes) {
    const map = target.maps[type]

    for (const item of aggregateConnections(connections, type)) {
      const existing = map.get(item.key)

      if (existing) {
        existing.download += item.download
        existing.upload += item.upload
        existing.count += item.count
      } else {
        map.set(item.key, item)
      }
    }
    trimMap(map)
  }
  viewDirty = true
  markDirty(target)
}

const loadHistoryMaps = async (targetUuid: string) => {
  const maps = createAggregationMaps()

  for (const type of allHistoryTypes) {
    let data = await getConnectionHistoryFromIndexedDB(targetUuid, type)

    if (data.length > TRIM_THRESHOLD) {
      data = data.sort((a, b) => b.download - a.download).slice(0, TRIM_KEEP)
      await saveConnectionHistoryToIndexedDB(targetUuid, type, data)
    }

    for (const item of data) {
      maps[type].set(item.key, item)
    }
  }
  return maps
}

const startSession = async (
  targetUuid: string,
  inheritPending: boolean,
  load: () => Promise<AggregationMaps>,
) => {
  const prev = session
  const next: Session = {
    uuid: targetUuid,
    maps: createAggregationMaps(),
    pending: [],
    ready: false,
    dirty: false,
    disposed: false,
  }

  if (prev) {
    flush(prev)
    prev.disposed = true
    if (inheritPending && !prev.ready && prev.uuid === targetUuid) {
      next.pending = prev.pending
    }
  }
  session = next
  viewDirty = false
  aggregatedDataMap.value = emptyView()

  const maps = await enqueuePersistence(load)

  if (next.disposed) {
    return
  }
  next.maps = maps
  next.ready = true
  if (next.pending.length) {
    accumulate(next, next.pending.splice(0))
  }
  viewDirty = true
  refreshView()
}

setInterval(() => {
  if (!document.hidden) {
    refreshView()
  }
}, VIEW_REFRESH_MS)

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    flush()
  } else {
    refreshView()
  }
})

export const initAggregatedDataMap = () => {
  const targetUuid = uuid()

  return startSession(targetUuid, true, () => loadHistoryMaps(targetUuid))
}

export const clearConnectionHistory = () =>
  startSession(uuid(), false, async () => {
    await clearConnectionHistoryFromIndexedDB()
    return createAggregationMaps()
  })

export const aggregateConnections = (
  connections: Connection[],
  type: ConnectionHistoryType,
): ConnectionHistoryData[] => {
  const map = new Map<string, ConnectionHistoryData>()

  connections.forEach((connection) => {
    let key: string = ''

    if (type === ConnectionHistoryType.SourceIP) {
      key = getConnectionSourceIP(connection)
    } else if (type === ConnectionHistoryType.Destination) {
      const hostkey = getConnectionHostname(connection)
      if (ipaddr.IPv4.isValid(hostkey) || ipaddr.IPv6.isValid(hostkey)) {
        key = hostkey
      } else {
        key = getDomain(hostkey, { allowPrivateDomains: true }) || hostkey
      }
    } else if (type === ConnectionHistoryType.Process) {
      key = getProcessFromConnection(connection)
    } else if (type === ConnectionHistoryType.Outbound) {
      key = getConnectionChains(connection)[0] || '-'
    } else if (type === ConnectionHistoryType.ProxyGroup) {
      const chains = getConnectionChains(connection)
      key = chains[chains.length - 1] || '-'
    }

    if (map.has(key)) {
      const existing = map.get(key)!
      existing.download += getConnectionDownload(connection)
      existing.upload += getConnectionUpload(connection)
      existing.count += 1
    } else {
      map.set(key, {
        key,
        download: getConnectionDownload(connection),
        upload: getConnectionUpload(connection),
        count: 1,
      })
    }
  })

  return Array.from(map.values())
}

export const mergeAggregatedData = (
  historical: ConnectionHistoryData[],
  newData: ConnectionHistoryData[],
): ConnectionHistoryData[] => {
  const map = new Map<string, ConnectionHistoryData>()

  for (const item of historical) {
    map.set(item.key, item)
  }

  for (const item of newData) {
    const existing = map.get(item.key)

    if (existing) {
      map.set(item.key, {
        key: existing.key,
        download: existing.download + item.download,
        upload: existing.upload + item.upload,
        count: existing.count + item.count,
      })
    } else {
      map.set(item.key, { ...item })
    }
  }

  return Array.from(map.values())
}

export const saveConnectionHistory = (newClosedConnections: Connection[]) => {
  if (!newClosedConnections.length || !session || session.uuid !== uuid()) {
    return
  }

  if (session.ready) {
    accumulate(session, newClosedConnections)
  } else {
    session.pending.push(...newClosedConnections)
  }
}

watch(
  activeBackend,
  (backend) => {
    if (backend) initAggregatedDataMap()
  },
  { immediate: true },
)

watch(closedBatch, (batch) => saveConnectionHistory(batch))
