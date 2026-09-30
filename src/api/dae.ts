import type { ProbeResult } from '@/helper/connectivity'
import { getUrlFromBackend } from '@/helper/utils'
import { activeBackend } from '@/store/setup'
import type {
  Backend,
  DaeCapabilities,
  DaeCloseResult,
  DaeConfigSnapshot,
  DaeConfigSourceContent,
  DaeConfigValidation,
  DaeConnectionList,
  DaeDatapath,
  DaeDeleteResult,
  DaeDnsCacheList,
  DaeDnsLogList,
  DaeDnsQueryResponse,
  DaeDnsRuleList,
  DaeFlowDetail,
  DaeFlowList,
  DaeGeoData,
  DaeGroup,
  DaeGroupConfigDocument,
  DaeGroupSummary,
  DaeJsonPatchOperation,
  DaeMemoryHistory,
  DaeNode,
  DaeNodeList,
  DaeOperation,
  DaeOperationAccepted,
  DaeProbeRequest,
  DaeProvider,
  DaeProviderCreate,
  DaeProviderList,
  DaeRoutingTrace,
  DaeRuleList,
  DaeRuntime,
  DaeRuntimeMemory,
  DaeRuntimeOutbounds,
  DaeRuntimeSettings,
  DaeRuntimeSettingsPatch,
  DaeSelectionResult,
  DaeTraceInput,
  DaeTrafficHistory,
  DaeVersion,
} from '@/types'
import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios'
import { createParser } from 'eventsource-parser'
import {
  DaeAuthError,
  daeAuthHeaders,
  daeBearer,
  dropDaeSession,
  ensureDaeSession,
  fetchDaeDiscovery,
  isDaePasswordMode,
} from './dae-auth'
import './http'

export { fetchDaeDiscovery }

const V1 = '/api/v1'

const get = <T>(path: string, config?: AxiosRequestConfig) =>
  axios.get<T>(`${V1}${path}`, config).then((res) => res.data)

const post = <T>(path: string, body?: unknown, config?: AxiosRequestConfig) =>
  axios.post<T>(`${V1}${path}`, body, config).then((res) => res.data)

const put = <T>(path: string, body?: unknown, config?: AxiosRequestConfig) =>
  axios.put<T>(`${V1}${path}`, body, config).then((res) => res.data)

const patch = <T>(path: string, body?: unknown, config?: AxiosRequestConfig) =>
  axios.patch<T>(`${V1}${path}`, body, config).then((res) => res.data)

const del = <T>(path: string, config?: AxiosRequestConfig) =>
  axios.delete<T>(`${V1}${path}`, config).then((res) => res.data)

const seg = (value: string) => encodeURIComponent(value)

const OPERATION_POLL_INTERVAL = 500
const OPERATION_TIMEOUT = 60000

export const fetchDaeOperationAPI = (operationId: string) =>
  get<DaeOperation>(`/operations/${seg(operationId)}`)

export const waitForDaeOperation = async (
  accepted: DaeOperationAccepted,
  timeout = OPERATION_TIMEOUT,
): Promise<DaeOperation> => {
  const deadline = Date.now() + timeout

  for (;;) {
    const operation = await fetchDaeOperationAPI(accepted.operation_id)

    if (operation.status === 'succeeded') return operation
    if (operation.status === 'failed') {
      throw new Error(operation.error?.message || 'operation failed')
    }
    if (Date.now() > deadline) {
      throw new Error('operation timeout')
    }

    await new Promise((resolve) => setTimeout(resolve, OPERATION_POLL_INTERVAL))
  }
}

const settled = (accepted: Promise<DaeOperationAccepted>) => accepted.then(waitForDaeOperation)

const settledResult = async <T>(response: Promise<AxiosResponse>) => {
  const { status, data } = await response

  if (status !== 202) return data as T

  const operation = await waitForDaeOperation(data as DaeOperationAccepted)

  return operation.result as unknown as T
}

