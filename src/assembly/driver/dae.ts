import {
  closeDaeConnectionAPI,
  closeDaeConnectionsAPI,
  createDaeEventSource,
  createDaeProbeAPI,
  fetchDaeConnectionsAPI,
  fetchDaeFlowsAPI,
  fetchDaeGroupAPI,
  fetchDaeGroupsAPI,
  fetchDaeMemoryHistoryAPI,
  fetchDaeNodesAPI,
  fetchDaeProvidersAPI,
  fetchDaeRulesAPI,
  fetchDaeRuntimeAPI,
  fetchDaeRuntimeMemoryAPI,
  fetchDaeRuntimeOutboundsAPI,
  fetchDaeTrafficHistoryAPI,
  fetchDaeVersionAPI,
  flushDaeDnsCacheAPI,
  probeDaeChannel,
  queryDaeDnsAPI,
  refreshDaeProviderAPI,
  selectDaeGroupMemberAPI,
  startDaeReloadAPI,
  updateDaeGeoDataAPI,
  waitForDaeOperation,
} from '@/api/dae'
import { proxyMap, proxyProviederList } from '@/assembly/proxies/state'
import { IPV6_TEST_URL, LOG_LEVEL } from '@/constant'
import { showNotification } from '@/helper/notification'
import type {
  Connection,
  DaeConnection,
  DaeConnectionRawMessage,
  DaeDnsQueryResult,
  DaeFlowSummary,
  DaeGroup,
  DaeHealthObservation,
  DaeLogRecord,
  DaeNode,
  DaeProbeRequest,
  DaeProbeResult,
  DaeProvider,
  DaeRuntime,
  DNSQuery,
  History,
  Proxy,
  ProxyProvider,
} from '@/types'
import axios from 'axios'
import pLimit from 'p-limit'
import { shallowRef, watch } from 'vue'
import type {
  ConnectionAccessor,
  ConnectionsPayload,
  Driver,
  MemorySample,
  MetricsHistory,
  ProxiesPayload,
  RulesPayload,
  Stream,
  TrafficSample,
} from './types'

const unsupported = (feature: string) => Promise.reject(new Error(`dae: ${feature} unsupported`))

