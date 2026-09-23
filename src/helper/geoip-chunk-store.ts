import type { MMDBByteSource } from '@/helper/mmdb'

const DATABASE_NAME = 'zashboard-geoip'
const DATABASE_VERSION = 2
const MANIFEST_STORE = 'manifests'
const CHUNK_STORE = 'chunks'

export const GEOIP_CHUNK_SIZE = 256 * 1024
const WRITE_BATCH_SIZE = 8
const DEFAULT_MEMORY_CHUNK_CACHE_MAX = 8
let databasePromise: Promise<IDBDatabase> | undefined

export interface GeoIPFileManifest {
  chunkCount: number
  chunkSize: number
  generation: string
  previousGeneration?: string
  size: number
  updatedAt: number
}

export class GeoIPChunkStoreError extends Error {
  constructor(
    readonly code: 'storage' | 'stream',
    options?: ErrorOptions,
  ) {
    super(`GeoIP chunk store ${code} error`, options)
  }
}

const openDatabase = (): Promise<IDBDatabase> => {
  if (databasePromise) return databasePromise

  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    let settled = false

    request.onupgradeneeded = () => {
      if (request.result.objectStoreNames.contains('mmdb')) {
        request.result.deleteObjectStore('mmdb')
      }
      if (!request.result.objectStoreNames.contains(MANIFEST_STORE)) {
        request.result.createObjectStore(MANIFEST_STORE)
      }
      if (!request.result.objectStoreNames.contains(CHUNK_STORE)) {
        request.result.createObjectStore(CHUNK_STORE)
      }
    }
    request.onsuccess = () => {
      const database = request.result

      if (settled) {
        database.close()
        return
      }
      settled = true

      const clear = () => {
        if (databasePromise === opening) databasePromise = undefined
      }

      database.onversionchange = () => {
        database.close()
        clear()
      }
      database.onclose = clear
      resolve(database)
    }
    request.onerror = () => {
      if (settled) return
      settled = true
      if (databasePromise === opening) databasePromise = undefined
      reject(request.error)
    }
    request.onblocked = () => {
      if (settled) return
      settled = true
      if (databasePromise === opening) databasePromise = undefined
      reject(new GeoIPChunkStoreError('storage'))
    }
  })

  databasePromise = opening
  return opening
}

const isManifest = (value: unknown): value is GeoIPFileManifest => {
  if (!value || typeof value !== 'object') return false

  const manifest = value as GeoIPFileManifest

  return (
    Number.isSafeInteger(manifest.chunkCount) &&
    manifest.chunkCount > 0 &&
    manifest.chunkSize === GEOIP_CHUNK_SIZE &&
    typeof manifest.generation === 'string' &&
    manifest.generation.length > 0 &&
    Number.isSafeInteger(manifest.size) &&
    manifest.size > 0 &&
    Math.ceil(manifest.size / manifest.chunkSize) === manifest.chunkCount &&
    Number.isFinite(manifest.updatedAt)
  )
}

const stagedGenerations = new Set<string>()
const sweptKeys = new Set<string>()

const getManifest = async (key: string): Promise<GeoIPFileManifest | undefined> => {
  const database = await openDatabase()
  const manifest = await new Promise<GeoIPFileManifest | undefined>((resolve, reject) => {
    const request = database
      .transaction(MANIFEST_STORE, 'readonly')
      .objectStore(MANIFEST_STORE)
      .get(key)

    request.onsuccess = () => resolve(isManifest(request.result) ? request.result : undefined)
    request.onerror = () => reject(request.error)
  })

  if (manifest && !sweptKeys.has(key)) {
    sweptKeys.add(key)
    void deleteInactiveGenerations(key, manifest.generation, manifest.previousGeneration).catch(
      () => sweptKeys.delete(key),
    )
  }

  return manifest
}

