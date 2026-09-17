/*
 * 模拟 mihomo 的 Clash API,用来造出「代理组特别多」的现场(见 issue #784)。
 *
 * 单独跑:
 *   node test/mock-server.mjs --groups 150 --nodes 60 --conns 300 --port 9999
 * 然后把面板指到 http://127.0.0.1:9999 即可(密码留空)。
 *
 * 也被 test/bench.mjs 与 test/verify.mjs 当模块用。
 */
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { parseArgs } from 'node:util'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
}

const buildFixture = ({ groups, nodes, connections, providers: providerCount }) => {
  const now = new Date().toISOString()
  const nodeNames = Array.from({ length: nodes }, (_, i) => `Node-${String(i).padStart(3, '0')} 🇭🇰`)
  const groupNames = Array.from({ length: groups }, (_, i) => `Group-${String(i).padStart(3, '0')}`)
  const proxies = {}

  nodeNames.forEach((name, i) => {
    proxies[name] = {
      name,
      type: 'Vmess',
      udp: true,
      xudp: false,
      alive: i % 7 !== 0,
      // 每 7 个留一个不可用的,好覆盖「隐藏不可用节点」这类分支
      history: [{ time: now, delay: i % 7 === 0 ? 0 : 50 + (i % 400) }],
      'provider-name': `provider-${i % providerCount}`,
    }
  })
  proxies.DIRECT = { name: 'DIRECT', type: 'Direct', udp: true, history: [], alive: true }
  proxies.REJECT = { name: 'REJECT', type: 'Reject', udp: false, history: [], alive: true }

  groupNames.forEach((name, i) => {
    proxies[name] = {
      name,
      // 混着来:面板测速模式只对 Selector 这类走「逐个测速」的分支
      type: i % 3 === 0 ? 'Selector' : 'URLTest',
      now: nodeNames[i % nodes],
      all: [...nodeNames, 'DIRECT', 'REJECT'],
      history: [{ time: now, delay: 80 + (i % 200) }],
      alive: true,
      udp: true,
      hidden: false,
    }
  })
  proxies.GLOBAL = {
    name: 'GLOBAL',
    type: 'Selector',
    now: groupNames[0],
    all: [...groupNames, ...nodeNames, 'DIRECT', 'REJECT'],
    history: [],
    alive: true,
  }

  const providers = {}

  for (let i = 0; i < providerCount; i++) {
    const name = `provider-${i}`

    providers[name] = {
      name,
      type: 'Proxy',
      vehicleType: 'HTTP',
      updatedAt: now,
      proxies: nodeNames.filter((_, index) => index % providerCount === i).map((n) => proxies[n]),
      subscriptionInfo: { Upload: 1e9, Download: 5e10, Total: 1e12, Expire: 1893456000 },
    }
  }

  const activeConnections = Array.from({ length: connections }, (_, i) => ({
    id: `conn-${i}`,
    metadata: {
      network: 'tcp',
      type: 'HTTP',
      sourceIP: '192.168.1.2',
      destinationIP: '1.1.1.1',
      sourcePort: `${10000 + i}`,
      destinationPort: '443',
      host: `example-${i}.com`,
      process: 'chrome',
    },
    upload: 1000 * i,
    download: 5000 * i,
    start: now,
    // 链路带上组名,组卡片的下行速率才有东西可算
    chains: [nodeNames[i % nodes], groupNames[i % groups], groupNames[(i + 1) % groups]],
    rule: 'DomainSuffix',
    rulePayload: 'example.com',
  }))

  return { proxies, providers, nodeNames, groupNames, activeConnections }
}

// 手写 WebSocket 文本帧,省掉一个 ws 依赖
const websocketFrame = (text) => {
  const payload = Buffer.from(text)
  let header

  if (payload.length < 126) {
    header = Buffer.from([0x81, payload.length])
  } else if (payload.length < 65536) {
    header = Buffer.alloc(4)
    header[0] = 0x81
    header[1] = 126
    header.writeUInt16BE(payload.length, 2)
  } else {
    header = Buffer.alloc(10)
    header[0] = 0x81
    header[1] = 127
    header.writeBigUInt64BE(BigInt(payload.length), 2)
  }

  return Buffer.concat([header, payload])
}

