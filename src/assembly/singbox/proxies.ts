// sing-box API(gRPC daemon.StartedService)后端的代理组装。
// 与 clash 的「拉取式」不同,这里是「流驱动」:订阅 SubscribeGroups / SubscribeOutbounds,
// 每次推送直接重建 assembly/proxies/state 的共享状态,因此选择/测速后无需手动刷新,
// 结果会随流自动回填到 UI。
import { getSingboxClient } from '@/api/singbox/client'
import type { StreamHandle } from '@/api/singbox/streams'
import { subscribeStream } from '@/api/singbox/subscriptions'
import type { Group, GroupItem, Groups, OutboundList } from '@/gen/daemon/started_service_pb'
import { iconReflectList, speedtestTimeout } from '@/store/settings'
import { activeBackend } from '@/store/setup'
import type { Proxy } from '@/types'
import type { ProxiesDriver, ProxiesPayload } from '../driver/types'
import { proxyGroupList, proxyMap, proxyProviederList } from '../proxies/state'

const getHistoryFromItem = (item: GroupItem): Proxy['history'] =>
  item.urlTestDelay > 0
    ? [
        {
          time: new Date(Number(item.urlTestTime) * 1000).toISOString(),
          delay: item.urlTestDelay,
        },
      ]
    : []

const nodeToProxy = (item: GroupItem): Proxy => {
  return {
    name: item.tag,
    type: item.type,
    now: '',
    history: getHistoryFromItem(item),
    extra: {},
    icon: '',
  }
}

let groups = new Map<string, Group>()
let outbounds = new Map<string, GroupItem>()
let handles: StreamHandle[] = []
let sessionKey = ''
let ready: Promise<void> | null = null

type URLTestWaiter = {
  resolve: () => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const urlTestWaiters = new Set<URLTestWaiter>()

const resolveURLTestWaiters = () => {
  for (const waiter of urlTestWaiters) {
    clearTimeout(waiter.timer)
    waiter.resolve()
  }
  urlTestWaiters.clear()
}

const rejectURLTestWaiters = (reason: Error) => {
  for (const waiter of urlTestWaiters) {
    clearTimeout(waiter.timer)
    waiter.reject(reason)
  }
  urlTestWaiters.clear()
}

const waitForURLTestResult = (timeout: number) => {
  let waiter!: URLTestWaiter
  const promise = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => {
        urlTestWaiters.delete(waiter)
        reject(new Error('sing-box URL test result timeout'))
      },
      Math.max(5000, timeout) + 1000,
    )

    waiter = { resolve, reject, timer }
    urlTestWaiters.add(waiter)
  })

  return {
    promise,
    cancel: () => {
      clearTimeout(waiter.timer)
      urlTestWaiters.delete(waiter)
    },
  }
}

// 由流数据原生组装共享状态(无 clash 的 provider / GLOBAL / 排序等概念)。
const buildPayload = (): ProxiesPayload => {
  const proxies: Record<string, Proxy> = {}

  // 1) 出站叶子节点(含延迟)
  for (const item of outbounds.values()) {
    proxies[item.tag] = nodeToProxy(item)
  }
  // 2) 用组内 items 补建缺失的叶子节点(outbounds 流可能晚到或不含某些成员)
  for (const group of groups.values()) {
    for (const item of group.items) {
      if (!proxies[item.tag]) proxies[item.tag] = nodeToProxy(item)
    }
  }
  // 3) 分组条目(携带 all / now),始终覆盖同名节点
  for (const group of groups.values()) {
    proxies[group.tag] = {
      name: group.tag,
      type: group.type,
      now: group.selected,
      all: group.items.map((i) => i.tag),
      selectable: group.selectable,
      history: [],
      extra: {},
      icon: '',
    }
  }
  // 4) 把组内 items 的延迟回填到叶子节点(绝不动带 all 的组条目)
  for (const group of groups.values()) {
    for (const item of group.items) {
      const node = proxies[item.tag]
      if (node && !node.all?.length && item.urlTestDelay > 0) {
        node.history = getHistoryFromItem(item)
      }
    }
  }
  // 5) 应用用户配置的「名称→图标」映射(与 clash 一致,sing-box 流不含图标)
  for (const iconReflect of iconReflectList.value) {
    const node = proxies[iconReflect.name]
    if (node) node.icon = iconReflect.icon
  }

  return {
    proxies,
    providers: [],
  }
}

