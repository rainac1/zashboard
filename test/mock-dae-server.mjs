/*
 * 模拟 dae/honk Native API (dae-api 草案 0.1.0),用来验证面板的 dae driver。
 *
 * 单独跑:
 *   node test/mock-dae-server.mjs --groups 3 --nodes 12 --conns 40 --port 9527
 * 然后把面板指到 http://127.0.0.1:9527,后端类型选 dae(令牌留空)。
 * 加 --token <secret> 可模拟 honk 的 bearer 鉴权:不带 token 时携带 Authorization 会被 401,
 * 与 honk 的匿名回环规则一致。
 */
import { createServer } from 'node:http'
import { parseArgs } from 'node:util'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'Authorization, Last-Event-ID, Content-Type, If-Match, Accept',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'access-control-expose-headers': 'Location, Retry-After, ETag',
}

const PROBE_WINDOW = 60000
const PROBE_QUOTA = 30

const buildFixture = ({ groups, nodes, connections, providers: providerCount }) => {
  const now = new Date().toISOString()

  const providerList = Array.from({ length: providerCount }, (_, i) => ({
    id: `provider-${i}`,
    name: `provider-${i}`,
    kind: 'subscription',
    url_redacted: `https://subs.example.com/[redacted]-${i}`,
    node_count: 0,
    updated_at: now,
    expires_at: new Date(Date.now() + 86400000 * 30).toISOString(),
    traffic: null,
    status: 'ok',
    last_error: null,
  }))

  const nodeList = Array.from({ length: nodes }, (_, i) => {
    const providerId = providerList[i % providerCount]?.id ?? null

    return {
      id: `node-${String(i).padStart(3, '0')}`,
      name: `Node-${String(i).padStart(3, '0')} 🇭🇰`,
      protocol: ['vless', 'vmess', 'trojan', 'shadowsocks'][i % 4],
      subscription_tag: providerId,
      provider_id: providerId,
      group_ids: [`group-${i % groups}`],
      health: [
        {
          transport: 'tcp',
          purpose: 'shared',
          ip_version: 'ipv4',
          warmth: 'cold',
          measurement: 'http_round_trip',
          sample_source: 'probe',
          state: i % 7 === 0 ? 'unavailable' : 'healthy',
          latency_ms: i % 7 === 0 ? null : 40 + (i % 400),
          moving_avg_ms: i % 7 === 0 ? null : 45 + (i % 400),
          avg10_ms: null,
          observed_at: now,
          error: i % 7 === 0 ? 'timeout' : null,
        },
      ],
    }
  })

  const groupList = Array.from({ length: groups }, (_, i) => {
    const members = nodeList
      .filter((node) => node.group_ids.includes(`group-${i}`))
      .map((node) => ({ id: node.id, name: node.name, kind: 'node' }))
    const selected = members[0]

    return {
      id: `group-${i}`,
      name: `Group-${String(i).padStart(3, '0')}`,
      icon: null,
      config_revision: '1',
      policy: { kind: i % 2 === 0 ? 'selector' : 'urltest', native: 'min_moving_avg' },
      members,
      config: {
        default_member_id: selected?.id ?? null,
        final_outbound: null,
        check_url: 'https://www.gstatic.com/generate_204',
        check_interval: 30,
        tolerance: 50,
        idle_timeout: null,
        interrupt_connections: false,
      },
      runtime: {
        selection: {
          tcp: selected
            ? { member_id: selected.id, resolved_leaf_node_id: selected.id, source: 'runtime' }
            : null,
          udp: selected
            ? { member_id: selected.id, resolved_leaf_node_id: selected.id, source: 'runtime' }
            : null,
        },
        health: members.map((member, index) => ({
          member_id: member.id,
          resolved_leaf_node_id: member.id,
          sorting_latency_ms: 40 + index,
          ranking: null,
          transport: 'tcp',
          purpose: 'shared',
          ip_version: 'ipv4',
          warmth: 'cold',
          measurement: 'http_round_trip',
          sample_source: 'probe',
          state: 'healthy',
          latency_ms: 40 + index,
          moving_avg_ms: 45 + index,
          avg10_ms: null,
          observed_at: now,
          error: null,
        })),
      },
      capabilities: {
        can_select: i % 2 === 0,
        can_override: false,
        supports_nested_groups: true,
        mutable_config: [
          'policy',
          'default_member_id',
          'final_outbound',
          'tolerance',
          'idle_timeout',
          'interrupt_connections',
        ],
        probe_transports: ['tcp', 'udp'],
      },
    }
  })

  providerList.forEach((provider) => {
    provider.node_count = nodeList.filter((node) => node.provider_id === provider.id).length
  })

  const connectionList = Array.from({ length: connections }, (_, i) => {
    const group = groupList[i % groups]
    const node = nodeList[i % nodes]

    return {
      id: `conn-${String(i).padStart(4, '0')}`,
      flow_id: `flow-${i}`,
      pname: ['curl', 'firefox', 'node', 'ssh'][i % 4],
      state: 'active',
      src: `192.168.1.${(i % 200) + 2}:${40000 + i}`,
      dst: `1.2.3.${(i % 250) + 1}:443`,
      domain: `host-${i % 37}.example.com`,
      outbound: i % 9 === 0 ? 'direct' : group.name,
      chain: i % 9 === 0 ? [] : [group.id, node.id],
      chain_source: 'evaluation',
      rule_id: `rule-${i % 5}`,
      rule_expression: `domain(suffix: example-${i % 5}.com)`,
      rule_source: 'kernel',
      ingress: i % 2 === 0 ? 'lan' : 'wan',
      domain_source: 'tls_sni',
      started_at: new Date(Date.now() - i * 1000).toISOString(),
      observed_by: 'userspace',
      upload_bytes: String(1024 * (i + 1)),
      download_bytes: String(4096 * (i + 1)),
      upload_bytes_per_second: String(128 * (i + 1)),
      download_bytes_per_second: String(512 * (i + 1)),
    }
  })

  const rules = Array.from({ length: 24 }, (_, i) => ({
    rule_id: `rule-${i}`,
    index: i,
    expression: `domain(suffix: example-${i}.com) && port(443)`,
    outbound: groupList[i % groups].name,
    must: i % 8 === 0,
    source: { file: 'config.dae', line: i + 10 },
    kind: 'rule',
  }))

  rules.push({
    rule_id: 'rule-fallback',
    index: rules.length,
    expression: 'fallback',
    outbound: groupList[0].name,
    must: false,
    source: { file: 'config.dae', line: 99 },
    kind: 'fallback',
  })

  return { providerList, nodeList, groupList, connectionList, rules }
}

