export type DaeTimestamp = string
export type DaeUInt64 = string

export type DaeVersion = {
  api: { name: string; major: number; status: string }
  engine: { name: string; version: string }
  build?: {
    revision: string | null
    target: string | null
    built_at: DaeTimestamp | null
  } | null
}

export type DaeAvailable = {
  available: boolean
}

export type DaeAuthMode = 'token' | 'password'

export type DaeDiscovery = {
  name: string
  api_major: number
  status?: string
  base_path?: string
  links: Record<string, unknown>
  auth: {
    mode: DaeAuthMode
    setup_required: boolean
    anonymous_loopback?: boolean
  }
}

export type DaeAuthSession = {
  token: string
  expires_at: DaeTimestamp
}

export type DaeGeoDataDownloadRoute = 'routing' | 'group' | 'direct'

export type DaeGeoDataDownload = {
  route: DaeGeoDataDownloadRoute
  group_id: string | null
}

export type DaeCapabilities = {
  observed_at: DaeTimestamp
  profiles: string[]
  limits: {
    max_request_target_bytes: number
    max_header_bytes: number
    max_json_body_bytes: number
  }
  resources: {
    config?: DaeAvailable & {
      writable?: boolean
      create?: boolean
      max_bytes?: number
      max_sources?: number
    }
    config_validate?: DaeAvailable & { modes?: string[] }
    runtime: DaeAvailable
    runtime_memory?: DaeAvailable & { metrics?: string[] }
    runtime_outbounds?: DaeAvailable
    traffic_history?: DaeAvailable & { max_window_seconds?: number; max_points?: number }
    memory_history?: DaeAvailable & { max_window_seconds?: number; max_points?: number }
    datapath?: DaeAvailable & { kinds?: string[]; details?: string[] }
    nodes?: DaeAvailable & { can_manage?: boolean }
    providers?: DaeAvailable & {
      can_refresh?: boolean
      can_manage?: boolean
      create_unfetched?: boolean
      create_options?: {
        update_interval?: number
        user_agent?: string
        cache?: boolean
      }
      max_page_size?: number
    }
    groups?: DaeAvailable & {
      config_patch?: boolean
      selection?: boolean
      max_patch_operations?: number
    }
    probes?: DaeAvailable & {
      targets?: string[]
      kinds?: string[]
      transports?: string[]
      ip_versions?: string[]
    }
    connections?: DaeAvailable & { can_close?: boolean; max_bulk_close?: number }
    flows?: DaeAvailable & {
      recording?: 'off' | 'on' | 'auto' | 'sampled'
      min_flows?: number
      max_flows?: number
      retention_seconds?: number
      max_page_size?: number
    }
    routing_trace?: DaeAvailable
    rules?: DaeAvailable & { max_rules?: number }
    events?: DaeAvailable & { kinds?: string[]; heartbeat_seconds?: number }
    logs?: DaeAvailable & {
      levels?: string[]
      filters?: ('level' | 'target')[]
      retention_seconds?: number
      min_buffered_records?: number
      max_buffered_records?: number
    }
    dns_query?: DaeAvailable & { record_types?: string[] }
    dns_cache?: DaeAvailable & {
      read?: boolean
      delete_entry?: boolean
      delete_name?: boolean
      flush?: boolean
      entry_kinds?: string[]
    }
    dns_log?: DaeAvailable & { min_records?: number; max_records?: number; max_page_size?: number }
    dns_rules?: DaeAvailable & { max_rules?: number }
    runtime_settings?: DaeAvailable & { fields?: DaeRuntimeSettingField[] }
    operations?: DaeAvailable & { retention_seconds?: number; max_replay_keys?: number }
    reload?: DaeAvailable
    suspend?: DaeAvailable
    resume?: DaeAvailable
    geodata?: DaeAvailable & {
      can_update?: boolean
      assets?: string[]
      configurable_sources?: boolean
      max_urls?: number
      interval_hours?: { min: number; max: number; default: number }
      checksum?: 'sha256sum' | 'pinned' | null
      lifecycle?: { file_values: 'start' | 'activation'; overrides_persist: boolean }
    }
  }
}

export type DaeRuntimeSettingField =
  | 'log.level'
  | 'log.buffered_records'
  | 'dns_log.max_records'
  | 'flows.max_flows'
  | 'flows.retention_seconds'
  | 'record_flows'
  | 'record_logs'
  | 'record_dns_log'
  | 'geodata'

