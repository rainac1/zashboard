import type { HonkStats } from '@/types'
import { ref, shallowRef, watch } from 'vue'
import { can } from './backend'
import { activeConnections, downloadTotal, uploadTotal } from './connections'
import { driver } from './driver'

const trafficStream = () => driver().metrics.traffic()

const memoryStream = () => driver().metrics.memory()

export interface HistoryPoint {
  name: number
  value: [number, number]
  init?: boolean
}

export const timeSaved = 60
const bufferPoints = 2
const savedPoints = timeSaved + bufferPoints

const makeInitValue = (): HistoryPoint[] => {
  const now = Date.now()

  return new Array(savedPoints).fill(0).map((_, i) => {
    const timestamp = now - (savedPoints - 1 - i) * 1000

    return { name: timestamp, value: [timestamp, 0] as [number, number], init: true }
  })
}

export const memory = ref<number>(0)
export const goroutines = ref<number>(0)
export const memoryHistory = ref(makeInitValue())
export const connectionsHistory = ref(makeInitValue())

export const downloadSpeed = ref<number>(0)
export const uploadSpeed = ref<number>(0)
export const downloadSpeedHistory = ref(makeInitValue())
export const uploadSpeedHistory = ref(makeInitValue())

let cancel: (() => void) | undefined

const toHistoryPoints = (samples: { at: number; value: number }[]): HistoryPoint[] =>
  samples
    .filter((sample) => Number.isFinite(sample.at))
    .slice(-savedPoints)
    .map((sample) => ({ name: sample.at, value: [sample.at, sample.value] as [number, number] }))

const seedHistory = async () => {
  const history = driver().metrics.history

  if (!history || !can('metricsHistory')) return

  try {
    const samples = await history()
    const download = toHistoryPoints(samples.download)

    if (!download.length) return

    downloadSpeedHistory.value = download
    uploadSpeedHistory.value = toHistoryPoints(samples.upload)
    memoryHistory.value = toHistoryPoints(samples.memory)
    connectionsHistory.value = toHistoryPoints(samples.connections)
  } catch {}
}

export const initSatistic = () => {
  stopSatistic()

  seedHistory()

  const { data: memoryWsData, close: memoryWsClose } = memoryStream()
  const unwatchMemory = watch(
    () => memoryWsData.value,
    (data) => {
      if (!data) return
      const timestamp = Date.now().valueOf()

      if (data.inuse === 0) {
        return
      }

      memory.value = data.inuse
      goroutines.value = data.goroutines ?? 0
      memoryHistory.value.push({
        value: [timestamp, data.inuse],
        name: timestamp,
      })
      connectionsHistory.value.push({
        value: [timestamp, activeConnections.value.length],
        name: timestamp,
      })

      memoryHistory.value = memoryHistory.value.slice(-1 * savedPoints)
      connectionsHistory.value = connectionsHistory.value.slice(-1 * savedPoints)
    },
  )

  const { data: trafficWsData, close: trafficWsClose } = trafficStream()
  const unwatchTraffic = watch(
    () => trafficWsData.value,
    (data) => {
      if (!data) return

      const timestamp = Date.now().valueOf()

      downloadSpeed.value = data.down
      uploadSpeed.value = data.up
      // sing-box 的总量随统计流下发;clash 的总量由连接 WS 消息携带,
      // 在 assembly/connections 写入,此处字段缺失时不覆盖。
      if (data.downTotal != null && data.upTotal != null) {
        downloadTotal.value = data.downTotal
        uploadTotal.value = data.upTotal
      }

      downloadSpeedHistory.value.push({
        value: [timestamp, data.down],
        name: timestamp,
      })
      uploadSpeedHistory.value.push({
        value: [timestamp, data.up],
        name: timestamp,
      })

      downloadSpeedHistory.value = downloadSpeedHistory.value.slice(-1 * savedPoints)
      uploadSpeedHistory.value = uploadSpeedHistory.value.slice(-1 * savedPoints)
    },
  )

  cancel = () => {
    memoryWsClose()
    trafficWsClose()
    unwatchMemory()
    unwatchTraffic()
  }
}

export const stopSatistic = () => {
  cancel?.()
  cancel = undefined
  memory.value = 0
  goroutines.value = 0
  downloadSpeed.value = 0
  uploadSpeed.value = 0
  downloadSpeedHistory.value = makeInitValue()
  uploadSpeedHistory.value = makeInitValue()
  memoryHistory.value = makeInitValue()
  connectionsHistory.value = makeInitValue()
}

export const honkStats = shallowRef<HonkStats>()

const POLL_INTERVAL = 5000

let timer: ReturnType<typeof setInterval> | undefined

export const fetchHonkStats = async () => {
  if (!can('runtimeStats')) {
    honkStats.value = undefined
    return
  }

  try {
    honkStats.value = await driver().metrics.fetchRuntimeStats()
  } catch {
    honkStats.value = undefined
  }
}

export const startHonkStats = () => {
  if (timer) return

  fetchHonkStats()
  timer = setInterval(fetchHonkStats, POLL_INTERVAL)
}

export const stopHonkStats = () => {
  if (timer) {
    clearInterval(timer)
    timer = undefined
  }
  honkStats.value = undefined
}
