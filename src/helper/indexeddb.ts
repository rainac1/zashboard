import { useStorage } from '@/composables/use-storage'
import { customBackgroundURL } from '@/store/settings'
import dayjs from 'dayjs'
import { computed, ref, watch } from 'vue'

const useIndexedDB = (dbKey: string) => {
  const cacheMap = new Map<string, string>()
  const openDatabase = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(dbKey, 1)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(dbKey)) {
          db.createObjectStore(dbKey, { keyPath: 'key' })
        }
      }
      request.onsuccess = () => {
        const db = request.result
        const store = db.transaction(dbKey, 'readonly').objectStore(dbKey)
        const cursorRequest = store.openCursor()

        cursorRequest.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result

          if (cursor) {
            cacheMap.set(cursor.key as string, cursor.value.value)
            cursor.continue()
          } else {
            resolve(request.result)
          }
        }
        cursorRequest.onerror = () => reject(cursorRequest.error)
      }
      request.onerror = () => reject(request.error)
    })

  const dbPromise = openDatabase()

  const executeTransaction = async <T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>,
  ) => {
    const db = await dbPromise
    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(dbKey, mode)
      const store = transaction.objectStore(dbKey)
      const request = operation(store)

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  const put = async (key: string, value: string) => {
    await dbPromise
    cacheMap.set(key, value)
    return executeTransaction('readwrite', (store) =>
      store.put({
        key,
        value,
      }),
    )
  }

  const get = async (key: string) => {
    await dbPromise
    return cacheMap.get(key)
  }

  const clear = async () => {
    await dbPromise
    cacheMap.clear()
    return executeTransaction('readwrite', (store) => store.clear())
  }

  const isExists = async (key: string) => {
    await dbPromise
    return cacheMap.has(key)
  }

  const del = async (key: string) => {
    await dbPromise
    cacheMap.delete(key)
    return executeTransaction('readwrite', (store) => store.delete(key))
  }

  const getAllKeys = async () => {
    await dbPromise
    return Array.from(cacheMap.keys())
  }

  return {
    put,
    get,
    del,
    getAllKeys,
    isExists,
    clear,
  }
}

const backgroundDB = useIndexedDB('base64')
const backgroundImageKey = 'background-image'

export const saveBase64ToIndexedDB = (val: string) => backgroundDB.put(backgroundImageKey, val)
export const getBase64FromIndexedDB = () => backgroundDB.get(backgroundImageKey)
export const deleteBase64FromIndexedDB = () => backgroundDB.clear()
export const LOCAL_IMAGE = 'local-image'

const date = dayjs().format('YYYY-MM-DD')
const backgroundInDB = ref('')
const getBackgroundInDB = async () => {
  backgroundInDB.value = (await getBase64FromIndexedDB()) || ''
}

watch(
  () => customBackgroundURL.value,
  () => {
    if (customBackgroundURL.value.includes(LOCAL_IMAGE)) {
      getBackgroundInDB()
    }
  },
  {
    immediate: true,
  },
)

const backgroundImageSource = computed(() => {
  if (!customBackgroundURL.value) {
    return ''
  }

  if (customBackgroundURL.value.includes(LOCAL_IMAGE)) {
    return backgroundInDB.value
  }

  const querySeparator = customBackgroundURL.value.includes('?') ? '&' : '?'
  return `${customBackgroundURL.value}${querySeparator}v=${date}`
})

export const backgroundImageLoaded = ref(false)
type BackgroundLoadCache = Record<string, { date: string }>
const backgroundLoadCache = useStorage<BackgroundLoadCache>(
  'cache/custom-background-image-load-status',
  {},
)

const getCachedBackgroundLoadStatus = (url: string) => {
  const entry = backgroundLoadCache.value[url]
  return entry?.date === date ? true : undefined
}

const cacheBackgroundLoadStatus = (url: string) => {
  backgroundLoadCache.value[url] = { date }
}

let backgroundLoadRequest = 0

watch(
  backgroundImageSource,
  (source) => {
    const request = ++backgroundLoadRequest
    backgroundImageLoaded.value = false

    if (!source) return

    const url = customBackgroundURL.value
    const cachedStatus = getCachedBackgroundLoadStatus(url)
    if (cachedStatus !== undefined) {
      backgroundImageLoaded.value = cachedStatus
      return
    }

    const image = new Image()
    image.onload = () => {
      if (request === backgroundLoadRequest) {
        backgroundImageLoaded.value = true
        cacheBackgroundLoadStatus(url)
      }
    }
    image.onerror = () => {
      if (request === backgroundLoadRequest) {
        backgroundImageLoaded.value = false
      }
    }
    image.src = source
  },
  { immediate: true },
)

export const backgroundImage = computed(() => {
  if (!backgroundImageLoaded.value) {
    return ''
  }

  return `background-image: url('${backgroundImageSource.value}');`
})

export interface ConnectionHistoryData {
  key: string
  download: number
  upload: number
  count: number
}

export enum ConnectionHistoryType {
  SourceIP = 'sourceIP',
  Destination = 'destination',
  Process = 'process',
  Outbound = 'outbound',
  ProxyGroup = 'proxyGroup',
}

const connectionHistoryDB = useIndexedDB('connection-history')

export const saveConnectionHistoryToIndexedDB = async (
  uuid: string,
  aggregationType: ConnectionHistoryType,
  data: ConnectionHistoryData[],
) => {
  const jsonData = JSON.stringify(data)
  return connectionHistoryDB.put(`${uuid}-${aggregationType}`, jsonData)
}

export const getConnectionHistoryFromIndexedDB = async (
  uuid: string,
  aggregationType: ConnectionHistoryType,
): Promise<ConnectionHistoryData[]> => {
  const jsonData = await connectionHistoryDB.get(`${uuid}-${aggregationType}`)
  if (!jsonData) {
    return []
  }
  try {
    return JSON.parse(jsonData) as ConnectionHistoryData[]
  } catch {
    return []
  }
}

export const clearConnectionHistoryFromIndexedDB = async () => {
  return connectionHistoryDB.clear()
}
