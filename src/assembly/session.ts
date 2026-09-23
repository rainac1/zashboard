import { activeBackend } from '@/store/setup'
import { watch } from 'vue'
import { can } from './backend'
import { fetchConfigs } from './config'
import { initConnections, stopConnections } from './connections'
import { fetchDaeRuntime } from './dae'
import { driver } from './driver'
import { initLogs, stopLogs } from './logs'
import { initSatistic, stopSatistic } from './overview'
import { fetchProxies } from './proxies'
import { fetchRules } from './rules'
import { probeActiveBackend } from './version'

const EVENT_DEBOUNCE = 400

let events: { close: () => void } | undefined
let refreshTimer: ReturnType<typeof setTimeout> | undefined

const scheduleRefresh = () => {
  clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    fetchProxies().catch(() => {})
    fetchRules().catch(() => {})
    fetchConfigs().catch(() => {})
  }, EVENT_DEBOUNCE)
}

const stopEvents = () => {
  clearTimeout(refreshTimer)
  refreshTimer = undefined
  events?.close()
  events = undefined
}

const initEvents = () => {
  stopEvents()

  const subscribe = driver().events?.subscribe

  if (!subscribe || !can('backendEvents')) return

  events = subscribe((kind) => {
    if (kind === 'generation.changed') scheduleRefresh()
  })
}

export const startBackendSession = async () => {
  stopConnections()
  stopLogs()
  stopSatistic()
  stopEvents()
  driver().reset?.()

  if (!activeBackend.value) {
    probeActiveBackend()
    return
  }

  await probeActiveBackend().catch(() => {})

  fetchConfigs()
  fetchProxies()
  fetchRules()
  initConnections()
  initLogs()
  initSatistic()
  initEvents()

  if (activeBackend.value.type === 'dae') {
    fetchDaeRuntime().catch(() => {})
  }
}

watch(activeBackend, startBackendSession, { immediate: true })