const writeChunks = async (
  key: string,
  generation: string,
  firstIndex: number,
  chunks: Uint8Array[],
) => {
  const database = await openDatabase()

  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(CHUNK_STORE, 'readwrite')
    const store = transaction.objectStore(CHUNK_STORE)

    chunks.forEach((chunk, index) => {
      store.put(chunk.buffer, [key, generation, firstIndex + index])
    })
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

const readChunk = async (key: string, generation: string, index: number) => {
  const database = await openDatabase()

  return new Promise<Uint8Array>((resolve, reject) => {
    const request = database
      .transaction(CHUNK_STORE, 'readonly')
      .objectStore(CHUNK_STORE)
      .get([key, generation, index])

    request.onsuccess = () => {
      const value = request.result

      if (!(value instanceof ArrayBuffer)) {
        reject(new Error(`Missing GeoIP database chunk ${index}`))
        return
      }

      resolve(new Uint8Array(value))
    }
    request.onerror = () => reject(request.error)
  })
}

const deleteGeneration = async (key: string, generation: string) => {
  const database = await openDatabase()

  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(CHUNK_STORE, 'readwrite')
    const range = IDBKeyRange.bound(
      [key, generation, 0],
      [key, generation, Number.MAX_SAFE_INTEGER],
    )

    transaction.objectStore(CHUNK_STORE).delete(range)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

const deleteInactiveGenerations = async (
  key: string,
  activeGeneration: string,
  previousGeneration?: string,
) => {
  const database = await openDatabase()

  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(CHUNK_STORE, 'readwrite')
    const request = transaction
      .objectStore(CHUNK_STORE)
      .openKeyCursor(IDBKeyRange.bound([key, ''], [key, '\uffff']))

    request.onsuccess = () => {
      const cursor = request.result

      if (!cursor) return
      const chunkKey = cursor.primaryKey as [string, string, number]

      if (
        chunkKey[1] !== activeGeneration &&
        chunkKey[1] !== previousGeneration &&
        !stagedGenerations.has(chunkKey[1])
      ) {
        cursor.delete()
      }
      cursor.continue()
    }
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

class IndexedDBMMDBSource implements MMDBByteSource {
  readonly size: number
  private readonly chunks = new Map<number, Promise<Uint8Array>>()

  constructor(
    private readonly key: string,
    private readonly manifest: GeoIPFileManifest,
    private readonly memoryChunkCacheMax: number,
  ) {
    this.size = manifest.size
  }

  async read(offset: number, length: number): Promise<Uint8Array> {
    if (
      !Number.isSafeInteger(offset) ||
      !Number.isSafeInteger(length) ||
      offset < 0 ||
      length < 0
    ) {
      throw new Error('Invalid GeoIP database byte range')
    }
    if (offset + length > this.size) throw new Error('GeoIP database byte range is out of bounds')
    if (length === 0) return new Uint8Array()

    const firstIndex = Math.floor(offset / this.manifest.chunkSize)
    const lastIndex = Math.floor((offset + length - 1) / this.manifest.chunkSize)

    if (firstIndex === lastIndex) {
      const chunk = await this.loadChunk(firstIndex)
      const chunkOffset = offset - firstIndex * this.manifest.chunkSize

      return chunk.subarray(chunkOffset, chunkOffset + length)
    }

    const result = new Uint8Array(length)
    let resultOffset = 0

    for (let index = firstIndex; index <= lastIndex; index++) {
      const chunk = await this.loadChunk(index)
      const chunkStart = index * this.manifest.chunkSize
      const from = Math.max(offset, chunkStart) - chunkStart
      const to = Math.min(offset + length, chunkStart + chunk.length) - chunkStart

      result.set(chunk.subarray(from, to), resultOffset)
      resultOffset += to - from
    }

    if (resultOffset !== length) throw new Error('Incomplete GeoIP database byte range')

    return result
  }

  private loadChunk(index: number) {
    if (index < 0 || index >= this.manifest.chunkCount) {
      return Promise.reject(new Error(`Invalid GeoIP database chunk ${index}`))
    }

    const cached = this.chunks.get(index)

    if (cached) {
      this.chunks.delete(index)
      this.chunks.set(index, cached)
      return cached
    }

    const chunk = readChunk(this.key, this.manifest.generation, index).catch((error) => {
      this.chunks.delete(index)
      throw error
    })

    this.chunks.set(index, chunk)
    while (this.chunks.size > this.memoryChunkCacheMax) {
      const oldest = this.chunks.keys().next().value

      if (oldest === undefined) break
      this.chunks.delete(oldest)
    }

    return chunk
  }
}

export interface StageGeoIPStreamOptions {
  updatedAt?: number
}

export interface ActivateGeoIPFileOptions {
  retainPrevious?: boolean
}

export const geoIPChunkStore = {
  getManifest,

  createSource(
    key: string,
    manifest: GeoIPFileManifest,
    memoryChunkCacheMax = DEFAULT_MEMORY_CHUNK_CACHE_MAX,
  ): MMDBByteSource {
    return new IndexedDBMMDBSource(key, manifest, memoryChunkCacheMax)
  },

  async stageStream(
    key: string,
    stream: ReadableStream<Uint8Array>,
    options: StageGeoIPStreamOptions = {},
  ): Promise<GeoIPFileManifest> {
    const generation =
      globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`

    stagedGenerations.add(generation)

    const reader = stream.getReader()
    let current = new Uint8Array(GEOIP_CHUNK_SIZE)
    let currentLength = 0
    let chunkCount = 0
    let size = 0
    let batch: Uint8Array[] = []
    let batchStart = 0

    const flush = async () => {
      if (batch.length === 0) return

      try {
        await writeChunks(key, generation, batchStart, batch)
      } catch (error) {
        throw new GeoIPChunkStoreError('storage', { cause: error })
      }

      batch = []
    }

    const appendChunk = async (chunk: Uint8Array) => {
      if (batch.length === 0) batchStart = chunkCount
      batch.push(chunk)
      chunkCount++

      if (batch.length >= WRITE_BATCH_SIZE) await flush()
    }

    try {
      while (true) {
        let part: ReadableStreamReadResult<Uint8Array>

        try {
          part = await reader.read()
        } catch (error) {
          throw new GeoIPChunkStoreError('stream', { cause: error })
        }

        if (part.done) break
        size += part.value.byteLength

        let sourceOffset = 0

        while (sourceOffset < part.value.byteLength) {
          const copied = Math.min(
            current.byteLength - currentLength,
            part.value.byteLength - sourceOffset,
          )

          current.set(part.value.subarray(sourceOffset, sourceOffset + copied), currentLength)
          currentLength += copied
          sourceOffset += copied

          if (currentLength === current.byteLength) {
            await appendChunk(current)
            current = new Uint8Array(GEOIP_CHUNK_SIZE)
            currentLength = 0
          }
        }
      }

      if (currentLength > 0) await appendChunk(current.slice(0, currentLength))
      await flush()

      if (size === 0 || chunkCount === 0) throw new GeoIPChunkStoreError('stream')

      return {
        chunkCount,
        chunkSize: GEOIP_CHUNK_SIZE,
        generation,
        size,
        updatedAt: options.updatedAt ?? Date.now(),
      }
    } catch (error) {
      await reader.cancel().catch(() => {})
      await deleteGeneration(key, generation).catch(() => {})
      stagedGenerations.delete(generation)
      throw error
    }
  },

  async activate(
    key: string,
    staged: GeoIPFileManifest,
    options: ActivateGeoIPFileOptions = {},
  ): Promise<GeoIPFileManifest> {
    const database = await openDatabase()
    let committed: GeoIPFileManifest | undefined

    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(MANIFEST_STORE, 'readwrite')
        const store = transaction.objectStore(MANIFEST_STORE)
        const request = store.get(key)

        request.onsuccess = () => {
          const current = isManifest(request.result) ? request.result : undefined

          committed = {
            ...staged,
            previousGeneration: options.retainPrevious ? current?.generation : undefined,
          }
          store.put(committed, key)
        }
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
        transaction.onabort = () => reject(transaction.error)
      })
    } catch (error) {
      throw new GeoIPChunkStoreError('storage', { cause: error })
    }

    if (!committed) throw new GeoIPChunkStoreError('storage')

    stagedGenerations.delete(committed.generation)
    sweptKeys.add(key)

    void deleteInactiveGenerations(key, committed.generation, committed.previousGeneration).catch(
      () => {},
    )

    return committed
  },

  async discard(key: string, generation: string) {
    try {
      await deleteGeneration(key, generation)
    } finally {
      stagedGenerations.delete(generation)
    }
  },

  async invalidate(key: string, generation: string) {
    const database = await openDatabase()

    return new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([MANIFEST_STORE, CHUNK_STORE], 'readwrite')
      const manifests = transaction.objectStore(MANIFEST_STORE)
      const request = manifests.get(key)
      const range = IDBKeyRange.bound(
        [key, generation, 0],
        [key, generation, Number.MAX_SAFE_INTEGER],
      )

      request.onsuccess = () => {
        const current = isManifest(request.result) ? request.result : undefined

        if (current?.generation === generation) manifests.delete(key)
      }
      transaction.objectStore(CHUNK_STORE).delete(range)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  },
}
