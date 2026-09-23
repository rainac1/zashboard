import type { ProbeResult } from '@/helper/connectivity'
import type {
  Backend,
  BackendType,
  Config,
  Connection,
  ConnectionRawMessage,
  DNSQuery,
  HonkStats,
  Log,
  NodeRank,
  Proxy,
  ProxyProvider,
  Rule,
  RuleProvider,
} from '@/types'
import type { ShallowRef } from 'vue'

export interface Stream<T> {
  data: ShallowRef<T | undefined>
  close: () => void
}

export interface Subscription {
  close: () => void
}

export interface ProxiesPayload {
  proxies: Record<string, Proxy>
  providers: ProxyProvider[]
}

export interface RulesPayload {
  rules: Rule[]
  providers: RuleProvider[]
}

export interface ConnectionsPayload {
  connections: ConnectionRawMessage[]
  closed?: ConnectionRawMessage[]
  downloadTotal?: number
  uploadTotal?: number
}

export interface TrafficSample {
  down: number
  up: number
  downTotal?: number
  upTotal?: number
}

export interface MemorySample {
  inuse: number
  // sing-box 的 Status 流附带 goroutine 数;clash / dae 无此字段。
  goroutines?: number
}

export interface HistorySample {
  at: number
  value: number
}

export interface MetricsHistory {
  download: HistorySample[]
  upload: HistorySample[]
  memory: HistorySample[]
  connections: HistorySample[]
}

export interface ConnectionsFilter {
  type?: 'tcp' | 'udp'
  src?: string
}

export interface ConnectionAccessor {
  chains(connection: Connection): string[]
  download(connection: Connection): number
  upload(connection: Connection): number
  start(connection: Connection): string | number
  rule(connection: Connection): string
  rulePayload(connection: Connection): string
  sourceIP(connection: Connection): string
  sourcePort(connection: Connection): string
  network(connection: Connection): string
  networkType(connection: Connection): string
  hostname(connection: Connection): string
  host(connection: Connection): string
  process(connection: Connection): string
  destination(connection: Connection): string
  inboundUser(connection: Connection): string
  sniffHost(connection: Connection): string
  remoteAddress(connection: Connection): string
  isDirect(connection: Connection): boolean
  smartBlock(connection: Connection): string | undefined
  // sing-box 原生连接字段;clash / dae 无对应数据,返回空串(展示为 '-')。
  protocol?(connection: Connection): string
  outboundType?(connection: Connection): string
  fromOutbound?(connection: Connection): string
}

export interface SystemDriver {
  probe(backend: Backend, timeout: number, signal?: AbortSignal): Promise<ProbeResult>
  fetchVersion(): Promise<string>
  // sing-box API(GetStartedAt)独有的内核启动时刻(ms epoch);其余后端无此能力。
  startedAt?(): Promise<number>
  upgradeCore(channel: 'release' | 'alpha' | 'auto'): Promise<void>
  restartCore(): Promise<void>
  upgradeUI(): Promise<void>
  getStorage(): Promise<Record<string, unknown>>
  setStorage(value: Record<string, string>): Promise<void>
  deleteStorage(): Promise<void>
}

export interface MetricsDriver {
  traffic(): Stream<TrafficSample>
  memory(): Stream<MemorySample>
  history?(): Promise<MetricsHistory>
  fetchRuntimeStats(): Promise<HonkStats>
}

export interface EventsDriver {
  subscribe(onEvent: (kind: string, payload: unknown) => void): Subscription
}

export interface ProxiesDriver {
  fetch(): Promise<ProxiesPayload>
  select(group: string, name: string): Promise<void>
  clearFixed(group: string): Promise<void>
  testNode(name: string, url: string, timeout: number): Promise<number>
  testProviderNode(provider: string, name: string, url: string, timeout: number): Promise<number>
  testGroup(group: string, url: string, timeout: number): Promise<Record<string, number>>
  updateProvider(name: string): Promise<void>
  healthCheckProvider(name: string): Promise<void>
  fetchSmartWeights(): Promise<Record<string, NodeRank[]>>
  flushSmartWeights(): Promise<void>
}

export interface RulesDriver {
  fetch(): Promise<RulesPayload>
  updateProvider(name: string): Promise<void>
  toggleDisabled(rule: Rule, disabled: boolean): Promise<void>
}

export interface ConfigDriver {
  fetch(): Promise<Config>
  patch(config: Record<string, string | boolean | object | number>): Promise<void>
  reload(): Promise<void>
  load(config: { path?: string; payload?: string }, force?: boolean): Promise<void>
  updateGeoData(): Promise<void>
  flushFakeIP(): Promise<void>
  flushDNSCache(): Promise<void>
  queryDNS(params: { name: string; type: string }): Promise<DNSQuery>
}

export interface LogsDriver {
  subscribe(level: string, onBatch: (logs: Log[]) => void): Subscription
}

export interface ConnectionsDriver {
  accessor: ConnectionAccessor
  subscribe(): Stream<ConnectionsPayload>
  disconnect(id: string): Promise<void>
  disconnectAll(filter?: ConnectionsFilter): Promise<void>
  block(id: string): Promise<void>
}

export interface Driver {
  type: BackendType
  reset?: () => void
  system: SystemDriver
  metrics: MetricsDriver
  events?: EventsDriver
  proxies: ProxiesDriver
  rules: RulesDriver
  config: ConfigDriver
  logs: LogsDriver
  connections: ConnectionsDriver
}
