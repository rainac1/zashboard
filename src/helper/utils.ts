import { MIN_PROXY_CARD_WIDTH, PROXY_CARD_SIZE } from '@/constant'
import type { Backend, BackendType } from '@/types'
import { useMediaQuery } from '@vueuse/core'
import dayjs from 'dayjs'
import prettyBytes, { type Options } from 'pretty-bytes'

export const isPreferredDark = useMediaQuery('(prefers-color-scheme: dark)')
export const isMiddleScreen = useMediaQuery('(max-width: 768px)')
export const isPWA = (() => {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone
})()

export const prettyBytesHelper = (bytes: number, opts?: Options) => {
  // prettyBytes 对 NaN / Infinity 是抛错的。格式化函数几乎全在渲染函数里调用,
  // 一个脏字段抛出去就会毁掉整棵 vnode 树(而不只是这一格),故就地兜住。
  return prettyBytes(Number.isFinite(bytes) ? bytes : 0, {
    binary: false,
    ...opts,
  })
}

export const fromNow = (timestamp: string | number) => {
  return dayjs(timestamp).fromNow()
}

export const getDashboardSettingsFromStorage = () => {
  const settings: Record<string, string> = {}

  for (const key in localStorage) {
    if (key.startsWith('config/')) {
      settings[key] = localStorage.getItem(key) as string
    }
  }

  return settings
}

export const applyDashboardSettingsToStorage = (settings: Record<string, unknown>) => {
  for (const key in settings) {
    if (key.startsWith('config/')) {
      localStorage.setItem(key, settings[key] as string)
    }
  }
}

export const exportSettings = () => {
  const settings = getDashboardSettingsFromStorage()
  const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'zashboard-settings'
  a.click()
  URL.revokeObjectURL(url)
}

export const resetSettings = () => {
  const keysToReset = Object.keys(localStorage).filter((key) => {
    return key.startsWith('config/')
  })

  keysToReset.forEach((key) => localStorage.removeItem(key))
  window.location.reload()
}

export const getUrlFromBackend = (end: {
  protocol: string
  host: string
  port: string
  secondaryPath?: string
}) => {
  return `${end.protocol}://${end.host}:${end.port}${end.secondaryPath || ''}`
}

// sing-box 后端复用顶层连接字段作为 gRPC baseUrl(secondaryPath 留空)。
export const getSingboxUrlFromBackend = (
  end: Pick<Backend, 'type' | 'protocol' | 'host' | 'port'>,
) => {
  if (end.type !== 'singbox' || !end.host) return ''
  return `${end.protocol}://${end.host}:${end.port}`
}

export const getSingboxSecret = (end: Pick<Backend, 'type' | 'password'>) =>
  end.type === 'singbox' ? end.password || '' : ''

// 探测 / 诊断打的那个地址:sing-box 走 gRPC baseUrl,其余走 Clash REST 根路径。
export const getBackendProbeUrl = (end: Omit<Backend, 'uuid'>) =>
  end.type === 'singbox' ? getSingboxUrlFromBackend(end) : getUrlFromBackend(end)

export const getLabelFromBackend = (end: Omit<Backend, 'uuid'>) => {
  return end.label || `${end.host}:${end.port}`
}

export const getMinCardWidth = (size: PROXY_CARD_SIZE) => {
  return size === PROXY_CARD_SIZE.LARGE ? MIN_PROXY_CARD_WIDTH.LARGE : MIN_PROXY_CARD_WIDTH.SMALL
}

export const PROXIES_PARENT_CLASS = 'proxies-scrollable-parent'

// 新格式 protocol=http/https 优先,旧格式 http / https 标记参数仍保留兼容,最后兜底当前页面协议。
const getProtocolFromQuery = (query: URLSearchParams) => {
  const protocol = query.get('protocol')

  if (protocol === 'http' || protocol === 'https') {
    return protocol
  }
  if (query.get('http')) {
    return 'http'
  }
  if (query.get('https')) {
    return 'https'
  }

  return window.location.protocol.replace(':', '')
}

export const getBackendFromUrl = () => {
  const query = new URLSearchParams(
    window.location.search || location.hash.match(/\?.*$/)?.[0]?.replace('?', ''),
  )

  if (query.has('hostname')) {
    return {
      // 后端类型:'singbox' 走 sing-box API(gRPC),其余(含缺省)按 'clash' 处理。
      type: (query.get('type') === 'singbox' ? 'singbox' : 'clash') as BackendType,
      protocol: getProtocolFromQuery(query),
      secondaryPath: query.get('secondaryPath') || '',
      host: query.get('hostname') as string,
      port: query.get('port') as string,
      password: query.get('secret') || '',
      label: query.get('label') || '',
      disableUpgradeCore:
        query.get('disableUpgradeCore') === '1' || query.get('disableUpgradeCore') === 'core',
      disableTunMode: query.get('disableTunMode') === '1' || query.get('disableTunMode') === 'tun',
    }
  }
  return null
}
