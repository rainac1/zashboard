// sing-box 后端的概览统计组装:订阅 SubscribeStatus,把一条 Status 扇出给
// 多个订阅者(memory / traffic),以与 Clash WS 相同的 Stream 形状产出。
import { subscribeStream } from '@/api/singbox/subscriptions'
import type { Status } from '@/gen/daemon/started_service_pb'
import { shallowRef } from 'vue'
import type { MemorySample, MetricsDriver, Stream, TrafficSample } from '../driver/types'

type StatusListener = (status: Status) => void

const statusListeners = new Set<StatusListener>()
let statusHandle: { close: () => void } | null = null
let latestStatus: Status | null = null

const closeSharedStatusStream = () => {
  statusHandle?.close()
  statusHandle = null
  latestStatus = null
}

const ensureSharedStatusStream = () => {
  if (statusHandle) return

  statusHandle = subscribeStream<Status>('status', (status) => {
    latestStatus = status
    statusListeners.forEach((listener) => listener(status))
  })
}

const subscribeSingboxStatus = <T>(map: (status: Status) => T): Stream<T> => {
  const data = shallowRef<T>()
  const listener: StatusListener = (status) => {
    data.value = map(status)
  }

  statusListeners.add(listener)
  ensureSharedStatusStream()
  if (latestStatus) listener(latestStatus)

  return {
    data,
    close: () => {
      statusListeners.delete(listener)
      if (statusListeners.size === 0) closeSharedStatusStream()
    },
  }
}

// 后端切换 / 登出时丢弃共享状态流。
export const resetStatus = () => {
  statusListeners.clear()
  closeSharedStatusStream()
}

export const metricsDriver: MetricsDriver = {
  memory: () =>
    subscribeSingboxStatus<MemorySample>((status) => ({
      inuse: Number(status.memory),
      goroutines: status.goroutines,
    })),
  traffic: () =>
    subscribeSingboxStatus<TrafficSample>((status) => ({
      down: Number(status.downlink),
      up: Number(status.uplink),
      downTotal: Number(status.downlinkTotal),
      upTotal: Number(status.uplinkTotal),
    })),
  // sing-box 没有 honk 那种用户态运行时快照,能力表也不会点亮该入口。
  fetchRuntimeStats: async () => ({ outbounds: [] }),
}
