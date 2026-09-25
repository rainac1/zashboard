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

// 一次 URLTest 的「结果指纹」:sing-box 把测速历史(时间戳 + 延迟)随
// SubscribeGroups / SubscribeOutbounds 推送。测速前记下指纹，只有指纹变了才说明
// 本次结果真的到了 —— 否则任意一次无关推送都会把等待提前唤醒。
type URLTestStamp = {
  time: bigint
  delay: number
}

const stampKey = (stamp?: URLTestStamp) => (stamp ? `${stamp.time}:${stamp.delay}` : '')

// 组测速由内核并发测试所有成员，结果会分几批推送。等所有成员都变化可能被
// 「首测即失败、历史一直为空」的成员拖到超时，因此成员分批到达时用一小段静置
// 时间收尾：期间再有新结果就重新计时。
const URL_TEST_SETTLE_DELAY = 500

type URLTestWaiter = {
  // 本次测速要等到的目标(单节点是自身 tag，组是全部成员 tag)。
  targets: string[]
  // 登记等待时各目标的结果指纹。
  baseline: Map<string, string>
  // 仅部分目标变化时，静置多久后收尾；单节点 / 全部变化为 0(立即结算)。
  settleDelay: number
  settleTimer: ReturnType<typeof setTimeout> | null
  resolve: () => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const urlTestWaiters = new Set<URLTestWaiter>()

// 把两个流的数据合成 tag → 结果指纹。同一 tag 可能同时出现在出站流和组快照里，
// 两路到达有先后：组内成员一律以组快照为准，只有组里没有的 tag 才看出站流 ——
// 免得较旧的一份把「历史已被删除(延迟 0)」又盖回旧的延迟，或让两路互相误判。
const collectStamps = () => {
  const stamps = new Map<string, URLTestStamp>()

  for (const item of outbounds.values()) {
    stamps.set(item.tag, { time: item.urlTestTime, delay: item.urlTestDelay })
  }
  for (const group of groups.values()) {
    for (const item of group.items) {
      stamps.set(item.tag, { time: item.urlTestTime, delay: item.urlTestDelay })
    }
  }

  return stamps
}

const removeURLTestWaiter = (waiter: URLTestWaiter) => {
  urlTestWaiters.delete(waiter)
  clearTimeout(waiter.timer)
  if (waiter.settleTimer) clearTimeout(waiter.settleTimer)
}

const resolveURLTestWaiter = (waiter: URLTestWaiter) => {
  if (!urlTestWaiters.delete(waiter)) return

  clearTimeout(waiter.timer)
  if (waiter.settleTimer) clearTimeout(waiter.settleTimer)
  waiter.resolve()
}

// 流推送后结算等待：只有目标自身的结果变化才算数；部分目标变化时再静置片刻。
const settleURLTestWaiters = () => {
  if (!urlTestWaiters.size) return

  const stamps = collectStamps()

  for (const waiter of [...urlTestWaiters]) {
    const changed = waiter.targets.filter(
      (tag) => stampKey(stamps.get(tag)) !== waiter.baseline.get(tag),
    )

    if (!changed.length) continue
    if (changed.length === waiter.targets.length || waiter.settleDelay <= 0) {
      resolveURLTestWaiter(waiter)
      continue
    }

    if (waiter.settleTimer) clearTimeout(waiter.settleTimer)
    waiter.settleTimer = setTimeout(() => resolveURLTestWaiter(waiter), waiter.settleDelay)
  }
}

const rejectURLTestWaiters = (reason: Error) => {
  for (const waiter of urlTestWaiters) {
    clearTimeout(waiter.timer)
    if (waiter.settleTimer) clearTimeout(waiter.settleTimer)
    waiter.reject(reason)
  }
  urlTestWaiters.clear()
}

const waitForURLTestResult = (
  timeout: number,
  targets: string[],
  baseline: Map<string, string>,
  settleDelay = 0,
) => {
  let waiter!: URLTestWaiter
  const promise = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => {
        if (!urlTestWaiters.has(waiter)) return
        removeURLTestWaiter(waiter)
        reject(new Error('sing-box URL test result timeout'))
      },
      Math.max(5000, timeout) + 1000,
    )

    waiter = { targets, baseline, settleDelay, settleTimer: null, resolve, reject, timer }
    urlTestWaiters.add(waiter)
  })

  return {
    promise,
    cancel: () => removeURLTestWaiter(waiter),
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
      }
      // URLTest RPC 只负责启动任务；历史记录更新后，结果才会通过订阅推送。
      // 这里按各次测速的目标指纹结算，别让无关推送把等待提前唤醒。
      settleURLTestWaiters()
    }),
    subscribeStream<OutboundList>('outbounds', (msg) => {
      if (!alive()) {
        stop()
        return
      }
      outbounds = new Map()
      for (const o of msg.outbounds) outbounds.set(o.tag, o)
      applyPayload()
      settleURLTestWaiters()
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

  // 组测速要等组内成员逐个回填，单测只等自身 tag。先记下测速前的结果指纹，
  // 之后只有指纹变化才说明本次结果到了 —— 避免别处推送触发误判。
  const members = groups.get(outboundTag)?.items.map((item) => item.tag)
  const targets = members?.length ? members : [outboundTag]
  const stamps = collectStamps()
  const baseline = new Map(targets.map((tag) => [tag, stampKey(stamps.get(tag))]))

  // 先注册等待，避免测速很快时结果推送早于一元 RPC 响应而丢失。
  const result = waitForURLTestResult(
    timeout,
    targets,
    baseline,
    members?.length ? URL_TEST_SETTLE_DELAY : 0,
  )
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