export type DaeHealthObservation = {
  transport: 'tcp' | 'udp'
  purpose: 'data' | 'dns' | 'shared'
  ip_version: 'ipv4' | 'ipv6'
  warmth: 'cold' | 'warm' | 'mixed' | 'unknown'
  measurement: string
  sample_source: string
  state: 'healthy' | 'unavailable' | 'unknown'
  latency_ms: number | null
  moving_avg_ms: number | null
  avg10_ms: number | null
  observed_at: DaeTimestamp
  error: string | null
}

export type DaeNode = {
  id: string
  name: string
  protocol: string | null
  subscription_tag: string | null
  provider_id?: string | null
  group_ids: string[]
  health: DaeHealthObservation[]
}

export type DaeNodeList = {
  observed_at: DaeTimestamp
  nodes: DaeNode[]
  next_cursor: string | null
}

export type DaeGroupPolicy = {
  kind: 'selector' | 'urltest' | 'loadbalance' | 'fallback' | 'random' | 'score' | 'fixed'
  native: string
}

export type DaeGroupMember = {
  id: string
  name: string
  kind: 'node' | 'group'
}

export type DaeGroupSelection = {
  member_id: string
  resolved_leaf_node_id?: string | null
  source: string
}

export type DaeGroupCapabilities = {
  can_select: boolean
  can_override: boolean
  supports_nested_groups: boolean
  mutable_config: string[]
  probe_transports: string[]
}

export type DaeGroupConfig = {
  default_member_id: string | null
  final_outbound: string | null
  check_url: string | null
  check_interval: number | null
  tolerance: number | null
  idle_timeout: number | null
  interrupt_connections: boolean | null
  [extension: `x-${string}`]: Record<string, unknown> | undefined
}

export type DaeGroupConfigDocument = {
  policy: DaeGroupPolicy
  config: DaeGroupConfig
}

export type DaeGroup = {
  id: string
  name: string
  icon: string | null
  config_revision: string
  policy: DaeGroupPolicy
  members: DaeGroupMember[]
  config: DaeGroupConfig
  runtime: {
    selection: { tcp: DaeGroupSelection | null; udp: DaeGroupSelection | null }
    health: (DaeHealthObservation & { member_id: string })[]
  }
  capabilities: DaeGroupCapabilities
}

export type DaeGroupSummary = {
  id: string
  name: string
  icon: string | null
  config_revision: string
  policy: DaeGroupPolicy
  member_count: number
  selection: { tcp_member_id: string | null; udp_member_id: string | null }
}

export type DaeProvider = {
  id: string
  name: string
  kind: 'subscription' | 'file' | 'inline'
  url_redacted: string | null
  node_count: number
  updated_at: DaeTimestamp | null
  expires_at: DaeTimestamp | null
  traffic: {
    upload_bytes: DaeUInt64 | null
    download_bytes: DaeUInt64 | null
    total_bytes: DaeUInt64 | null
  } | null
  status: 'ok' | 'stale' | 'error'
  last_error: { code: string; message: string } | null
  download?: DaeGeoDataDownload | null
}

export type DaeProviderCreate = {
  name: string
  kind: 'subscription'
  url: string
  update_interval?: number
  user_agent?: string
  cache?: boolean
}

export type DaeProviderList = {
  providers: DaeProvider[]
  next_cursor: string | null
}

export type DaeRuleSource = {
  file: string
  source_id: string
  line: number
  column: number | null
} | null

export type DaeRoutingRule = {
  rule_id: string
  index: number
  expression: string
  outbound: string
  must: boolean
  source: DaeRuleSource
  kind: 'rule' | 'fallback'
}

export type DaeRuleList = {
  generation_id: string
  rules: DaeRoutingRule[]
  fallback: { outbound: string; source: DaeRuleSource }
}

export type DaeDnsRoutingRule = {
  rule_id: string
  index: number
  expression: string
  action: 'upstream' | 'asis' | 'reject' | 'accept' | 'requery'
  upstream: string | null
  source: DaeRuleSource
  kind: 'rule' | 'fallback'
}

export type DaeDnsRuleList = {
  generation_id: string
  request: DaeDnsRoutingRule[]
  response: DaeDnsRoutingRule[]
}

export type DaeRuntime = {
  observed_at: DaeTimestamp
  instance_id: string
  lifecycle: {
    state: string
    started_at: DaeTimestamp | null
    uptime_seconds: DaeUInt64 | null
  }
  generation: {
    active_id: string
    config_revision: string | null
    state: string
    activated_at: DaeTimestamp | null
  }
  datapath: {
    kind: string
    state: string
    visibility: string
    ebpf?: unknown
  }
  traffic: {
    scope: string
    observed_by: string
    counter_since: DaeTimestamp | null
    sampled_at: DaeTimestamp | null
    connections: { tcp: number | null; udp: number | null; total: number | null }
    bytes: { upload: DaeUInt64 | null; download: DaeUInt64 | null }
    rates: {
      window_seconds: number
      upload_bytes_per_second: DaeUInt64 | null
      download_bytes_per_second: DaeUInt64 | null
    } | null
  }
  process: { pid?: number | null; cpu_percent: number | null }
  last_reload: {
    operation_id: string
    status: 'succeeded' | 'failed'
    finished_at: DaeTimestamp | null
    error: { code: string; message: string } | null
  } | null
  degradations?: DaeDegradation[]
}

