// sing-box 后端的系统能力:连通性探测、版本(含 API 版本)、启动时刻与 gRPC 专属动作。
// 存储同步 / 内核升级 / 面板升级等 mihomo 扩展在 sing-box 上没有对应端点,
// 能力表不会点亮这些入口,这里给出明确的拒绝以避免静默跑偏。
import { getSingboxClient, probeSingboxChannel } from '@/api/singbox/client'
import { apiVersion } from '../backend'
import type { SystemDriver } from '../driver/types'

const unsupported = (what: string) => () =>
  Promise.reject(new Error(`sing-box API does not support ${what}`))

export const systemDriver: SystemDriver = {
  probe: (backend, timeout, signal) => probeSingboxChannel(backend, timeout, signal),

  fetchVersion: async () => {
    const client = getSingboxClient()?.client
    if (!client) return ''

    const res = await client.getVersion({})

    apiVersion.value = res.apiVersion

    return res.version.includes('sing-box') ? res.version : `sing-box ${res.version}`
  },

  startedAt: async () => {
    const client = getSingboxClient()?.client
    if (!client) return 0

    try {
      const res = await client.getStartedAt({})

      return Number(res.startedAt)
    } catch {
      return 0
    }
  },

  upgradeCore: unsupported('upgrading core'),
  restartCore: unsupported('restarting core'),
  upgradeUI: unsupported('upgrading dashboard'),
  getStorage: unsupported('settings sync') as () => Promise<Record<string, unknown>>,
  setStorage: unsupported('settings sync'),
  deleteStorage: unsupported('settings sync'),
}
