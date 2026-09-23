import { getConnectionGeoIPInfoSync } from '@/api/connection-geoip'
import { CONNECTIONS_TABLE_ACCESSOR_KEY, PROXY_CHAIN_DIRECTION } from '@/constant'
import { getIPLabelFromMap } from '@/helper/source-ip'
import { fromNow, prettyBytesHelper } from '@/helper/utils'
import { autoDisconnectIdleUDP, autoDisconnectIdleUDPTime } from '@/store/settings'
import type { Connection } from '@/types'
import { watchOnce } from '@vueuse/core'
import dayjs from 'dayjs'
import * as ipaddr from 'ipaddr.js'
import { ref, shallowRef, watch } from 'vue'
import { driver, type ConnectionAccessor, type ConnectionsFilter } from './driver'

export type ConnectionDisplayOptions = {
  mode: 'card' | 'table'
  proxyChainDirection: PROXY_CHAIN_DIRECTION | string
  showFullProxyChain: boolean
}

export const activeConnections = shallowRef<Connection[]>([])
export const closedConnections = shallowRef<Connection[]>([])
export const closedBatch = shallowRef<Connection[]>([])
export const downloadTotal = ref(0)
export const uploadTotal = ref(0)
export const isPaused = ref(false)

export const connectionAccessor = (): ConnectionAccessor => driver().connections.accessor

export const disconnectById = (id: string) => driver().connections.disconnect(id)

export const disconnectAll = (filter?: ConnectionsFilter) =>
  driver().connections.disconnectAll(filter)

export const blockConnectionById = (id: string) => driver().connections.block(id)

let cancel: (() => void) | undefined

export const initConnections = () => {
  stopConnections()

  const accessor = connectionAccessor()
  const source = driver().connections.subscribe()
  let previousMap = new Map<string, Connection>()

  const unwatch = watch(source.data, (payload) => {
    if (!payload) return

    if (payload.downloadTotal != null && payload.uploadTotal != null) {
      downloadTotal.value = payload.downloadTotal
      uploadTotal.value = payload.uploadTotal
    }

    const currentMap = new Map<string, Connection>()
    const active = payload.connections.map((raw) => {
      const connection = raw as Connection
      const previous = previousMap.get(connection.id)

      connection.downloadSpeed = previous
        ? accessor.download(connection) - accessor.download(previous)
        : 0
      connection.uploadSpeed = previous
        ? accessor.upload(connection) - accessor.upload(previous)
        : 0

      previousMap.delete(connection.id)
      currentMap.set(connection.id, connection)
      return connection
    })

    const closed = Array.from(previousMap.values())
    previousMap = currentMap

    if (isPaused.value) return

    activeConnections.value = active

    const known = new Set(closedConnections.value.map((connection) => connection.id))
    const reported = (payload.closed ?? []).filter(
      (connection) => !known.has(connection.id) && !currentMap.has(connection.id),
    ) as Connection[]
    const batch = closed.concat(
      reported.filter((connection) => !closed.some((item) => item.id === connection.id)),
    )

    if (batch.length > 0) {
      closedConnections.value = closedConnections.value.concat(batch).slice(-500)
      closedBatch.value = batch
    }
  })

  if (autoDisconnectIdleUDP.value) {
    watchOnce(activeConnections, () => {
      activeConnections.value
        .filter((conn) => accessor.network(conn) !== 'tcp')
        .forEach((conn) => {
          const now = dayjs()
          const start = dayjs(accessor.start(conn))

          if (now.diff(start, 'minute') > autoDisconnectIdleUDPTime.value) {
            disconnectById(conn.id).catch(() => {})
          }
        })
    })
  }

  cancel = () => {
    unwatch()
    source.close()
  }
}

export const stopConnections = () => {
  cancel?.()
  cancel = undefined
  activeConnections.value = []
  closedConnections.value = []
  closedBatch.value = []
  downloadTotal.value = 0
  uploadTotal.value = 0
}

const getDestinationType = (destination: string) => {
  if (ipaddr.IPv4.isIPv4(destination)) {
    return 'IPv4'
  } else if (ipaddr.IPv6.isIPv6(destination)) {
    return 'IPv6'
  } else {
    return 'FQDN'
  }
}

const getVisibleChains = (connection: Connection, options: ConnectionDisplayOptions) => {
  let chains = connectionAccessor().chains(connection)

  if ((options.mode === 'card' || !options.showFullProxyChain) && chains.length > 2) {
    chains = [chains[0], chains[chains.length - 1]]
  }

  return options.proxyChainDirection === PROXY_CHAIN_DIRECTION.REVERSE
    ? chains
    : [...chains].reverse()
}

