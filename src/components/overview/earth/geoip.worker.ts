/// <reference lib="webworker" />

import {
  GeoIPChunkStoreError,
  geoIPChunkStore,
  type GeoIPFileManifest,
} from '@/helper/geoip-chunk-store'
import { AsyncMMDBReader } from '@/helper/mmdb'
import type { CityResponse } from 'mmdb-lib'
import {
  DBIP_CITY_URL,
  DBIP_STORED_BYTES,
  type EarthLocation,
  type GeoDatabaseError,
  type GeoWorkerRequest,
  type GeoWorkerResponse,
} from './types'

declare const self: DedicatedWorkerGlobalScope

const DATABASE_KEY = `earth:${DBIP_CITY_URL}`
const DATABASE_TTL = 30 * 24 * 60 * 60 * 1000
const STORAGE_HEADROOM = 16 * 1024 * 1024
const LOOKUP_CONCURRENCY = 16
const CITY_CHUNK_CACHE_MAX = 64

const LEGACY_DATABASE_NAME = 'zashboard-earth-geoip'
const LEGACY_DATABASE_STORE = 'city-database'

interface LegacyCachedDatabase {
  blob: Blob
  storedAt: number
}

class WorkerError extends Error {
  constructor(readonly code: GeoDatabaseError) {
    super(code)
  }
}

let reader: AsyncMMDBReader<CityResponse> | null = null
let readerGeneration: string | null = null
let reloadReaderPromise: Promise<AsyncMMDBReader<CityResponse> | null> | null = null
let downloadController: AbortController | null = null

const post = (message: GeoWorkerResponse) => self.postMessage(message)

const openLegacyDatabase = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(LEGACY_DATABASE_NAME, 1)

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(LEGACY_DATABASE_STORE)) {
        request.result.createObjectStore(LEGACY_DATABASE_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const readLegacyCache = async () => {
  const database = await openLegacyDatabase()

  return new Promise<LegacyCachedDatabase | undefined>((resolve, reject) => {
    const request = database
      .transaction(LEGACY_DATABASE_STORE, 'readonly')
      .objectStore(LEGACY_DATABASE_STORE)
      .getAll()

    request.onsuccess = () => {
      const cached = (request.result as LegacyCachedDatabase[])
        .filter((value) => value?.blob instanceof Blob)
        .sort((left, right) => (right.storedAt || 0) - (left.storedAt || 0))[0]

      resolve(cached)
    }
    request.onerror = () => reject(request.error)
  }).finally(() => database.close())
}

const deleteLegacyDatabase = () =>
  new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(LEGACY_DATABASE_NAME)

    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  })

const createReader = async (manifest: GeoIPFileManifest) => {
  const nextReader = await AsyncMMDBReader.open<CityResponse>(
    geoIPChunkStore.createSource(DATABASE_KEY, manifest, CITY_CHUNK_CACHE_MAX),
  )

  if (!nextReader.metadata.databaseType || nextReader.metadata.nodeCount <= 0) {
    throw new WorkerError('invalid')
  }

  return nextReader
}

const installReader = (nextReader: AsyncMMDBReader<CityResponse>, manifest: GeoIPFileManifest) => {
  reader = nextReader
  readerGeneration = manifest.generation
}

const migrateLegacyCache = async (cached: LegacyCachedDatabase) => {
  const staged = await geoIPChunkStore.stageStream(DATABASE_KEY, cached.blob.stream(), {
    updatedAt: Number.isFinite(cached.storedAt) ? cached.storedAt : 0,
  })

  try {
    const nextReader = await createReader(staged)
    const committed = await geoIPChunkStore.activate(DATABASE_KEY, staged)

    installReader(nextReader, committed)
    await deleteLegacyDatabase()
    return committed
  } catch (error) {
    await geoIPChunkStore.discard(DATABASE_KEY, staged.generation).catch(() => {})
    throw error
  }
}

