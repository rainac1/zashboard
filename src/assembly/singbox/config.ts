// sing-box 后端的 config 组装:仅暴露 clash-mode,其余配置项保持默认。
// 把 gRPC getClashModeStatus 的结果转换成 Clash 的 Config 形状。
import { getSingboxClient } from '@/api/singbox/client'
import type { Config, DNSQuery } from '@/types'
import { defaultConfig } from '../config'
import type { ConfigDriver } from '../driver/types'

const fetchConfig = async (): Promise<Config> => {
  const client = getSingboxClient()?.client
  if (!client) return { ...defaultConfig }

  const status = await client.getClashModeStatus({})

  return {
    ...defaultConfig,
    mode: status.currentMode,
    'mode-list': status.modeList,
    modes: status.modeList,
  }
}

const unsupported = (what: string) => () =>
  Promise.reject(new Error(`sing-box API does not support ${what}`))

export const configDriver: ConfigDriver = {
  fetch: fetchConfig,
  patch: async (cfg) => {
    if (typeof cfg.mode !== 'string') return
    const client = getSingboxClient()?.client
    if (!client) return
    await client.setClashMode({ mode: cfg.mode })
  },
  reload: unsupported('reloading config'),
  load: unsupported('loading config'),
  updateGeoData: unsupported('updating geo data'),
  flushFakeIP: unsupported('flushing fake IP'),
  flushDNSCache: unsupported('flushing DNS cache'),
  queryDNS: unsupported('DNS query') as () => Promise<DNSQuery>,
}
