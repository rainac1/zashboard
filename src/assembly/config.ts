import type { Config, DNSQuery } from '@/types'
import { ref } from 'vue'
import { driver } from './driver'

export const defaultConfig: Config = {
  port: 0,
  'socks-port': 0,
  'redir-port': 0,
  'tproxy-port': 0,
  'mixed-port': 0,
  'allow-lan': false,
  'bind-address': '',
  mode: '',
  'mode-list': [],
  modes: [],
  'log-level': '',
  ipv6: false,
  tun: {
    enable: false,
    stack: '',
  },
}

export const configs = ref<Config>({ ...defaultConfig })

export const fetchConfigs = async () => {
  configs.value = await driver().config.fetch()
}

export const updateConfigs = async (cfg: Record<string, string | boolean | object | number>) => {
  await driver().config.patch(cfg)
  fetchConfigs()
}

export const reloadConfigs = () => driver().config.reload()

export const loadConfigs = (config: { path?: string; payload?: string }, force?: boolean) =>
  driver().config.load(config, force)

export const updateGeoData = () => driver().config.updateGeoData()

export const flushFakeIP = () => driver().config.flushFakeIP()

export const flushDNSCache = () => driver().config.flushDNSCache()

export const queryDNS = (params: { name: string; type: string }): Promise<DNSQuery> =>
  driver().config.queryDNS(params)