export const fetchDaeVersionAPI = () => get<DaeVersion>('/version')

export const fetchDaeCapabilitiesAPI = () => get<DaeCapabilities>('/capabilities')

export const fetchDaeRuntimeAPI = () => get<DaeRuntime>('/runtime')

export const fetchDaeRuntimeMemoryAPI = () => get<DaeRuntimeMemory>('/runtime/memory')

export const fetchDaeRuntimeOutboundsAPI = () => get<DaeRuntimeOutbounds>('/runtime/outbounds')

export const fetchDaeRuntimeSettingsAPI = () => get<DaeRuntimeSettings>('/runtime/settings')

export const patchDaeRuntimeSettingsAPI = (payload: DaeRuntimeSettingsPatch) =>
  patch<DaeRuntimeSettings>('/runtime/settings', payload)

export const fetchDaeTrafficHistoryAPI = (params?: {
  window_seconds?: number
  max_points?: number
}) => get<DaeTrafficHistory>('/runtime/traffic/history', { params })

export const fetchDaeMemoryHistoryAPI = (params?: {
  window_seconds?: number
  max_points?: number
}) => get<DaeMemoryHistory>('/runtime/memory/history', { params })

export const fetchDaeGroupsAPI = () => get<DaeGroupSummary[]>('/groups')

export const fetchDaeGroupAPI = (groupId: string) => get<DaeGroup>(`/groups/${seg(groupId)}`)

export const selectDaeGroupMemberAPI = (
  groupId: string,
  memberId: string,
  network: 'tcp' | 'udp' | 'both' = 'both',
) =>
  put<DaeSelectionResult>(`/groups/${seg(groupId)}/selection`, {
    member_id: memberId,
    network,
  })

export const patchDaeGroupConfigAPI = (
  groupId: string,
  revision: string,
  operations: DaeJsonPatchOperation[],
) =>
  settledResult<DaeGroupConfigDocument | null>(
    axios.patch(`${V1}/groups/${seg(groupId)}/config`, operations, {
      headers: {
        'Content-Type': 'application/json-patch+json',
        'If-Match': `"${revision}"`,
      },
    }),
  )

export const fetchDaeNodesAPI = (params?: { limit?: number; cursor?: string }) =>
  get<DaeNodeList>('/nodes', { params })

export const fetchDaeNodeAPI = (nodeId: string) => get<DaeNode>(`/nodes/${seg(nodeId)}`)

export const createDaeNodeAPI = (name: string, link: string) =>
  settledResult<DaeNode>(axios.post(`${V1}/nodes`, { name, link }))

export const deleteDaeNodeAPI = (nodeId: string) =>
  settledResult<DaeDeleteResult>(axios.delete(`${V1}/nodes/${seg(nodeId)}`))

export const fetchDaeProvidersAPI = (params?: { limit?: number; cursor?: string }) =>
  get<DaeProviderList>('/providers', { params })

export const fetchDaeProviderAPI = (providerId: string) =>
  get<DaeProvider>(`/providers/${seg(providerId)}`)

export const createDaeProviderAPI = (payload: DaeProviderCreate) =>
  settledResult<DaeProvider>(axios.post(`${V1}/providers`, payload))

export const deleteDaeProviderAPI = (providerId: string) =>
  settledResult<DaeDeleteResult>(axios.delete(`${V1}/providers/${seg(providerId)}`))

export const refreshDaeProviderAPI = (providerId: string) =>
  settled(post<DaeOperationAccepted>(`/providers/${seg(providerId)}/refresh`))

export const fetchDaeRulesAPI = () => get<DaeRuleList>('/rules')

export const fetchDaeConnectionsAPI = (params?: { type?: 'tcp' | 'udp' | 'all'; limit?: number }) =>
  get<DaeConnectionList>('/connections', { params: { detail: 'full', ...params } })