const init = async () => {
  post({ type: 'status', status: 'checking' })

  try {
    const cached = await geoIPChunkStore.getManifest(DATABASE_KEY)

    if (cached) {
      post({ type: 'status', status: 'loading-cache' })

      try {
        installReader(await createReader(cached), cached)
        void deleteLegacyDatabase()
        post({ type: 'status', status: 'ready' })

        if (Date.now() - cached.updatedAt > DATABASE_TTL) void download(true)
        return
      } catch {
        reader = null
        readerGeneration = null
        await geoIPChunkStore.invalidate(DATABASE_KEY, cached.generation).catch(() => {})
      }
    }

    const legacy = await readLegacyCache()

    if (legacy) {
      post({ type: 'status', status: 'loading-cache' })

      try {
        const migrated = await migrateLegacyCache(legacy)

        post({ type: 'status', status: 'ready' })
        if (Date.now() - migrated.updatedAt > DATABASE_TTL) void download(true)
        return
      } catch {
        reader = null
        readerGeneration = null
        await deleteLegacyDatabase()
        post({ type: 'status', status: 'idle', recoveredCorruptCache: true })
        return
      }
    }

    void deleteLegacyDatabase()
    post({ type: 'status', status: 'idle', recoveredCorruptCache: Boolean(cached) })
  } catch {
    post({ type: 'status', status: 'error', error: 'storage' })
  }
}

const ensureStorageSpace = async () => {
  try {
    const estimate = await navigator.storage?.estimate()

    if (estimate?.quota != null && estimate.usage != null) {
      const available = estimate.quota - estimate.usage

      if (available < DBIP_STORED_BYTES + STORAGE_HEADROOM) {
        throw new WorkerError('space')
      }
    }
  } catch (error) {
    if (error instanceof WorkerError) throw error
  }
}

const download = async (background = false) => {
  if (downloadController) return

  if (typeof DecompressionStream === 'undefined') {
    if (!background) post({ type: 'status', status: 'error', error: 'unsupported' })
    return
  }

  try {
    await ensureStorageSpace()
  } catch (error) {
    if (!background) {
      post({
        type: 'status',
        status: 'error',
        error: error instanceof WorkerError ? error.code : 'space',
      })
    }
    return
  }

  const controller = new AbortController()
  downloadController = controller

  if (!background) {
    reader = null
    readerGeneration = null
    post({ type: 'status', status: 'downloading', received: 0 })
  }

  try {
    const response = await fetch(DBIP_CITY_URL, { signal: controller.signal })

    if (!response.ok || !response.body) {
      throw new WorkerError('network')
    }

    const total = Number(response.headers.get('content-length')) || undefined
    let received = 0
    const progressStream = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, streamController) {
        received += chunk.byteLength
        if (!background) post({ type: 'status', status: 'downloading', received, total })
        streamController.enqueue(chunk)
      },
    })
    let decompressed: ReadableStream<Uint8Array>

    try {
      const decompressionStream = new DecompressionStream(
        'gzip',
      ) as unknown as ReadableWritablePair<Uint8Array, Uint8Array>
      decompressed = response.body.pipeThrough(progressStream).pipeThrough(decompressionStream)
    } catch {
      throw new WorkerError('decompress')
    }

    let staged: GeoIPFileManifest

    try {
      staged = await geoIPChunkStore.stageStream(DATABASE_KEY, decompressed)
    } catch (error) {
      if (controller.signal.aborted) throw error
      if (error instanceof GeoIPChunkStoreError && error.code === 'storage') {
        throw new WorkerError('storage')
      }
      throw new WorkerError('decompress')
    }

    if (controller.signal.aborted) {
      await geoIPChunkStore.discard(DATABASE_KEY, staged.generation).catch(() => {})
      throw new Error('GeoIP database download was cancelled')
    }

    let nextReader: AsyncMMDBReader<CityResponse>

    try {
      nextReader = await createReader(staged)
    } catch {
      await geoIPChunkStore.discard(DATABASE_KEY, staged.generation).catch(() => {})
      throw new WorkerError('invalid')
    }

    if (controller.signal.aborted) {
      await geoIPChunkStore.discard(DATABASE_KEY, staged.generation).catch(() => {})
      throw new Error('GeoIP database download was cancelled')
    }

    let committed: GeoIPFileManifest

    try {
      committed = await geoIPChunkStore.activate(DATABASE_KEY, staged)
    } catch {
      await geoIPChunkStore.discard(DATABASE_KEY, staged.generation).catch(() => {})
      throw new WorkerError('storage')
    }

    installReader(nextReader, committed)
    post({ type: 'status', status: 'ready' })
  } catch (error) {
    if (!background) {
      if (controller.signal.aborted) {
        post({ type: 'status', status: 'idle' })
      } else {
        post({
          type: 'status',
          status: 'error',
          error: error instanceof WorkerError ? error.code : 'network',
        })
      }
    }
  } finally {
    if (downloadController === controller) {
      downloadController = null
    }
  }
}