export type DaeDegradation = {
  code: string
  message: string
  component: string
  since: DaeTimestamp
}

export type DaeRuntimeMemory = {
  observed_at: DaeTimestamp
  process: { rss_bytes?: DaeUInt64 | null } | null
  cgroup: {
    scope: string
    current_bytes?: DaeUInt64 | null
    limit_bytes?: DaeUInt64 | null
  } | null
  kernel: { ebpf_bytes?: DaeUInt64 | null; sampled_at: DaeTimestamp | null } | null
}

export type DaeOutboundCounters = {
  name: string
  kind: 'group' | 'node' | 'builtin'
  active_connections: number
  total_connections: DaeUInt64
  upload_bytes: DaeUInt64
  download_bytes: DaeUInt64
  errors: DaeUInt64
}

export type DaeRuntimeOutbounds = {
  observed_at: DaeTimestamp
  counter_since: DaeTimestamp
  outbounds: DaeOutboundCounters[]
}

export type DaeRuleProvenance = 'kernel' | 'userspace' | 'recomputed' | 'unknown'

export type DaeConnection = {
  id: string
  flow_id: string | null
  pname: string | null
  state: string
  src?: string
  dst?: string
  domain: string | null
  outbound: string | null
  chain: string[]
  chain_source: string
  rule_id: string | null
  rule_expression: string | null
  rule_source: DaeRuleProvenance
  ingress: 'lan' | 'wan' | null
  domain_source: string | null
  started_at: DaeTimestamp | null
  observed_by: string
  upload_bytes: DaeUInt64 | null
  download_bytes: DaeUInt64 | null
  upload_bytes_per_second: DaeUInt64 | null
  download_bytes_per_second: DaeUInt64 | null
}

export type DaeConnectionList = {
  observed_at: DaeTimestamp
  instance_id: string
  visibility: string
  truncated: boolean
  tcp: DaeConnection[]
  udp: DaeConnection[]
  total_tcp: number
  total_udp: number
}

export type DaeLogRecord = {
  ts: DaeTimestamp
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error'
  target: string | null
  message: string
  fields: Record<string, unknown> | null
}

export type DaeOperationAccepted = {
  operation_id: string
  kind: string
  status: 'queued'
  href: string
}

export type DaeOperation = {
  operation_id: string
  kind: string
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  created_at: DaeTimestamp
  started_at: DaeTimestamp | null
  finished_at: DaeTimestamp | null
  result: Record<string, unknown> | null
  error: { code: string; message: string } | null
}

export type DaeProbeResultItem = {
  member_id: string
  resolved_leaf_node_id: string | null
  kind: string
  purpose: string
  transport: string
  ip_version: string
  warmth: string
  state: 'healthy' | 'unavailable' | 'unknown'
  latency_ms: number | null
  health_updated: boolean
  error: string | null
  observed_at: DaeTimestamp
}

export type DaeProbeResult = {
  target: { type: 'node'; node_id: string } | { type: 'group'; group_id: string }
  selection_changed: { tcp: boolean; udp: boolean }
  selection_before: { tcp: string | null; udp: string | null }
  selection_after: { tcp: string | null; udp: string | null }
  results: DaeProbeResultItem[]
}

export type DaeProbeRequest = {
  target: { type: 'node'; node_id: string } | { type: 'group'; group_id: string }
  kind: 'tcp_connect' | 'http' | 'dns'
  transport: ('tcp' | 'udp')[]
  ip_version: 'ipv4' | 'ipv6' | 'any'
  members?: 'direct' | 'leaves' | string[]
  warmth: 'cold' | 'warm'
}

export type DaeDnsAnswer = {
  name: string
  type: string
  class: string
  ttl: number
  data: string
}

export type DaeDnsQueryResult = {
  type: string
  cached: boolean
  cache_entry_id: string | null
  upstream: string | null
  route: { source: string; rule: string | null }
  status: string
  elapsed_ms: number
  question: { name: string; type: string }
  answers?: DaeDnsAnswer[]
}