export const getConnectionDisplayValue = (
  connection: Connection,
  key: CONNECTIONS_TABLE_ACCESSOR_KEY,
  options: ConnectionDisplayOptions,
) => {
  const accessor = connectionAccessor()

  switch (key) {
    case CONNECTIONS_TABLE_ACCESSOR_KEY.Type:
      return accessor.networkType(connection)
    case CONNECTIONS_TABLE_ACCESSOR_KEY.Process:
      return accessor.process(connection)
    case CONNECTIONS_TABLE_ACCESSOR_KEY.Host:
      return accessor.host(connection)
    case CONNECTIONS_TABLE_ACCESSOR_KEY.Rule:
      return accessor.rule(connection)
    case CONNECTIONS_TABLE_ACCESSOR_KEY.Chains:
      return getVisibleChains(connection, options).join(' → ')
    case CONNECTIONS_TABLE_ACCESSOR_KEY.Outbound:
      return accessor.chains(connection)[0] || ''
    case CONNECTIONS_TABLE_ACCESSOR_KEY.DlSpeed:
      return `${prettyBytesHelper(connection.downloadSpeed)}/s`
    case CONNECTIONS_TABLE_ACCESSOR_KEY.UlSpeed:
      return `${prettyBytesHelper(connection.uploadSpeed)}/s`
    case CONNECTIONS_TABLE_ACCESSOR_KEY.Download:
      return prettyBytesHelper(accessor.download(connection))
    case CONNECTIONS_TABLE_ACCESSOR_KEY.Upload:
      return prettyBytesHelper(accessor.upload(connection))
    case CONNECTIONS_TABLE_ACCESSOR_KEY.ConnectTime:
      return fromNow(accessor.start(connection))
    case CONNECTIONS_TABLE_ACCESSOR_KEY.SourceIP:
      return getIPLabelFromMap(accessor.sourceIP(connection))
    case CONNECTIONS_TABLE_ACCESSOR_KEY.SourcePort:
      return accessor.sourcePort(connection)
    case CONNECTIONS_TABLE_ACCESSOR_KEY.SniffHost:
      return accessor.sniffHost(connection) || '-'
    case CONNECTIONS_TABLE_ACCESSOR_KEY.Destination:
      return accessor.destination(connection)
    case CONNECTIONS_TABLE_ACCESSOR_KEY.DestinationType:
      return getDestinationType(accessor.destination(connection))
    case CONNECTIONS_TABLE_ACCESSOR_KEY.GeoIP: {
      const { country, organization } = getConnectionGeoIPInfoSync(accessor.destination(connection))

      return [country, organization].filter(Boolean).join(' / ')
    }
    case CONNECTIONS_TABLE_ACCESSOR_KEY.RemoteAddress:
      return accessor.remoteAddress(connection) || '-'
    case CONNECTIONS_TABLE_ACCESSOR_KEY.InboundUser:
      return accessor.inboundUser(connection)
    case CONNECTIONS_TABLE_ACCESSOR_KEY.Protocol:
      return accessor.protocol?.(connection) || '-'
    case CONNECTIONS_TABLE_ACCESSOR_KEY.OutboundType:
      return accessor.outboundType?.(connection) || '-'
    case CONNECTIONS_TABLE_ACCESSOR_KEY.FromOutbound:
      return accessor.fromOutbound?.(connection) || '-'
    case CONNECTIONS_TABLE_ACCESSOR_KEY.Close:
      return ''
  }
}

const searchableKeysCache = new WeakMap<
  CONNECTIONS_TABLE_ACCESSOR_KEY[],
  CONNECTIONS_TABLE_ACCESSOR_KEY[]
>()

export const getConnectionVisibleSearchValues = (
  connection: Connection,
  keys: CONNECTIONS_TABLE_ACCESSOR_KEY[],
  options: ConnectionDisplayOptions,
) => {
  let visibleKeys = searchableKeysCache.get(keys)

  if (!visibleKeys) {
    visibleKeys = keys.filter((key) => key !== CONNECTIONS_TABLE_ACCESSOR_KEY.Close)
    searchableKeysCache.set(keys, visibleKeys)
  }

  return visibleKeys.map((key) => getConnectionDisplayValue(connection, key, options))
}