export const closeDaeConnectionAPI = (id: string) => del(`/connections/${seg(id)}`)

export const closeDaeConnectionsAPI = (filter?: { type?: 'tcp' | 'udp'; src?: string }) => {
  const params: Record<string, string | boolean> = {}

  if (filter?.type) params.type = filter.type
  if (filter?.src) params.src = filter.src
  if (!filter?.type && !filter?.src) params.all = true

  return del<DaeCloseResult>('/connections', { params })
}

export const fetchDaeFlowsAPI = (params?: {
  network?: 'tcp' | 'udp'
  state?: string
  connection_id?: string
  limit?: number
  cursor?: string
  detail?: 'summary' | 'full'
}) => get<DaeFlowList>('/flows', { params })

export const fetchDaeFlowAPI = (flowId: string) => get<DaeFlowDetail>(`/flows/${seg(flowId)}`)

export const createDaeProbeAPI = (payload: DaeProbeRequest) =>
  post<DaeOperationAccepted>('/probes', payload)

export const startDaeReloadAPI = () => settled(post<DaeOperationAccepted>('/operations/reload'))

export const suspendDaeAPI = () => settled(post<DaeOperationAccepted>('/operations/suspend', {}))

export const resumeDaeAPI = () => settled(post<DaeOperationAccepted>('/operations/resume', {}))

export const fetchDaeGeoDataAPI = () => get<DaeGeoData>('/geodata')

export const updateDaeGeoDataAPI = () => settled(post<DaeOperationAccepted>('/geodata/update'))

export const flushDaeDnsCacheAPI = () => post('/dns/cache/flush')

export const queryDaeDnsAPI = (payload: {
  domain: string
  type?: string[]
  upstream?: string
  cache_mode?: 'normal' | 'bypass'
}) => post<DaeDnsQueryResponse>('/dns/query', payload)

export const fetchDaeDnsRulesAPI = () => get<DaeDnsRuleList>('/dns/rules')

export const fetchDaeDnsCacheAPI = (params?: {
  name?: string
  type?: string
  include_expired?: boolean
  limit?: number
  cursor?: string
}) => get<DaeDnsCacheList>('/dns/cache', { params: { detail: 'full', ...params } })

export const deleteDaeDnsCacheEntryAPI = (entryId: string) =>
  del<DaeDeleteResult>(`/dns/cache/${seg(entryId)}`)

export const deleteDaeDnsCacheNameAPI = (name: string, type?: string) =>
  del<DaeDeleteResult>('/dns/cache', { params: type ? { name, type } : { name } })

export const fetchDaeDnsLogAPI = (params?: {
  name?: string
  type?: string
  src?: string
  limit?: number
  cursor?: string
}) => get<DaeDnsLogList>('/dns/log', { params })

export const traceDaeRoutingAPI = (input: DaeTraceInput) =>
  post<DaeRoutingTrace>('/routing/trace', { input, resolve: 'none' })

export const fetchDaeDatapathAPI = () =>
  get<DaeDatapath>('/datapath', { params: { detail: 'full' } })

export const fetchDaeConfigAPI = () => get<DaeConfigSnapshot>('/config')

export const fetchDaeConfigSourceAPI = (sourceId: string) =>
  get<DaeConfigSourceContent>(`/config/sources/${seg(sourceId)}`)

export const createDaeConfigSourceAPI = (path: string, content: string) =>
  settled(post<DaeOperationAccepted>('/config/sources', { path, content }))

export const validateDaeConfigAPI = (
  mode: 'syntax' | 'full',
  sources: { id: string; path?: string; content: string }[],
) => post<DaeConfigValidation>('/config/validate', { mode, sources })

export const saveDaeConfigSourceAPI = (sourceId: string, sha256: string, content: string) =>
  settled(
    put<DaeOperationAccepted>(
      `/config/sources/${seg(sourceId)}`,
      { content },
      { headers: { 'If-Match': `"${sha256}"` } },
    ),
  )