export const createMockDaeServer = (options = {}) => {
  const {
    groups = 3,
    nodes = 12,
    connections = 40,
    providers = 2,
    port = 9527,
    host = '127.0.0.1',
    token = '',
  } = options

  const fixture = buildFixture({ groups, nodes, connections, providers })
  const startedAt = Date.now()
  let uploadTotal = 1024 * 1024 * 32
  let downloadTotal = 1024 * 1024 * 512
  const operations = new Map()
  const probeStamps = []
  let lifecycleState = 'running'
  let runtimeSettings = {
    observed_at: new Date().toISOString(),
    source: 'config',
    log: { level: 'info', buffered_records: 512 },
    dns_log: { max_records: 512 },
    flows: { max_flows: 1024, retention_seconds: 300 },
  }
  const configSources = [
    {
      id: 'source-main',
      path: '<redacted>',
      kind: 'main',
      content_sha256: 'a'.repeat(64),
      bytes: 0,
      writable: true,
      loaded_at: new Date(startedAt).toISOString(),
      line_count: 0,
      content: 'global {\n  log_level: info\n}\n\nrouting {\n  fallback: proxy\n}\n',
    },
  ]

  const json = (res, body, status = 200) => {
    const payload = JSON.stringify(body)

    res.writeHead(status, {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...CORS,
    })
    res.end(payload)
  }

  const fail = (res, status, code, message, headers = {}) => {
    const payload = JSON.stringify({ error: { code, message }, request_id: 'mock-request' })

    res.writeHead(status, {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      ...CORS,
      ...headers,
    })
    res.end(payload)
  }

  const authorized = (req, res) => {
    const header = req.headers['authorization']

    if (token) {
      if (header !== `Bearer ${token}`) {
        fail(res, 401, 'unauthorized', 'missing or invalid credentials')
        return false
      }
      return true
    }

    if (header) {
      fail(res, 401, 'unauthorized', 'credentials are not accepted without a configured secret')
      return false
    }

    return true
  }

  const readBody = (req) =>
    new Promise((resolve) => {
      let body = ''

      req.on('data', (chunk) => (body += chunk))
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {})
        } catch {
          resolve({})
        }
      })
    })

  const accept = (res, kind) => {
    const id = `op-${operations.size + 1}`

    operations.set(id, { kind, createdAt: Date.now() })
    json(res, { operation_id: id, kind, status: 'queued', href: `/api/v1/operations/${id}` }, 202)
  }

  const probeResult = (target, members) => ({
    target,
    selection_changed: { tcp: false, udp: false },
    selection_before: { tcp: null, udp: null },
    selection_after: { tcp: null, udp: null },
    results: members.map((memberId, index) => ({
      member_id: memberId,
      resolved_leaf_node_id: memberId,
      kind: 'http',
      purpose: 'data',
      transport: 'tcp',
      ip_version: 'ipv4',
      warmth: 'cold',
      state: index % 6 === 0 ? 'unavailable' : 'healthy',
      latency_ms: index % 6 === 0 ? null : 30 + index * 7,
      health_updated: true,
      error: null,
      observed_at: new Date().toISOString(),
    })),
  })

  let lastProbe = null

  const server = createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      res.end()
      return
    }

    const url = new URL(req.url, `http://${req.headers.host}`)
    const path = url.pathname

    if (!authorized(req, res)) return

    if (path === '/api') {
      json(res, {
        name: 'dae/honk-native',
        status: 'draft',
        api_major: 1,
        base_path: '/api/v1',
        links: { version: '/api/v1/version' },
      })
      return
    }

    if (path === '/api/v1/version') {
      json(res, {
        api: { name: 'dae/honk-native', major: 1, status: 'draft' },
        engine: { name: 'dae', version: '1.0.0-mock' },
        build: null,
      })
      return
    }

    if (path === '/api/v1/capabilities') {
      json(res, {
        observed_at: new Date().toISOString(),
        profiles: ['base'],
        limits: {
          max_request_target_bytes: 8192,
          max_header_bytes: 16384,
          max_json_body_bytes: 1048576,
        },
        resources: {
          config: {
            available: true,
            content: true,
            writable: true,
            max_bytes: 1048576,
            max_sources: 32,
          },
          config_validate: { available: true, modes: ['syntax', 'full'] },
          runtime: { available: true },
          runtime_memory: { available: true, metrics: ['process.rss_bytes'] },
          runtime_outbounds: { available: true },
          traffic_history: { available: true, max_window_seconds: 600, max_points: 300 },
          memory_history: { available: true, max_window_seconds: 600, max_points: 300 },
          datapath: { available: true, kinds: ['ebpf'], details: ['attachments'] },
          nodes: { available: true, can_manage: true },
          providers: { available: true, can_refresh: true, can_manage: true, max_page_size: 1000 },
          groups: { available: true, config_patch: true, selection: true, max_patch_operations: 8 },
          probes: {
            available: true,
            targets: ['node', 'group'],
            kinds: ['tcp_connect', 'http', 'dns'],
            purposes: ['data', 'dns'],
            transports: ['tcp', 'udp'],
            ip_versions: ['ipv4', 'ipv6', 'any'],
            limits: {
              max_members_per_job: 64,
              max_results_per_job: 64,
              max_active_jobs: 4,
              max_queued_jobs: 16,
              max_concurrent_per_target: 1,
              job_timeout_ms: 30000,
              per_principal_requests_per_minute: 30,
              global_requests_per_minute: 30,
            },
          },
          connections: { available: true, can_close: true, max_bulk_close: 1000 },
          flows: { available: true, recording: 'on', max_page_size: 200 },
          routing_trace: { available: true, resolve_modes: ['none'], max_addresses: 1 },
          rules: { available: true, max_rules: 1000 },
          events: {
            available: true,
            kinds: [
              'stream.ready',
              'runtime.updated',
              'flow.updated',
              'flow.gap',
              'generation.changed',
              'operation.updated',
            ],
            heartbeat_seconds: 15,
          },
          logs: {
            available: true,
            levels: ['trace', 'debug', 'info', 'warn', 'error'],
            max_buffered_records: 1000,
          },
          dns_query: { available: true, record_types: ['A', 'AAAA'] },
          dns_cache: {
            available: true,
            read: true,
            delete_entry: true,
            delete_name: true,
            flush: true,
            entry_kinds: ['positive', 'negative'],
          },
          dns_log: { available: true, max_records: 1000, max_page_size: 200 },
          runtime_settings: {
            available: true,
            fields: [
              'log.level',
              'log.buffered_records',
              'dns_log.max_records',
              'flows.max_flows',
              'flows.retention_seconds',
            ],
          },
          operations: { available: true, retention_seconds: 300 },
          reload: { available: true },
          suspend: { available: true },
          resume: { available: true },
          geodata: { available: true, can_update: true, assets: ['geosite', 'geoip'] },
        },
      })
      return
    }

    if (path === '/api/v1/runtime') {
      uploadTotal += 1024 * 64
      downloadTotal += 1024 * 512

      json(res, {
        observed_at: new Date().toISOString(),
        instance_id: 'instance-mock',
        lifecycle: {
          state: lifecycleState,
          started_at: new Date(startedAt).toISOString(),
          uptime_seconds: String(Math.floor((Date.now() - startedAt) / 1000)),
        },
        generation: {
          active_id: 'generation-1',
          config_revision: '1',
          state: 'active',
          activated_at: new Date(startedAt).toISOString(),
        },
        datapath: { kind: 'ebpf', state: 'active', visibility: 'full', ebpf: null },
        traffic: {
          scope: 'visible',
          observed_by: 'mixed',
          counter_since: new Date(startedAt).toISOString(),
          sampled_at: new Date().toISOString(),
          connections: {
            tcp: fixture.connectionList.length,
            udp: 0,
            total: fixture.connectionList.length,
          },
          bytes: { upload: String(uploadTotal), download: String(downloadTotal) },
          rates: {
            window_seconds: 1,
            upload_bytes_per_second: String(64 * 1024 + Math.floor(Math.random() * 20000)),
            download_bytes_per_second: String(512 * 1024 + Math.floor(Math.random() * 100000)),
          },
        },
        process: { pid: process.pid, cpu_percent: 1.5 },
        last_reload: null,
      })
      return
    }

    if (path === '/api/v1/runtime/memory') {
      json(res, {
        observed_at: new Date().toISOString(),
        process: { rss_bytes: String(64 * 1024 * 1024 + Math.floor(Math.random() * 4000000)) },
        cgroup: null,
        kernel: null,
      })
      return
    }

    if (path === '/api/v1/runtime/outbounds') {
      json(res, {
        observed_at: new Date().toISOString(),
        counter_since: new Date(startedAt).toISOString(),
        outbounds: [
          ...fixture.groupList.map((group, i) => ({
            name: group.name,
            kind: 'group',
            active_connections: 3 + i,
            total_connections: String(100 + i * 7),
            upload_bytes: String(1024 * 1024 * (i + 1)),
            download_bytes: String(1024 * 1024 * 8 * (i + 1)),
            errors: String(i),
          })),
          {
            name: 'direct',
            kind: 'builtin',
            active_connections: 5,
            total_connections: '321',
            upload_bytes: '1048576',
            download_bytes: '8388608',
            errors: '0',
          },
        ],
      })
      return
    }

    if (path === '/api/v1/runtime/settings' && req.method === 'PATCH') {
      readBody(req).then((payload) => {
        runtimeSettings = {
          observed_at: new Date().toISOString(),
          source: 'runtime',
          log: { ...runtimeSettings.log, ...(payload.log ?? {}) },
          dns_log: { ...runtimeSettings.dns_log, ...(payload.dns_log ?? {}) },
          flows: { ...runtimeSettings.flows, ...(payload.flows ?? {}) },
        }
        json(res, runtimeSettings)
      })
      return
    }

    if (path === '/api/v1/runtime/settings') {
      json(res, { ...runtimeSettings, observed_at: new Date().toISOString() })
      return
    }

    if (path === '/api/v1/groups') {
      json(
        res,
        fixture.groupList.map((group) => ({
          id: group.id,
          name: group.name,
          icon: group.icon,
          config_revision: group.config_revision,
          policy: group.policy,
          member_count: group.members.length,
          selection: {
            tcp_member_id: group.runtime.selection.tcp?.member_id ?? null,
            udp_member_id: group.runtime.selection.udp?.member_id ?? null,
          },
        })),
      )
      return
    }

    const groupMatch = /^\/api\/v1\/groups\/([^/]+)$/.exec(path)

    if (groupMatch && req.method === 'PATCH') {
      accept(res, 'group_update')
      return
    }

    if (groupMatch) {
      const group = fixture.groupList.find((item) => item.id === decodeURIComponent(groupMatch[1]))

      if (!group) {
        json(res, { error: { code: 'not_found', message: 'unknown group' } }, 404)
        return
      }

      json(res, group)
      return
    }

    const selectionMatch = /^\/api\/v1\/groups\/([^/]+)\/selection$/.exec(path)

    if (selectionMatch) {
      const group = fixture.groupList.find(
        (item) => item.id === decodeURIComponent(selectionMatch[1]),
      )

      if (!group) {
        json(res, { error: { code: 'not_found', message: 'unknown group' } }, 404)
        return
      }

      if (req.method === 'PUT') {
        let body = ''

        req.on('data', (chunk) => (body += chunk))
        req.on('end', () => {
          const { member_id: memberId } = JSON.parse(body || '{}')
          const selection = {
            member_id: memberId,
            resolved_leaf_node_id: memberId,
            source: 'runtime',
          }

          group.runtime.selection.tcp = selection
          group.runtime.selection.udp = selection

          json(res, {
            group_id: group.id,
            member_id: memberId,
            resolved_leaf_node_id: memberId,
            network: 'both',
            source: 'runtime',
            selection_revision: '2',
            connections_interrupted: false,
          })
        })
        return
      }

      if (req.method === 'DELETE') {
        fail(res, 404, 'capability_not_supported', 'automatic-policy clear is unavailable')
        return
      }

      json(res, {
        group_id: group.id,
        network: 'both',
        selection_revision: '3',
        connections_interrupted: false,
        selection: group.runtime.selection,
      })
      return
    }

    if (path === '/api/v1/nodes') {
      json(res, {
        observed_at: new Date().toISOString(),
        nodes: fixture.nodeList,
        next_cursor: null,
      })
      return
    }

    if (path === '/api/v1/providers') {
      json(res, { providers: fixture.providerList, next_cursor: null })
      return
    }

    if (/^\/api\/v1\/providers\/[^/]+\/refresh$/.test(path)) {
      accept(res, 'provider_refresh')
      return
    }

    if (path === '/api/v1/rules') {
      json(res, {
        generation_id: 'generation-1',
        rules: fixture.rules,
        fallback: { outbound: fixture.groupList[0].name, source: { file: 'config.dae', line: 99 } },
      })
      return
    }

    if (path === '/api/v1/connections') {
      if (req.method === 'DELETE') {
        json(res, { closed: fixture.connectionList.length, skipped: 0 })
        return
      }

      json(res, {
        observed_at: new Date().toISOString(),
        instance_id: 'instance-mock',
        visibility: 'full',
        truncated: false,
        tcp: fixture.connectionList.map((connection) => ({
          ...connection,
          upload_bytes: String(Number(connection.upload_bytes) + (Date.now() % 100000)),
          download_bytes: String(Number(connection.download_bytes) + (Date.now() % 400000)),
        })),
        udp: [],
        total_tcp: fixture.connectionList.length,
        total_udp: 0,
      })
      return
    }

    if (/^\/api\/v1\/connections\/[^/]+$/.test(path) && req.method === 'DELETE') {
      json(res, { closed: 1, skipped: 0 })
      return
    }

    if (path === '/api/v1/probes' && req.method === 'POST') {
      const now = Date.now()

      while (probeStamps.length && now - probeStamps[0] > PROBE_WINDOW) probeStamps.shift()

      if (probeStamps.length >= PROBE_QUOTA) {
        fail(res, 429, 'rate_limited', 'probe rate ceiling reached', { 'retry-after': '1' })
        return
      }

      probeStamps.push(now)

      let body = ''

      req.on('data', (chunk) => (body += chunk))
      req.on('end', () => {
        const payload = JSON.parse(body || '{}')

        if (payload.target?.type === 'node') {
          lastProbe = probeResult(payload.target, [payload.target.node_id])
        } else {
          const group = fixture.groupList.find((item) => item.id === payload.target?.group_id)

          lastProbe = probeResult(
            payload.target,
            (group?.members ?? []).map((member) => member.id),
          )
        }

        accept(res, 'probe')
      })
      return
    }

    if (path === '/api/v1/operations/reload' && req.method === 'POST') {
      accept(res, 'reload')
      return
    }

    const operationMatch = /^\/api\/v1\/operations\/([^/]+)$/.exec(path)

    if (operationMatch) {
      const id = decodeURIComponent(operationMatch[1])
      const operation = operations.get(id)

      if (!operation) {
        json(res, { error: { code: 'not_found', message: 'unknown operation' } }, 404)
        return
      }

      json(res, {
        operation_id: id,
        kind: operation.kind,
        status: 'succeeded',
        created_at: new Date(operation.createdAt).toISOString(),
        started_at: new Date(operation.createdAt).toISOString(),
        finished_at: new Date().toISOString(),
        result: operation.kind === 'probe' ? lastProbe : {},
        error: null,
      })
      return
    }

    if (path === '/api/v1/geodata') {
      json(res, { observed_at: new Date().toISOString(), assets: [] })
      return
    }

    if (path === '/api/v1/geodata/update' && req.method === 'POST') {
      accept(res, 'geodata_update')
      return
    }

    if (path === '/api/v1/dns/cache/flush' && req.method === 'POST') {
      json(res, { deleted: 12 })
      return
    }

    if (path === '/api/v1/dns/query') {
      const domain = url.searchParams.get('domain') ?? 'example.com'
      const types = url.searchParams.getAll('type')

      json(res, {
        domain,
        cache_mode: 'normal',
        query_time: new Date().toISOString(),
        results: (types.length ? types : ['A']).map((type) => ({
          type,
          cached: false,
          cache_entry_id: null,
          upstream: 'udp://1.1.1.1:53',
          route: { source: 'dns.routing', rule: `domain(${domain})` },
          status: 'NOERROR',
          elapsed_ms: 12,
          question: { name: `${domain}.`, type },
          answers: [
            {
              name: `${domain}.`,
              type,
              class: 'IN',
              ttl: 300,
              data: type === 'AAAA' ? '2606:2800:220:1:248:1893:25c8:1946' : '93.184.216.34',
            },
          ],
        })),
      })
      return
    }

    if (path === '/api/v1/logs') {
      const resume = req.headers['last-event-id']
      const resumeSeq = resume ? Number(resume.split(':').pop()) : Number.NaN

      if (resume && !Number.isFinite(resumeSeq)) {
        json(res, { error: { code: 'event_cursor_expired', message: 'unknown cursor' } }, 409)
        return
      }

      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-store',
        connection: 'keep-alive',
        ...CORS,
      })

      let seq = Number.isFinite(resumeSeq) ? resumeSeq + 1 : 0

      const frame = (event, data) =>
        `id: instance-mock:logs:${seq++}\r\nevent: ${event}\r\ndata: ${JSON.stringify(data)}\r\n\r\n`

      res.write(
        frame('stream.ready', {
          instance_id: 'instance-mock',
          observed_at: new Date().toISOString(),
        }),
      )

      const timer = setInterval(() => {
        res.write(
          frame('log', {
            ts: new Date().toISOString(),
            level: ['info', 'warn', 'debug', 'error'][seq % 4],
            target: 'dae::routing',
            message: `mock log line ${seq}`,
            fields: null,
          }),
        )
      }, 1000)

      req.on('close', () => clearInterval(timer))
      return
    }

    if (path === '/api/v1/flows') {
      const full = url.searchParams.get('detail') === 'full'
      const live = fixture.connectionList.slice(0, 20).map((connection, index) => ({
        id: `flow-${index}`,
        connection_id: connection.id,
        state: 'active',
        network: 'tcp',
        pname: connection.pname,
        outbound: connection.outbound,
        chain: connection.chain,
        rule_id: connection.rule_id,
        rule_expression: connection.rule_expression,
        started_at: connection.started_at,
        src: connection.src,
        dst: connection.dst,
        domain: connection.domain,
      }))
      const terminal = Array.from({ length: 8 }, (_, i) => ({
        id: `flow-terminal-${i}`,
        connection_id: null,
        state: ['closed', 'failed', 'blocked'][i % 3],
        network: i % 4 === 0 ? 'udp' : 'tcp',
        pname: ['curl', 'firefox', 'node'][i % 3],
        outbound: i % 3 === 2 ? 'block' : fixture.groupList[i % fixture.groupList.length].name,
        chain: i % 3 === 2 ? [] : [fixture.groupList[i % fixture.groupList.length].id],
        rule_id: `rule-${i}`,
        rule_expression: `domain(suffix: terminal-${i}.example.com)`,
        started_at: new Date(Date.now() - (i + 1) * 30000).toISOString(),
        src: `192.168.1.${20 + i}:5${i}123`,
        dst: `203.0.113.${10 + i}:443`,
        domain: `terminal-${i}.example.com`,
      }))

      json(res, {
        instance_id: 'instance-mock',
        observed_at: new Date().toISOString(),
        coverage: { userspace_tcp: 'partial', userspace_udp: 'partial', kernel_direct: 'none' },
        dropped_records: 0,
        flows: [...terminal, ...live].map((flow) => {
          const row = {
            id: flow.id,
            instance_id: 'instance-mock',
            revision: 2,
            network: flow.network,
            state: flow.state,
            pname: flow.pname,
            connection_id: flow.connection_id,
            outbound: flow.outbound,
            chain: flow.chain,
            chain_source: 'captured',
            rule_id: flow.rule_id,
            rule_expression: flow.rule_expression,
            rule_source: 'userspace',
            domain_source: 'sniffed',
            observed_by: 'userspace',
            started_at: flow.started_at,
            ended_at: flow.connection_id ? null : flow.started_at,
            trace_status: 'partial',
          }

          if (full) {
            row.input = {
              src: flow.src,
              dst: flow.dst,
              domain: flow.domain,
              domain_source: 'sniffed',
              pid: null,
              src_mac: null,
              dscp: null,
              mark: null,
            }
          }

          return row
        }),
        next_cursor: null,
      })
      return
    }

    const flowMatch = /^\/api\/v1\/flows\/([^/]+)$/.exec(path)

    if (flowMatch) {
      json(res, {
        id: decodeURIComponent(flowMatch[1]),
        instance_id: 'instance-mock',
        revision: 2,
        network: 'tcp',
        state: 'established',
        pname: 'curl',
        connection_id: fixture.connectionList[0]?.id ?? null,
        outbound: fixture.groupList[0].name,
        chain: [],
        chain_source: 'captured',
        rule_id: 'rule-1',
        rule_expression: 'domain(suffix: example.com)',
        rule_source: 'userspace',
        domain_source: 'sniffed',
        observed_by: 'userspace',
        started_at: new Date(Date.now() - 5000).toISOString(),
        ended_at: null,
        trace_status: 'partial',
        trace: {
          status: 'partial',
          missing: ['not_instrumented'],
          steps: [
            {
              seq: 1,
              observed_at: new Date(Date.now() - 5000).toISOString(),
              elapsed_us: 120,
              generation_id: 'instance-mock:1',
              evidence: 'observed',
              stage: 'input',
              data: { source: 'socket' },
            },
            {
              seq: 2,
              observed_at: new Date(Date.now() - 4800).toISOString(),
              elapsed_us: 980,
              generation_id: 'instance-mock:1',
              evidence: 'observed',
              stage: 'route',
              data: { outbound: fixture.groupList[0].name, must: false, plane: 'userspace' },
            },
            {
              seq: 3,
              observed_at: new Date(Date.now() - 4600).toISOString(),
              elapsed_us: 24000,
              generation_id: 'instance-mock:1',
              evidence: 'observed',
              stage: 'outbound',
              data: { status: 'established', attempt_id: 'attempt-1' },
            },
          ],
        },
      })
      return
    }

    if (path === '/api/v1/dns/cache') {
      if (req.method === 'DELETE') {
        json(res, { matched: 2, deleted: 2 })
        return
      }

      const name = url.searchParams.get('name') ?? ''
      const entries = Array.from({ length: 12 }, (_, i) => ({
        entry_id: `entry-${i}`,
        domain: name || `cached-${i}.example.com.`,
        type: i % 3 === 0 ? 'AAAA' : 'A',
        class: 'IN',
        status: i % 7 === 0 ? 'NXDOMAIN' : 'NOERROR',
        expires_at: new Date(Date.now() + 60000 * (i + 1)).toISOString(),
        stale_until: null,
        answers: [],
      }))

      json(res, {
        observed_at: new Date().toISOString(),
        coverage: { positive: true, negative: true, persistent: false },
        entries,
        total: entries.length,
        next_cursor: null,
      })
      return
    }

    if (/^\/api\/v1\/dns\/cache\/[^/]+$/.test(path) && req.method === 'DELETE') {
      json(res, { deleted: 1 })
      return
    }

    if (path === '/api/v1/dns/log') {
      const records = Array.from({ length: 15 }, (_, i) => ({
        id: `dns-log-${i}`,
        observed_at: new Date(Date.now() - i * 2000).toISOString(),
        src: `192.168.1.${10 + (i % 20)}:5${i}000`,
        question: { name: `query-${i}.example.com.`, type: i % 4 === 0 ? 'AAAA' : 'A' },
        status: i % 9 === 0 ? 'NXDOMAIN' : 'NOERROR',
        cached: i % 3 === 0,
        upstream: i % 3 === 0 ? null : 'udp://1.1.1.1:53',
        route: { source: 'dns.routing', rule: 'fallback' },
        elapsed_ms: 3 + i,
        answers: [],
      }))

      json(res, {
        observed_at: new Date().toISOString(),
        total: records.length,
        next_cursor: null,
        records,
      })
      return
    }

    if (path === '/api/v1/routing/trace' && req.method === 'POST') {
      readBody(req).then((payload) => {
        const input = payload.input ?? {}

        json(res, {
          mode: 'simulation',
          instance_id: 'instance-mock',
          generation_id: 'instance-mock:1',
          observed_at: new Date().toISOString(),
          evaluations: [
            {
              dst_ip: input.dst_ip ?? null,
              decision: 'matched',
              outbound: fixture.groupList[0].name,
              missing_inputs: input.pname ? [] : ['pname'],
              rules: fixture.rules.slice(0, 4).map((rule, index) => ({
                rule_id: rule.rule_id,
                expression: rule.expression,
                result: index === 2 ? 'true' : 'false',
                missing_inputs: [],
                conditions: [],
              })),
            },
          ],
          dns: [],
        })
      })
      return
    }

    if (path === '/api/v1/datapath') {
      json(res, {
        observed_at: new Date().toISOString(),
        kind: 'ebpf',
        state: 'active',
        visibility: 'partial',
        ebpf: {
          backend: 'aya',
          programs: 'loaded',
          hooks: 'attached',
          routing: { state: 'published', generation_id: 'datapath:1', epoch: '1' },
          health: 'healthy',
          last_error: null,
          checked_at: new Date().toISOString(),
          attachments: [
            { name: 'tproxy_ingress', interface: 'eth0', direction: 'ingress', state: 'attached' },
            { name: 'tproxy_egress', interface: 'eth0', direction: 'egress', state: 'attached' },
          ],
          maps: {
            state: 'ready',
            conn_state: { occupancy: 128, capacity: 65536, occupancy_known: true },
          },
        },
        errors: [],
      })
      return
    }

    if (path === '/api/v1/runtime/traffic/history' || path === '/api/v1/runtime/memory/history') {
      const memory = path.endsWith('memory/history')
      const points = 120
      const samples = Array.from({ length: points }, (_, i) => {
        const sampledAt = new Date(Date.now() - (points - i) * 1000).toISOString()

        return memory
          ? {
              sampled_at: sampledAt,
              rss_bytes: String(48 * 1024 * 1024 + i * 4096),
              cgroup_current_bytes: null,
            }
          : {
              sampled_at: sampledAt,
              upload_bytes_per_second: String(64 * 1024 + ((i * 977) % 40000)),
              download_bytes_per_second: String(512 * 1024 + ((i * 3571) % 300000)),
              connections: fixture.connectionList.length,
            }
      })

      json(res, {
        observed_at: new Date().toISOString(),
        window_seconds: points,
        sampled_every_seconds: 1,
        samples,
      })
      return
    }

    if (path === '/api/v1/config') {
      json(res, {
        generation_id: 'instance-mock:1',
        revision: 'revision-1',
        sources: configSources,
        diagnostics: [],
        secrets_redacted: true,
      })
      return
    }

    const configSourceMatch = /^\/api\/v1\/config\/sources\/([^/]+)$/.exec(path)

    if (configSourceMatch) {
      const sourceId = decodeURIComponent(configSourceMatch[1])
      const source = configSources.find((item) => item.id === sourceId)

      if (!source) {
        fail(res, 404, 'resource_not_found', 'unknown source')
        return
      }

      if (req.method === 'PUT') {
        const tag = req.headers['if-match']

        if (tag !== `"${source.content_sha256}"`) {
          fail(res, 412, 'precondition_failed', 'stale source revision')
          return
        }

        readBody(req).then((payload) => {
          source.content = String(payload.content ?? '')
          source.bytes = source.content.length
          source.line_count = source.content.split('\n').length
          source.content_sha256 = Array.from({ length: 64 }, () =>
            Math.floor(Math.random() * 16).toString(16),
          ).join('')
          accept(res, 'reload')
        })
        return
      }

      json(res, source)
      return
    }

    if (path === '/api/v1/config/validate' && req.method === 'POST') {
      readBody(req).then((payload) => {
        const content = payload.sources?.[0]?.content ?? ''
        const valid = !content.includes('routing {\n') || content.includes('fallback')

        json(res, {
          valid,
          generation_id: 'instance-mock:1',
          validated_at: new Date().toISOString(),
          diagnostics: valid
            ? []
            : [
                {
                  level: 'error',
                  source_id: 'candidate',
                  line: 1,
                  column: 1,
                  code: 'unterminated-section',
                  message: 'routing section is not terminated',
                },
              ],
        })
      })
      return
    }

    if (path === '/api/v1/nodes' && req.method === 'POST') {
      readBody(req).then((payload) => {
        const node = {
          id: `node-inline-${fixture.nodeList.length}`,
          name: String(payload.name ?? 'node'),
          protocol: 'socks5',
          subscription_tag: null,
          provider_id: 'inline',
          group_ids: [],
          health: [],
        }

        fixture.nodeList.push(node)
        json(res, node, 201)
      })
      return
    }

    const nodeMatch = /^\/api\/v1\/nodes\/([^/]+)$/.exec(path)

    if (nodeMatch && req.method === 'DELETE') {
      const nodeId = decodeURIComponent(nodeMatch[1])
      const index = fixture.nodeList.findIndex((node) => node.id === nodeId)

      if (index !== -1) fixture.nodeList.splice(index, 1)

      json(res, { deleted: index === -1 ? 0 : 1 })
      return
    }

    if (path === '/api/v1/providers' && req.method === 'POST') {
      readBody(req).then((payload) => {
        const provider = {
          id: `provider-${fixture.providerList.length}`,
          name: String(payload.name ?? 'provider'),
          kind: 'subscription',
          url_redacted: `provider-${fixture.providerList.length}`,
          node_count: 0,
          updated_at: null,
          expires_at: null,
          traffic: null,
          status: 'stale',
          last_error: null,
        }

        fixture.providerList.push(provider)
        json(res, provider, 201)
      })
      return
    }

    const providerMatch = /^\/api\/v1\/providers\/([^/]+)$/.exec(path)

    if (providerMatch && req.method === 'DELETE') {
      const providerId = decodeURIComponent(providerMatch[1])
      const index = fixture.providerList.findIndex((provider) => provider.id === providerId)

      if (index !== -1) fixture.providerList.splice(index, 1)

      json(res, { deleted: index === -1 ? 0 : 1 })
      return
    }

    if (path === '/api/v1/operations/suspend' && req.method === 'POST') {
      lifecycleState = 'suspended'
      accept(res, 'suspend')
      return
    }

    if (path === '/api/v1/operations/resume' && req.method === 'POST') {
      lifecycleState = 'running'
      accept(res, 'resume')
      return
    }

    if (path === '/api/v1/events') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-store',
        connection: 'keep-alive',
        ...CORS,
      })

      let seq = 0
      const frame = (event, data) =>
        `id: instance-mock:events:${seq++}\r\nevent: ${event}\r\ndata: ${JSON.stringify(data)}\r\n\r\n`

      res.write(frame('stream.ready', { instance_id: 'instance-mock' }))

      const timer = setInterval(() => {
        res.write(
          frame('runtime.updated', {
            instance_id: 'instance-mock',
            observed_at: new Date().toISOString(),
          }),
        )
      }, 15000)

      req.on('close', () => clearInterval(timer))
      return
    }

    json(res, { error: { code: 'not_found', message: `unknown path ${path}` } }, 404)
  })

  return new Promise((resolve) => {
    server.listen(port, host, () => resolve({ server, port, host, fixture }))
  })
}

const isMain = process.argv[1]?.endsWith('mock-dae-server.mjs')

if (isMain) {
  const { values } = parseArgs({
    options: {
      groups: { type: 'string', default: '3' },
      nodes: { type: 'string', default: '12' },
      conns: { type: 'string', default: '40' },
      providers: { type: 'string', default: '2' },
      port: { type: 'string', default: '9527' },
      token: { type: 'string', default: '' },
    },
  })

  const { host, port } = await createMockDaeServer({
    groups: Number(values.groups),
    nodes: Number(values.nodes),
    connections: Number(values.conns),
    providers: Number(values.providers),
    port: Number(values.port),
    token: values.token,
  })

  console.log(`mock dae api: http://${host}:${port}`)
}