export type DaeDnsQueryResponse = {
  domain: string
  cache_mode: string
  query_time: DaeTimestamp
  results: DaeDnsQueryResult[]
}

export type DaeGeoAsset = {
  kind: 'geosite' | 'geoip'
  sha256: string
  size_bytes: DaeUInt64
  modified_at: DaeTimestamp | null
  source_redacted: string | null
  fetched_url_redacted?: string | null
  verified?: boolean
  download_route?: DaeGeoDataDownload | null
}

export type DaeGeoData = {
  observed_at: DaeTimestamp
  assets: DaeGeoAsset[]
  last_checked_at?: DaeTimestamp | null
  last_updated_at?: DaeTimestamp | null
  next_check_at?: DaeTimestamp | null
  last_error?: { code: string; message: string } | null
  required_codes?: Record<string, string[]>
}

export type DaeGeoDataSettings = {
  source: 'config' | 'override' | 'default'
  geosite: { urls: string[] }
  geoip: { urls: string[] }
  auto_update: { enabled: boolean; interval_hours: number }
  download: DaeGeoDataDownload
  verify_checksum?: boolean
}

export type DaeGeoDataSettingsPatch = {
  geosite?: { urls: string[] }
  geoip?: { urls: string[] }
  auto_update?: { enabled?: boolean; interval_hours?: number }
  download?: { route: DaeGeoDataDownloadRoute; group_id?: string }
  verify_checksum?: boolean
} | null

export type DaeRecorderMode = 'on' | 'off' | 'auto'

export type DaeRecorderState = {
  allowed: boolean
  mode: DaeRecorderMode
  active: boolean
}

export type DaeRuntimeSettings = {
  observed_at: DaeTimestamp
  source: 'config' | 'runtime'
  log?: { level?: string; buffered_records?: number }
  dns_log?: { max_records: number }
  flows?: { max_flows?: number; retention_seconds?: number }
  recording?: {
    flows?: DaeRecorderState
    logs?: DaeRecorderState
    dns_log?: DaeRecorderState
    events?: { active: boolean }
    grace_remaining_seconds?: number
  }
  geodata?: DaeGeoDataSettings
}

export type DaeRuntimeSettingsPatch = {
  log?: { level?: string; buffered_records?: number }
  dns_log?: { max_records: number }
  flows?: { max_flows?: number; retention_seconds?: number }
  record_flows?: DaeRecorderMode
  record_logs?: DaeRecorderMode
  record_dns_log?: DaeRecorderMode
  geodata?: DaeGeoDataSettingsPatch
}

export type DaeConnectionRawMessage = {
  id: string
  daeRaw: DaeConnection
  network: 'tcp' | 'udp'
  download: number
  upload: number
  chains: string[]
  rule: string
  rulePayload: string
  start: string
  source: string
  destination: string
  destinationPort: string
  host: string
  process: string
}

export type DaeFlowSummary = {
  id: string
  instance_id: string
  revision: number
  network: 'tcp' | 'udp'
  state: string
  pname: string | null
  connection_id: string | null
  outbound: string | null
  chain: string[]
  chain_source: string
  rule_id: string | null
  rule_generation_id: string | null
  rule_expression: string | null
  rule_source: DaeRuleProvenance
  domain_source: string | null
  observed_by: string
  started_at: DaeTimestamp
  ended_at: DaeTimestamp | null
  trace_status: string
  input?: DaeFlowInput
}

export type DaeFlowStep = {
  seq: number
  observed_at: DaeTimestamp
  elapsed_us: number | null
  generation_id: string | null
  evidence: string
  stage: string
  data?: Record<string, unknown>
}

export type DaeFlowInput = {
  src?: string
  dst?: string
  domain?: string | null
  domain_source?: string | null
  pid?: number | null
  src_mac?: string | null
  dscp?: number | null
  mark?: number | null
}

export type DaeFlowDetail = DaeFlowSummary & {
  trace?: {
    status: string
    missing: string[]
    steps: DaeFlowStep[]
  }
}

export type DaeFlowList = {
  instance_id: string
  observed_at: DaeTimestamp
  coverage: Record<string, string>
  dropped_records: number
  flows: DaeFlowSummary[]
  next_cursor: string | null
}

export type DaeDnsCacheEntry = {
  entry_id: string
  domain: string
  type: string
  class: string
  status: string
  expires_at: DaeTimestamp | null
  stale_until: DaeTimestamp | null
  answers?: DaeDnsAnswer[]
}

export type DaeDnsCacheList = {
  observed_at: DaeTimestamp
  coverage: { positive: boolean; negative: boolean; persistent: boolean }
  entries: DaeDnsCacheEntry[]
  total: number
  next_cursor: string | null
  usage?: { entries: DaeUInt64; entry_capacity: DaeUInt64 | null }
}