export const createMockServer = async ({
  port = 0,
  groups = 150,
  nodes = 60,
  connections = 300,
  providers: providerCount = 4,
} = {}) => {
  const fixture = buildFixture({ groups, nodes, connections, providers: providerCount })
  const { proxies, providers, nodeNames, activeConnections } = fixture

  /*
   * 两个可在运行时改的开关,verify 会用到:
   * - stableLatency:关掉「每次拉 /proxies 都换一批延迟」,这样测速时新写进去的值才好辨认;
   * - latencyDelayMs:让单节点测速慢一点,才采得到「乐观写入」的中间态。
   */
  const control = { stableLatency: false, latencyDelayMs: 0, latencyValue: 999 }
  let fetchCount = 0

  const configs = {
    port: 7890,
    'socks-port': 7891,
    'mixed-port': 7890,
    mode: 'rule',
    'log-level': 'info',
    'allow-lan': false,
    tun: { enable: false, stack: 'gVisor' },
    'mode-list': ['rule', 'global', 'direct'],
  }

  const rollLatencies = () => {
    if (control.stableLatency) return

    fetchCount++
    for (const name of nodeNames) {
      const node = proxies[name]

      if (node.history.length) {
        node.history = [{ time: new Date().toISOString(), delay: 100 + ((fetchCount * 7) % 300) }]
      }
    }
  }

  const json = (res, data) => {
    res.writeHead(200, { 'content-type': 'application/json', ...CORS })
    res.end(JSON.stringify(data))
  }

  const readBody = (req) =>
    new Promise((resolve) => {
      let body = ''

      req.on('data', (chunk) => (body += chunk))
      req.on('end', () => {
        try {
          resolve(JSON.parse(body))
        } catch {
          resolve({})
        }
      })
    })

  const server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost')

    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      return res.end()
    }

    // 测试脚本用来切换上面那两个开关
    if (pathname === '/__mock/control') {
      Object.assign(control, await readBody(req))
      return json(res, control)
    }

    if (pathname === '/version') return json(res, { version: 'v1.19.0', meta: true })
    if (pathname === '/configs') {
      // 跟 mihomo 的 PATCH 一样:没送到的字段保持原样,tun 里的子字段也是
      if (req.method === 'PATCH') {
        const patch = await readBody(req)

        Object.assign(configs, patch, patch.tun ? { tun: { ...configs.tun, ...patch.tun } } : {})
      }

      return json(res, configs)
    }
    if (pathname === '/proxies') {
      rollLatencies()
      return json(res, { proxies })
    }
    if (pathname === '/providers/proxies') return json(res, { providers })
    if (pathname === '/providers/rules') return json(res, { providers: {} })
    if (pathname === '/rules') return json(res, { rules: [] })

    // 单节点测速会更新内核里的 history,随后页面重新 GET /proxies 才能看到排序变化。
    // mock 也保留这个语义,否则只能测到请求成功,覆盖不到「测速后重排」这条真实链路。
    const testedProxyName = (() => {
      const proxyMatch = pathname.match(/^\/proxies\/([^/]+)\/delay$/)
      if (proxyMatch) return decodeURIComponent(proxyMatch[1])

      const providerMatch = pathname.match(/^\/providers\/proxies\/[^/]+\/([^/]+)\/healthcheck$/)
      return providerMatch ? decodeURIComponent(providerMatch[1]) : ''
    })()

    if (testedProxyName && proxies[testedProxyName]) {
      proxies[testedProxyName].history = [
        { time: new Date().toISOString(), delay: control.latencyValue },
      ]
    }

    // 测速类端点(节点 / 组 / provider healthcheck)
    if (pathname.endsWith('/delay') || pathname.includes('/healthcheck')) {
      return setTimeout(() => json(res, { delay: control.latencyValue }), control.latencyDelayMs)
    }

    if (pathname.startsWith('/proxies/') && req.method === 'PUT') {
      const groupName = decodeURIComponent(pathname.slice('/proxies/'.length))
      const { name } = await readBody(req)

      if (proxies[groupName] && name) {
        proxies[groupName].now = name
      }

      return json(res, {})
    }

    return json(res, {})
  })

  // 关服务时要主动断掉这些长连接,否则 server.close() 会一直等着它们
  const liveSockets = new Set()

  server.on('upgrade', (req, socket) => {
    liveSockets.add(socket)
    socket.on('close', () => liveSockets.delete(socket))
    const accept = createHash('sha1')
      .update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64')

    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    )

    const { pathname } = new URL(req.url, 'http://localhost')
    let tick = 0
    const timer = setInterval(() => {
      tick++
      try {
        if (pathname.startsWith('/connections')) {
          socket.write(
            websocketFrame(
              JSON.stringify({
                downloadTotal: 1e9 + tick * 1e6,
                uploadTotal: 1e8,
                memory: 1e8,
                connections: activeConnections.map((connection) => ({
                  ...connection,
                  download: connection.download + tick * 1000,
                  upload: connection.upload + tick * 100,
                })),
              }),
            ),
          )
        } else if (pathname.startsWith('/traffic')) {
          socket.write(websocketFrame(JSON.stringify({ up: 1e6, down: 5e6 })))
        } else if (pathname.startsWith('/memory')) {
          socket.write(websocketFrame(JSON.stringify({ inuse: 1e8, oslimit: 0 })))
        }
      } catch {
        clearInterval(timer)
      }
    }, 1000)

    socket.on('close', () => clearInterval(timer))
    socket.on('error', () => clearInterval(timer))
  })

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve))

  const actualPort = server.address().port

  return {
    ...fixture,
    url: `http://127.0.0.1:${actualPort}`,
    port: actualPort,
    close: () =>
      new Promise((resolve) => {
        for (const socket of liveSockets) socket.destroy()
        liveSockets.clear()
        server.closeAllConnections?.()
        server.close(resolve)
      }),
  }
}

const isDirectRun = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())

if (isDirectRun) {
  const { values } = parseArgs({
    options: {
      port: { type: 'string', default: '9999' },
      groups: { type: 'string', default: '150' },
      nodes: { type: 'string', default: '60' },
      conns: { type: 'string', default: '300' },
    },
  })
  const mock = await createMockServer({
    port: Number(values.port),
    groups: Number(values.groups),
    nodes: Number(values.nodes),
    connections: Number(values.conns),
  })

  console.log(
    `mock clash api → ${mock.url}  (groups=${values.groups} nodes=${values.nodes} conns=${values.conns})`,
  )
}