const applyPayload = () => {
  const payload = buildPayload()

  proxyMap.value = payload.proxies
  proxyGroupList.value = Array.from(groups.values())
    .filter((g) => g.items.length)
    .map((g) => g.tag)
  proxyProviederList.value = payload.providers

  return payload
}

const closeStreams = () => {
  handles.forEach((h) => h.close())
  handles = []
  rejectURLTestWaiters(new Error('sing-box proxy stream closed'))
  sessionKey = ''
  ready = null
}

const stop = () => {
  closeStreams()
  groups = new Map()
  outbounds = new Map()
}

const ensureSession = () => {
  const backend = activeBackend.value
  const client = getSingboxClient()?.client
  if (!backend || backend.type !== 'singbox' || !client) {
    stop()
    return
  }
  if (sessionKey === backend.uuid && handles.length) return

  stop()
  sessionKey = backend.uuid

  let resolveReady!: () => void
  let resolved = false
  ready = new Promise<void>((r) => (resolveReady = r))

  // 切走后上游只会调用「新后端」驱动的 reset(见 assembly/session),所以订阅可能
  // 带着旧会话继续推送。这里在每次推送时自检:已不是本会话就地停掉,免得旧后端的
  // 代理数据覆盖新后端的列表。
  const alive = () =>
    activeBackend.value?.type === 'singbox' && activeBackend.value.uuid === sessionKey

  handles = [
    subscribeStream<Groups>('groups', (msg) => {
      if (!alive()) {
        stop()
        return
      }
      groups = new Map()
      for (const g of msg.group) groups.set(g.tag, g)
      applyPayload()
      if (!resolved) {
        resolved = true
        resolveReady()
      } else {
        // URLTest RPC 只负责启动任务；历史记录更新后，结果才会通过此订阅推送。
        resolveURLTestWaiters()
      }
    }),
    subscribeStream<OutboundList>('outbounds', (msg) => {
      if (!alive()) {
        stop()
        return
      }
      outbounds = new Map()
      for (const o of msg.outbounds) outbounds.set(o.tag, o)
      applyPayload()
    }),
  ]
}

// 在后端切换 / 登出时丢弃订阅。
export const resetProxies = () => stop()

const runURLTest = async (outboundTag: string, timeout = speedtestTimeout.value) => {
  ensureSession()
  if (ready) await ready

  const client = getSingboxClient()?.client
  if (!client) return

  // 先注册等待，避免测速很快时结果推送早于一元 RPC 响应而丢失。
  const result = waitForURLTestResult(timeout)
  try {
    await Promise.all([client.uRLTest({ outboundTag }), result.promise])
  } finally {
    result.cancel()
  }
}

export const proxiesDriver: ProxiesDriver = {
  fetch: async () => {
    ensureSession()
    if (ready) await ready

    return applyPayload()
  },

  select: async (group, name) => {
    const client = getSingboxClient()?.client
    const proxyGroup = proxyMap.value[group]
    if (!client || proxyGroup?.selectable === false) return

    await client.selectOutbound({ groupTag: group, outboundTag: name })

    // 乐观更新,流随后会确认
    const target = groups.get(group)
    if (target) {
      target.selected = name
      applyPayload()
    }
  },

  clearFixed: async () => {},

  // sing-box API 支持直接测试单个 outbound;节点卡片传节点自身的 tag。
  testNode: async (name, _url, timeout) => {
    await runURLTest(name, timeout)

    return proxyMap.value[name]?.history?.at(-1)?.delay ?? 0
  },
  testProviderNode: async (_provider, name, _url, timeout) => {
    await runURLTest(name, timeout)

    return proxyMap.value[name]?.history?.at(-1)?.delay ?? 0
  },
  testGroup: async (group, _url, timeout) => {
    await runURLTest(group, timeout)

    const result: Record<string, number> = {}
    for (const item of groups.get(group)?.items ?? []) {
      result[item.tag] = item.urlTestDelay
    }

    return result
  },

  updateProvider: async () => {},
  healthCheckProvider: async () => {},
  fetchSmartWeights: async () => ({}),
  flushSmartWeights: async () => {},
}