const toNumber = (value: string | number | null | undefined) => {
  const parsed = typeof value === 'string' ? Number(value) : value

  return Number.isFinite(parsed) ? (parsed as number) : 0
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const POLICY_TYPE: Record<string, string> = {
  selector: 'Selector',
  urltest: 'URLTest',
  loadbalance: 'LoadBalance',
  fallback: 'Fallback',
  random: 'LoadBalance',
  score: 'URLTest',
}

const DNS_RECORD_TYPE: Record<string, number> = {
  A: 1,
  NS: 2,
  CNAME: 5,
  SOA: 6,
  PTR: 12,
  MX: 15,
  TXT: 16,
  AAAA: 28,
  SRV: 33,
  SVCB: 64,
  HTTPS: 65,
  CAA: 257,
}

const nameById = new Map<string, string>()

const assignNames = (entities: { id: string; name: string }[]) => {
  const counts = new Map<string, number>()
  const taken = new Set<string>()

  nameById.clear()

  for (const entity of entities) {
    const base = entity.name || entity.id
    let seen = counts.get(base) ?? 0
    let name = base

    while (taken.has(name)) name = `${base} (${++seen + 1})`

    counts.set(base, seen)
    taken.add(name)
    nameById.set(entity.id, name)
  }
}

const displayName = (id: string) => nameById.get(id) ?? id

const pickHealth = (health: DaeHealthObservation[]) => {
  const tcp = health.find((item) => item.transport === 'tcp')

  return tcp ?? health[0]
}

const toHistory = (health: DaeHealthObservation[]): History => {
  const observation = pickHealth(health)

  if (!observation) return []

  return [
    {
      time: observation.observed_at,
      delay: observation.state === 'healthy' ? Math.round(observation.latency_ms ?? 0) : 0,
    },
  ]
}

const nodeToProxy = (node: DaeNode): Proxy => ({
  id: node.id,
  name: displayName(node.id),
  type: node.protocol || 'Unknown',
  history: toHistory(node.health),
  extra: {},
  now: '',
  icon: '',
})

const groupToProxy = (group: DaeGroup): Proxy => {
  const selection = group.runtime.selection.tcp ?? group.runtime.selection.udp

  return {
    id: group.id,
    name: displayName(group.id),
    type: POLICY_TYPE[group.policy.kind] ?? 'Selector',
    history: toHistory(group.runtime.health),
    extra: {},
    all: group.members.map((member) => displayName(member.id)),
    now: selection ? displayName(selection.member_id) : '',
    icon: group.icon || '',
    testUrl: group.config.check_url || undefined,
    selectable: group.capabilities.can_select,
  }
}

const PROVIDER_VEHICLE: Record<string, ProxyProvider['vehicleType']> = {
  subscription: 'HTTP',
  inline: 'Inline',
  file: 'File',
}

const providerToProxyProvider = (provider: DaeProvider, nodes: DaeNode[]): ProxyProvider => ({
  id: provider.id,
  name: provider.name,
  proxies: nodes.filter((node) => node.provider_id === provider.id).map(nodeToProxy),
  testUrl: '',
  updatedAt: provider.updated_at || '',
  vehicleType: PROVIDER_VEHICLE[provider.kind] ?? 'File',
  subscriptionInfo: provider.traffic
    ? {
        Upload: toNumber(provider.traffic.upload_bytes),
        Download: toNumber(provider.traffic.download_bytes),
        Total: toNumber(provider.traffic.total_bytes),
        Expire: provider.expires_at
          ? Math.floor(new Date(provider.expires_at).getTime() / 1000)
          : 0,
      }
    : undefined,
})

const PAGE_SIZE = 1000

const fetchAllPages = async <P extends { next_cursor: string | null }, T>(
  fetchPage: (params: { limit: number; cursor?: string }) => Promise<P>,
  pick: (page: P) => T[],
) => {
  const items: T[] = []
  let cursor: string | undefined

  do {
    const page = await fetchPage({ limit: PAGE_SIZE, cursor })

    items.push(...pick(page))
    cursor = page.next_cursor ?? undefined
  } while (cursor)

  return items
}

const fetchAllNodes = () => fetchAllPages(fetchDaeNodesAPI, (page) => page.nodes)

const fetchAllProviders = () => fetchAllPages(fetchDaeProvidersAPI, (page) => page.providers)

export const daeGroupDetails = shallowRef<DaeGroup[]>([])
export const daeNodeList = shallowRef<DaeNode[]>([])
export const daeProviderList = shallowRef<DaeProvider[]>([])

const fetchProxies = async (): Promise<ProxiesPayload> => {
  const [summaries, nodes, providers] = await Promise.all([
    fetchDaeGroupsAPI(),
    fetchAllNodes(),
    fetchAllProviders().catch(() => [] as DaeProvider[]),
  ])

  const groups = await Promise.all(summaries.map((summary) => fetchDaeGroupAPI(summary.id)))

  assignNames([...groups, ...nodes])

  daeGroupDetails.value = groups
  daeNodeList.value = nodes
  daeProviderList.value = providers

  const proxies: Record<string, Proxy> = {}

  for (const node of nodes) {
    proxies[displayName(node.id)] = nodeToProxy(node)
  }
  for (const group of groups) {
    proxies[displayName(group.id)] = groupToProxy(group)
  }

  return {
    proxies,
    providers: providers.map((provider) => providerToProxyProvider(provider, nodes)),
  }
}

const PROBE_WINDOW = 60000
const PROBE_QUOTA = 25
const PROBE_CONCURRENCY = 3
const PROBE_RETRY_LIMIT = 8
const PROBE_DEADLINE = 180000

const probeLimit = pLimit(PROBE_CONCURRENCY)
const probeStamps: number[] = []

const awaitProbeQuota = async () => {
  for (;;) {
    const now = Date.now()

    while (probeStamps.length && now - probeStamps[0] > PROBE_WINDOW) probeStamps.shift()

    if (probeStamps.length < PROBE_QUOTA) {
      probeStamps.push(now)
      return
    }

    await sleep(PROBE_WINDOW - (now - probeStamps[0]) + 50)
  }
}

const retryAfterMs = (error: unknown) => {
  if (!axios.isAxiosError(error)) return 0

  const status = error.response?.status

  if (status !== 429 && status !== 503) return 0

  const header = Number(error.response?.headers?.['retry-after'])

  return Number.isFinite(header) && header > 0 ? header * 1000 : 1000
}

const runProbe = (payload: DaeProbeRequest) =>
  probeLimit(async () => {
    const deadline = Date.now() + PROBE_DEADLINE
    let attempt = 0

    for (;;) {
      await awaitProbeQuota()

      try {
        const operation = await waitForDaeOperation(await createDaeProbeAPI(payload))

        return operation.result as unknown as DaeProbeResult
      } catch (e) {
        const wait = retryAfterMs(e)

        if (!wait || attempt >= PROBE_RETRY_LIMIT || Date.now() + wait > deadline) throw e

        attempt++
        await sleep(wait)
      }
    }
  })

const latencyOf = (result: DaeProbeResult, memberId: string) => {
  const item = result.results.find((entry) => entry.member_id === memberId) ?? result.results[0]

  return item?.state === 'healthy' ? Math.round(item.latency_ms ?? 0) : 0
}

const ipVersionFor = (url?: string): DaeProbeRequest['ip_version'] =>
  url === IPV6_TEST_URL ? 'ipv6' : 'any'

const idOf = (name: string) => proxyMap.value[name]?.id

const testNode = async (name: string, url?: string) => {
  const nodeId = idOf(name)

  if (!nodeId) throw new Error(`dae: unknown node ${name}`)

  const result = await runProbe({
    target: { type: 'node', node_id: nodeId },
    kind: 'http',
    purpose: 'data',
    transport: ['tcp'],
    ip_version: ipVersionFor(url),
    warmth: 'cold',
  })

  return latencyOf(result, nodeId)
}

const testGroup = async (name: string, url?: string) => {
  const groupId = idOf(name)

  if (!groupId) throw new Error(`dae: unknown group ${name}`)

  const result = await runProbe({
    target: { type: 'group', group_id: groupId },
    kind: 'http',
    purpose: 'data',
    transport: ['tcp'],
    ip_version: ipVersionFor(url),
    members: 'leaves',
    warmth: 'cold',
  })

  const latencies: Record<string, number> = {}

  for (const item of result.results) {
    const memberName = nameById.get(item.member_id)

    if (!memberName) continue

    latencies[memberName] = item.state === 'healthy' ? Math.round(item.latency_ms ?? 0) : 0
  }

  return latencies
}

const fetchRules = async (): Promise<RulesPayload> => {
  const { rules } = await fetchDaeRulesAPI()

  return {
    rules: rules.map((rule) => ({
      type: rule.kind === 'fallback' ? 'fallback' : rule.must ? 'must' : '',
      payload: rule.expression,
      proxy: rule.outbound,
      size: -1,
      uuid: '',
      index: rule.index,
    })),
    providers: [],
  }
}

const splitAddress = (address?: string): [string, string] => {
  if (!address) return ['', '']

  const bracket = address.lastIndexOf(']')

  if (bracket !== -1) {
    return [address.slice(1, bracket), address.slice(bracket + 2)]
  }

  const colon = address.lastIndexOf(':')

  return colon === -1 ? [address, ''] : [address.slice(0, colon), address.slice(colon + 1)]
}

const toChainNames = (connection: DaeConnection) => {
  if (!connection.chain.length) {
    return connection.outbound ? [connection.outbound] : []
  }

  return connection.chain.map(displayName).reverse()
}

const toRawConnection = (
  connection: DaeConnection,
  network: 'tcp' | 'udp',
): DaeConnectionRawMessage => {
  const [destination, destinationPort] = splitAddress(connection.dst)

  return {
    id: connection.id,
    daeRaw: connection,
    network,
    download: toNumber(connection.download_bytes),
    upload: toNumber(connection.upload_bytes),
    chains: toChainNames(connection),
    rule: connection.rule_expression || '',
    rulePayload: connection.rule_expression || '',
    start: connection.started_at || new Date().toISOString(),
    source: connection.src || '',
    destination,
    destinationPort,
    host: connection.domain || destination,
    process: connection.pname || '-',
  }
}

const asDae = (connection: Connection) => connection as DaeConnectionRawMessage

const accessor: ConnectionAccessor = {
  chains: (connection) => asDae(connection).chains,
  download: (connection) => asDae(connection).download,
  upload: (connection) => asDae(connection).upload,
  start: (connection) => asDae(connection).start,
  rule: (connection) => asDae(connection).rule || '-',
  rulePayload: (connection) => asDae(connection).rulePayload,
  sourceIP: (connection) => splitAddress(asDae(connection).source)[0],
  sourcePort: (connection) => splitAddress(asDae(connection).source)[1],
  network: (connection) => asDae(connection).network,
  networkType: (connection) => {
    const dae = asDae(connection)

    return `${dae.daeRaw.ingress || dae.daeRaw.state} | ${dae.network}`
  },
  hostname: (connection) => asDae(connection).host,
  host: (connection) => {
    const dae = asDae(connection)
    const host = dae.host

    if (host.includes(':')) return `[${host}]:${dae.destinationPort}`

    return dae.destinationPort ? `${host}:${dae.destinationPort}` : host
  },
  process: (connection) => asDae(connection).process,
  destination: (connection) => asDae(connection).destination,
  inboundUser: (connection) => asDae(connection).daeRaw.ingress || '-',
  sniffHost: (connection) => asDae(connection).daeRaw.domain || '',
  remoteAddress: (connection) => asDae(connection).daeRaw.dst || '',
  isDirect: (connection) => asDae(connection).daeRaw.outbound === 'direct',
  smartBlock: () => undefined,
}

const POLL_INTERVAL = 1000

const poll = <T>(request: () => Promise<T>, interval = POLL_INTERVAL): Stream<T> => {
  const data = shallowRef<T>()
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const tick = async () => {
    try {
      const next = await request()

      if (!stopped) data.value = next
    } catch {}

    if (!stopped) timer = setTimeout(tick, interval)
  }

  tick()

  return {
    data,
    close: () => {
      stopped = true
      clearTimeout(timer)
    },
  }
}

export const runtimeSample = shallowRef<DaeRuntime>()

let runtimeSubscribers = 0
let runtimeGeneration = 0
let runtimeTimer: ReturnType<typeof setTimeout> | undefined

export const acquireRuntime = () => {
  if (++runtimeSubscribers === 1) {
    const generation = ++runtimeGeneration
    const tick = async () => {
      try {
        const runtime = await fetchDaeRuntimeAPI()

        if (generation === runtimeGeneration) runtimeSample.value = runtime
      } catch {}

      if (generation === runtimeGeneration) runtimeTimer = setTimeout(tick, POLL_INTERVAL)
    }

    tick()
  }

  let released = false

  return () => {
    if (released) return

    released = true

    if (--runtimeSubscribers === 0) {
      runtimeGeneration++
      clearTimeout(runtimeTimer)
      runtimeTimer = undefined
    }
  }
}

const CONNECTIONS_LIMIT = 1000
const FLOWS_LIMIT = 200
const TERMINAL_FLOW_STATES = new Set(['closed', 'blocked', 'failed'])

const session = {
  truncatedNotified: false,
  flowsAvailable: true,
  flowsFetchedAt: 0,
}

const flowToRawConnection = (flow: DaeFlowSummary): DaeConnectionRawMessage => {
  const input = flow.input ?? {}

  return toRawConnection(
    {
      id: flow.connection_id || flow.id,
      flow_id: flow.id,
      pname: flow.pname,
      state: flow.state,
      src: input.src,
      dst: input.dst,
      domain: input.domain ?? null,
      outbound: flow.outbound,
      chain: flow.chain,
      chain_source: flow.chain_source,
      rule_id: flow.rule_id,
      rule_expression: flow.rule_expression,
      rule_source: flow.rule_source,
      ingress: null,
      domain_source: flow.domain_source,
      started_at: flow.started_at,
      observed_by: flow.observed_by,
      upload_bytes: null,
      download_bytes: null,
      upload_bytes_per_second: null,
      download_bytes_per_second: null,
    },
    flow.network,
  )
}

const FLOWS_INTERVAL = 5000

const fetchTerminalFlows = async (live: Set<string>) => {
  if (!session.flowsAvailable || Date.now() - session.flowsFetchedAt < FLOWS_INTERVAL) return []

  session.flowsFetchedAt = Date.now()

  try {
    const { flows } = await fetchDaeFlowsAPI({ limit: FLOWS_LIMIT, detail: 'full' })

    return flows
      .filter((flow) => TERMINAL_FLOW_STATES.has(flow.state))
      .filter((flow) => !flow.connection_id || !live.has(flow.connection_id))
      .map(flowToRawConnection)
  } catch {
    session.flowsAvailable = false
    return []
  }
}

const subscribeConnections = (): Stream<ConnectionsPayload> => {
  const release = acquireRuntime()
  const stream = poll<ConnectionsPayload>(async () => {
    const connections = await fetchDaeConnectionsAPI({ limit: CONNECTIONS_LIMIT })

    if (connections.truncated && !session.truncatedNotified) {
      session.truncatedNotified = true
      showNotification({
        content: 'daeConnectionsTruncated',
        params: {
          limit: String(CONNECTIONS_LIMIT),
          total: String(connections.total_tcp + connections.total_udp),
        },
        type: 'alert-warning',
      })
    }
    if (!connections.truncated) {
      session.truncatedNotified = false
    }

    const active = [
      ...connections.tcp.map((item) => toRawConnection(item, 'tcp')),
      ...connections.udp.map((item) => toRawConnection(item, 'udp')),
    ]
    const traffic = runtimeSample.value?.traffic

    return {
      connections: active,
      closed: await fetchTerminalFlows(new Set(active.map((item) => item.id))),
      downloadTotal: traffic ? toNumber(traffic.bytes.download) : undefined,
      uploadTotal: traffic ? toNumber(traffic.bytes.upload) : undefined,
    }
  })

  return {
    data: stream.data,
    close: () => {
      stream.close()
      release()
    },
  }
}

const subscribeTraffic = (): Stream<TrafficSample> => {
  const data = shallowRef<TrafficSample>()
  const release = acquireRuntime()
  const stop = watch(
    runtimeSample,
    (runtime) => {
      if (!runtime) return

      data.value = {
        down: toNumber(runtime.traffic.rates?.download_bytes_per_second),
        up: toNumber(runtime.traffic.rates?.upload_bytes_per_second),
        downTotal: toNumber(runtime.traffic.bytes.download),
        upTotal: toNumber(runtime.traffic.bytes.upload),
      }
    },
    { immediate: true },
  )

  return {
    data,
    close: () => {
      stop()
      release()
    },
  }
}

const LOG_LEVEL_TO_DAE: Record<string, string> = {
  [LOG_LEVEL.Trace]: 'trace',
  [LOG_LEVEL.Debug]: 'debug',
  [LOG_LEVEL.Info]: 'info',
  [LOG_LEVEL.Warning]: 'warn',
  [LOG_LEVEL.Error]: 'error',
}

const DAE_TO_LOG_LEVEL: Record<string, LOG_LEVEL> = {
  trace: LOG_LEVEL.Trace,
  debug: LOG_LEVEL.Debug,
  info: LOG_LEVEL.Info,
  warn: LOG_LEVEL.Warning,
  error: LOG_LEVEL.Error,
}

const toDnsQuery = (domain: string, results: DaeDnsQueryResult[]): DNSQuery => ({
  AD: false,
  CD: false,
  RA: false,
  RD: true,
  TC: false,
  status: results.every((result) => result.status === 'NOERROR') ? 0 : 2,
  Question: results.map((result) => ({
    Name: result.question.name || domain,
    Qtype: DNS_RECORD_TYPE[result.question.type] ?? 0,
    Qclass: 1,
  })),
  Answer: results.flatMap(
    (result) =>
      result.answers?.map((answer) => ({
        TTL: answer.ttl,
        data: answer.data,
        name: answer.name,
        type: DNS_RECORD_TYPE[answer.type] ?? 0,
      })) ?? [],
  ),
})

const historyAt = (sample: { sampled_at: string }) => new Date(sample.sampled_at).getTime()

const fetchHistory = async (): Promise<MetricsHistory> => {
  const [traffic, memory] = await Promise.all([
    fetchDaeTrafficHistoryAPI(),
    fetchDaeMemoryHistoryAPI(),
  ])

  return {
    download: traffic.samples.map((sample) => ({
      at: historyAt(sample),
      value: toNumber(sample.download_bytes_per_second),
    })),
    upload: traffic.samples.map((sample) => ({
      at: historyAt(sample),
      value: toNumber(sample.upload_bytes_per_second),
    })),
    connections: traffic.samples.map((sample) => ({
      at: historyAt(sample),
      value: sample.connections ?? 0,
    })),
    memory: memory.samples.map((sample) => ({
      at: historyAt(sample),
      value: toNumber(sample.rss_bytes ?? sample.cgroup_current_bytes),
    })),
  }
}

const resetSession = () => {
  session.truncatedNotified = false
  session.flowsAvailable = true
  session.flowsFetchedAt = 0
  probeStamps.length = 0
  nameById.clear()
  runtimeSample.value = undefined
  daeGroupDetails.value = []
  daeNodeList.value = []
  daeProviderList.value = []
}

export const daeDriver: Driver = {
  type: 'dae',

  reset: resetSession,

  system: {
    probe: (backend, timeout, signal) => probeDaeChannel(backend, timeout, signal),
    fetchVersion: async () => {
      const { engine } = await fetchDaeVersionAPI()

      return `${engine.name} ${engine.version}`
    },
    upgradeCore: () => unsupported('upgradeCore'),
    restartCore: () => unsupported('restartCore'),
    upgradeUI: () => unsupported('upgradeUI'),
    getStorage: () => unsupported('getStorage'),
    setStorage: () => unsupported('setStorage'),
    deleteStorage: () => unsupported('deleteStorage'),
  },

  metrics: {
    traffic: subscribeTraffic,
    memory: () =>
      poll<MemorySample>(async () => {
        const memory = await fetchDaeRuntimeMemoryAPI()

        return {
          inuse: toNumber(memory.process?.rss_bytes ?? memory.cgroup?.current_bytes),
        }
      }),
    history: fetchHistory,
    fetchRuntimeStats: async () => {
      const { outbounds } = await fetchDaeRuntimeOutboundsAPI()

      return {
        outbounds: outbounds.map((outbound) => ({
          name: outbound.kind === 'builtin' ? outbound.name : `${outbound.name} (${outbound.kind})`,
          totalConns: toNumber(outbound.total_connections),
          activeConns: outbound.active_connections,
          upload: toNumber(outbound.upload_bytes),
          download: toNumber(outbound.download_bytes),
          errors: toNumber(outbound.errors),
        })),
      }
    },
  },

  events: {
    subscribe: (onEvent) => {
      const source = createDaeEventSource('/events', {}, (event, payload) => {
        let data: unknown = undefined

        try {
          data = JSON.parse(payload)
        } catch {}

        onEvent(event, data)
      })

      return { close: source.close }
    },
  },

  proxies: {
    fetch: fetchProxies,
    select: async (group, name) => {
      const groupId = idOf(group)
      const memberId = idOf(name)

      if (!groupId || !memberId) throw new Error(`dae: unknown selection ${group}/${name}`)

      await selectDaeGroupMemberAPI(groupId, memberId)
    },
    clearFixed: () => Promise.resolve(),
    testNode: (name, url) => testNode(name, url),
    testProviderNode: (_provider, name, url) => testNode(name, url),
    testGroup: (group, url) => testGroup(group, url),
    updateProvider: async (name) => {
      const providerId = proxyProviederList.value.find((provider) => provider.name === name)?.id

      if (!providerId) throw new Error(`dae: unknown provider ${name}`)

      await refreshDaeProviderAPI(providerId)
    },
    healthCheckProvider: () => unsupported('healthCheckProvider'),
    fetchSmartWeights: () => Promise.resolve({}),
    flushSmartWeights: () => unsupported('flushSmartWeights'),
  },

  rules: {
    fetch: fetchRules,
    updateProvider: () => unsupported('updateRuleProvider'),
    toggleDisabled: () => unsupported('toggleRuleDisabled'),
  },

  config: {
    fetch: async () => ({
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
      tun: { enable: false },
    }),
    patch: () => unsupported('patchConfig'),
    reload: async () => {
      await startDaeReloadAPI()
    },
    load: () => unsupported('loadConfig'),
    updateGeoData: async () => {
      await updateDaeGeoDataAPI()
    },
    flushFakeIP: () => unsupported('flushFakeIP'),
    flushDNSCache: async () => {
      await flushDaeDnsCacheAPI()
    },
    queryDNS: async (params) => {
      const { results } = await queryDaeDnsAPI(params.name, [params.type])

      return toDnsQuery(params.name, results)
    },
  },

  logs: {
    subscribe: (level, onBatch) => {
      const source = createDaeEventSource(
        '/logs',
        { level: LOG_LEVEL_TO_DAE[level] ?? 'info' },
        (event, payload) => {
          if (event !== 'log') return

          try {
            const record = JSON.parse(payload) as DaeLogRecord

            onBatch([
              {
                type: DAE_TO_LOG_LEVEL[record.level] ?? LOG_LEVEL.Info,
                payload: record.target ? `[${record.target}] ${record.message}` : record.message,
              },
            ])
          } catch {}
        },
      )

      return { close: source.close }
    },
  },

  connections: {
    accessor,
    subscribe: subscribeConnections,
    disconnect: async (id) => {
      await closeDaeConnectionAPI(id)
    },
    disconnectAll: async (filter) => {
      await closeDaeConnectionsAPI(filter)
    },
    block: () => unsupported('blockConnection'),
  },
}