export type DaeSseHandler = (event: string, data: string) => void

const SSE_RETRY_DELAY = 3000
const SSE_MAX_BUFFER = 1024 * 1024
const EVENT_CURSOR_EXPIRED = 409

export const createDaeEventSource = (
  path: string,
  searchParams: Record<string, string>,
  onEvent: DaeSseHandler,
) => {
  const backend = activeBackend.value!
  const url = new URL(`${getUrlFromBackend(backend)}${V1}${path}`)

  Object.entries(searchParams).forEach(([key, value]) => {
    if (value) url.searchParams.append(key, value)
  })

  const controller = new AbortController()
  let closed = false
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let retryDelay = SSE_RETRY_DELAY
  let lastEventId = ''

  const parser = createParser({
    maxBufferSize: SSE_MAX_BUFFER,
    onId: (id) => (lastEventId = id),
    onRetry: (delay) => (retryDelay = delay),
    onEvent: (message) => onEvent(message.event ?? 'message', message.data),
  })

  const connect = async () => {
    parser.reset()

    try {
      const headers: Record<string, string> = {
        Accept: 'text/event-stream',
        ...(await daeAuthHeaders(backend)),
      }

      if (lastEventId) headers['Last-Event-ID'] = lastEventId

      const response = await fetch(url.toString(), { headers, signal: controller.signal })

      if (response.status === 401 && isDaePasswordMode(backend)) dropDaeSession(backend)
      if (response.status === EVENT_CURSOR_EXPIRED) lastEventId = ''
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`)

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      for (;;) {
        const { done, value } = await reader.read()

        if (done) break

        parser.feed(decoder.decode(value, { stream: true }))
      }
    } catch {}

    if (!closed) retryTimer = setTimeout(connect, retryDelay)
  }

  connect()

  return {
    close: () => {
      closed = true
      clearTimeout(retryTimer)
      controller.abort()
    },
  }
}

export const probeDaeChannel = async (
  backend: Backend,
  timeout: number,
  signal?: AbortSignal,
  authenticate = false,
): Promise<ProbeResult> => {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)
  const onAbort = () => controller.abort()

  signal?.addEventListener('abort', onAbort, { once: true })

  const startAt = Date.now()
  const latency = () => Date.now() - startAt

  const fetchVersion = (token: string) =>
    fetch(`${getUrlFromBackend(backend)}${V1}/version`, {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    })

  const probePasswordMode = async () => {
    const discovery = await fetchDaeDiscovery(backend, controller.signal)

    if (discovery.auth.mode === 'password') return { ok: true as const, latency: latency() }

    throw new DaeAuthError('token_mode', 0, 'dae: backend is not in password mode')
  }

  try {
    const passwordMode = isDaePasswordMode(backend)
    let token = backend.password

    if (passwordMode) {
      token = authenticate ? await ensureDaeSession(backend, true, true) : daeBearer(backend)

      if (!token) return await probePasswordMode()
    }

    const res = await fetchVersion(token)

    if (res.ok) return { ok: true, latency: latency() }

    if (res.status === 401 && passwordMode && !authenticate) {
      dropDaeSession(backend)
      return await probePasswordMode()
    }

    return {
      ok: false,
      latency: latency(),
      kind: res.status === 401 ? 'unauthorized' : 'http',
      message: `HTTP ${res.status}`,
    }
  } catch (e) {
    if (e instanceof DaeAuthError) {
      return {
        ok: false,
        latency: latency(),
        kind: e.status >= 500 ? 'http' : 'unauthorized',
        message: `${e.message} (${e.code})`,
      }
    }

    return {
      ok: false,
      latency: latency(),
      kind: controller.signal.aborted ? 'timeout' : 'network',
      message: e instanceof Error ? e.message : String(e),
    }
  } finally {
    clearTimeout(timeoutId)
    signal?.removeEventListener('abort', onAbort)
  }
}