export type DaeDnsLogRecord = {
  id: string
  observed_at: DaeTimestamp
  src: string | null
  question: { name: string; type: string }
  status: string
  cached: boolean
  upstream: string | null
  route: { source: string; rule: string | null }
  elapsed_ms: number
  answers?: DaeDnsAnswer[]
}

export type DaeDnsLogList = {
  observed_at: DaeTimestamp
  total: number
  next_cursor: string | null
  records: DaeDnsLogRecord[]
}

export type DaeDeleteResult = {
  matched?: number
  deleted: number
}

export type DaeTraceInput = {
  network: 'tcp' | 'udp'
  dst_port: number
  domain?: string
  dst_ip?: string
  src_ip?: string
  src_port?: number
  pname?: string
  dscp?: number
}

export type DaeTraceCondition = {
  id: string
  expression: string
  result: string
  missing_inputs: string[]
}

export type DaeTraceRule = {
  rule_id: string
  expression: string
  result: string
  missing_inputs: string[]
  conditions: DaeTraceCondition[]
}

export type DaeTraceEvaluation = {
  dst_ip: string | null
  decision: string
  outbound: string | null
  missing_inputs: string[]
  rules: DaeTraceRule[]
}

export type DaeRoutingTrace = {
  mode: string
  instance_id: string
  generation_id: string
  observed_at: DaeTimestamp
  evaluations: DaeTraceEvaluation[]
}

export type DaeConfigSourceContent = {
  id: string
  path: string
  absolute_path?: string
  kind: 'main' | 'include' | 'subscription' | 'generated'
  content_sha256: string
  bytes: number
  line_count: number
  content: string
}

export type DaeConfigSource = DaeConfigSourceContent & {
  writable: boolean
  loaded_at: DaeTimestamp
}

export type DaeConfigSnapshot = {
  generation_id: string
  revision: string
  sources: DaeConfigSource[]
  diagnostics: DaeDiagnostic[]
  secrets_redacted: boolean
}

export type DaeConfigDiagnosticsError = {
  error: {
    code: 'unsupported_value'
    message: string
    details: { diagnostics: DaeDiagnostic[] }
  }
}

export type DaeDiagnostic = {
  level: 'error' | 'warning' | 'info'
  source_id: string | null
  line: number | null
  column: number | null
  code: string | null
  message: string
}

export type DaeConfigValidation = {
  valid: boolean
  generation_id: string
  validated_at: DaeTimestamp
  diagnostics: DaeDiagnostic[]
}

export type DaeEbpfAttachment = {
  name: string
  kind: 'interface' | 'cgroup' | 'other'
  interface?: string
  direction?: 'ingress' | 'egress'
  cgroup?: string
  hook?: string
  state: 'attached' | 'detached' | 'error' | 'unknown'
}

export type DaeDatapath = {
  observed_at: DaeTimestamp
  kind: string
  state: string
  visibility: string
  ebpf: {
    backend: string
    programs: string
    hooks: string
    routing: { state: string; generation_id: string | null; epoch: string | null }
    health: string
    last_error: string | null
    checked_at: DaeTimestamp
    attachments?: DaeEbpfAttachment[]
    maps?: {
      state: string
      conn_state: { occupancy: number | null; capacity: number; occupancy_known: boolean } | null
    }
  } | null
  errors: { code: string; message: string }[]
}

export type DaeTrafficHistory = {
  observed_at: DaeTimestamp
  window_seconds: number
  sampled_every_seconds: number
  samples: {
    sampled_at: DaeTimestamp
    upload_bytes_per_second: DaeUInt64 | null
    download_bytes_per_second: DaeUInt64 | null
    connections: number | null
  }[]
}

export type DaeMemoryHistory = {
  observed_at: DaeTimestamp
  window_seconds: number
  sampled_every_seconds: number
  samples: {
    sampled_at: DaeTimestamp
    rss_bytes: DaeUInt64 | null
    cgroup_current_bytes: DaeUInt64 | null
    kernel_ebpf_bytes?: DaeUInt64 | null
  }[]
}

export type DaeSelectionResult = {
  group_id: string
  member_id: string
  resolved_leaf_node_id: string | null
  network: string
  source: string
  selection_revision: string
  connections_interrupted: boolean | number
}

export type DaeJsonPatchOperation = {
  op: 'add' | 'replace' | 'remove' | 'test' | 'copy' | 'move'
  path: string
  value?: unknown
  from?: string
}

export type DaeCloseResult = {
  closed: number
  skipped: number
}
