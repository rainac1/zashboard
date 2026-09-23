// sing-box API(gRPC daemon.StartedService)驱动。
// 具体实现放在 assembly/singbox/*,这里只按 Driver 契约拼装 —— 让 sing-box
// 的差异尽量留在 sing-box 专属文件里。
import { configDriver } from '@/assembly/singbox/config'
import {
  connectionAccessor,
  disconnect,
  disconnectAll,
  subscribeConnections,
} from '@/assembly/singbox/connections'
import { logsDriver } from '@/assembly/singbox/logs'
import { metricsDriver, resetStatus } from '@/assembly/singbox/metrics'
import { proxiesDriver, resetProxies } from '@/assembly/singbox/proxies'
import { rulesDriver } from '@/assembly/singbox/rules'
import { systemDriver } from '@/assembly/singbox/system'
import type { Driver } from './types'

export const singboxDriver: Driver = {
  type: 'singbox',

  reset: () => {
    resetProxies()
    resetStatus()
  },

  system: systemDriver,
  metrics: metricsDriver,
  proxies: proxiesDriver,
  rules: rulesDriver,
  config: configDriver,
  logs: logsDriver,

  connections: {
    accessor: connectionAccessor,
    subscribe: subscribeConnections,
    disconnect,
    disconnectAll,
    // sing-box 没有连接封锁端点。
    block: async () => {},
  },
}