const localizedName = (names: unknown, locale: string) => {
  if (!names || typeof names !== 'object') return ''

  const values = names as Record<string, string | undefined>
  const language = locale.toLowerCase()

  if (language.startsWith('zh')) return values['zh-CN'] ?? values.zh ?? values.en ?? ''
  if (language.startsWith('ru')) return values.ru ?? values.en ?? ''
  return values[locale] ?? values[language.split('-')[0]] ?? values.en ?? ''
}

const cityDisplayName = (name: string) =>
  name.replace(/\s*(?:(?:\([^()]*\)|（[^（）]*）)\s*)+$/u, '').trim()

const reloadReaderAfterFailure = (
  failedReader: AsyncMMDBReader<CityResponse>,
  failedGeneration: string | null,
) => {
  if (reader && reader !== failedReader) return Promise.resolve(reader)
  if (reloadReaderPromise) return reloadReaderPromise

  reloadReaderPromise = (async () => {
    const manifest = await geoIPChunkStore.getManifest(DATABASE_KEY)

    if (!manifest || manifest.generation === failedGeneration) return null

    const nextReader = await createReader(manifest)

    installReader(nextReader, manifest)
    return nextReader
  })()
    .catch(() => null)
    .finally(() => {
      reloadReaderPromise = null
    })

  return reloadReaderPromise
}

const locate = async (ip: string, locale: string): Promise<EarthLocation | null> => {
  const lookupReader = reader
  const lookupGeneration = readerGeneration

  if (!lookupReader) return null

  let match: CityResponse | null

  try {
    match = await lookupReader.get(ip)
  } catch {
    const replacement = await reloadReaderAfterFailure(lookupReader, lookupGeneration)

    if (!replacement) return null

    try {
      match = await replacement.get(ip)
    } catch {
      return null
    }
  }

  const latitude = match?.location?.latitude
  const longitude = match?.location?.longitude

  return latitude == null || longitude == null
    ? null
    : {
        ip,
        latitude,
        longitude,
        city: cityDisplayName(localizedName(match?.city?.names, locale)),
        country: localizedName(match?.country?.names, locale),
      }
}

const lookup = async (id: number, ips: string[], locale: string) => {
  const locations: Record<string, EarthLocation | null> = {}
  let nextIndex = 0

  const workers = Array.from({ length: Math.min(LOOKUP_CONCURRENCY, ips.length) }, async () => {
    while (nextIndex < ips.length) {
      const ip = ips[nextIndex++]

      locations[ip] = await locate(ip, locale)
    }
  })

  await Promise.all(workers)
  post({ type: 'lookup', id, locations })
}

self.onmessage = ({ data }: MessageEvent<GeoWorkerRequest>) => {
  switch (data.type) {
    case 'init':
      void init()
      break
    case 'download':
      void download()
      break
    case 'cancel':
      downloadController?.abort()
      break
    case 'lookup':
      void lookup(data.id, data.ips, data.locale)
      break
  }
}
