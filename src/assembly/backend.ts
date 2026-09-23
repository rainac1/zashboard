// 组装层 · 后端判别与能力表。
//
// 判别轴:
//   core —— 运行时内核品牌。靠 /version 字符串嗅探得来,是启发式猜测,
//           可能误判(分支核 / 兼容核),且拉取完成前为 'unknown'。
//   apiVersion —— sing-box gRPC API 版本,仅在 type === 'singbox' 时由版本探测写入。
//
// 实际在用的 API 形态:
//   A. clash 通道 + core=mihomo   mihomo 的 Clash API
//   B. clash 通道 + core=singbox  sing-box 的 Clash 兼容 API(端点子集 + 少量专属端点)
//   C. clash 通道 + core=honk     honk 的 Clash 兼容 API(又一个端点子集)
//   D. singbox 通道 + core=singbox sing-box API(gRPC)
//   E. dae 通道                    dae 的原生 API(能力由 /capabilities 资源表给出)
//
// 能力表一律通过 can() 读取:
//   soft —— 由 core / 后端类型 / apiVersion 决定。因探测是启发式,Clash 通道上的
//           非 mihomo 内核允许用户用 displayAllFeatures 强制掰开(提示文案承诺:
//           fork 版内核可能支持官方版没有的功能)。
//
// 注意:能凭响应数据自证的差异(如 rules 开关端点由 rule.uuid 决定、smart 由
// proxy.type 决定)不进此表,就近放在对应的 assembly 子模块里 —— 数据比版本
// 字符串可靠,不该被降级成全局猜测。

import { displayAllFeatures } from '@/store/settings'
import { activeBackend } from '@/store/setup'
import { computed, ref } from 'vue'
import { daeCapabilities } from './capabilities'

// usbip 需要 sing-box gRPC API v2(ProvideUSBDevices 流)
const USBIP_MIN_API_VERSION = 2
// OpenVPN 需要 sing-box gRPC API v3(SubscribeOpenVPNStatus 流)
const OPENVPN_MIN_API_VERSION = 3
// Taildrop 需要 sing-box gRPC API v4(SubscribeTaildropInbox / SendTaildropFiles 等)
const TAILDROP_MIN_API_VERSION = 4

export enum Core {
  Mihomo = 'mihomo',
  Honk = 'honk',
  Singbox = 'singbox',
  Dae = 'dae',
  Unknown = 'unknown',
}

export const core = ref<Core>(Core.Unknown)

// sing-box gRPC API 版本,由 assembly/version.ts 在探测 /version 后写入,
// 后端切换时先重置,避免沿用上一个后端的结论。
export const apiVersion = ref(0)

export const resetCore = () => {
  core.value = Core.Unknown
  apiVersion.value = 0
}

// displayAllFeatures 的适用范围:Clash 通道上跑着非 mihomo 内核(sing-box / honk)时。
// 该开关的语义是「我用的 fork 版内核也支持这些 mihomo 扩展端点,先显示出来」——
// 只有在 Clash 通道上,那些端点才有可能存在。sing-box API(gRPC)通道上它们压根不是
// 同一套协议,掰开只会打出必然失败的请求,所以那里既不显示开关,存量的 true 也不生效。
// core 未探测出结论(Unknown)时不掰,免得凭空点亮一堆按钮。
const isNonMihomoCore = computed(
  () =>
    activeBackend.value?.type !== 'dae' &&
    activeBackend.value?.type !== 'singbox' &&
    (core.value === Core.Singbox || core.value === Core.Honk),
)

const isForkCoreOverride = computed(() => isNonMihomoCore.value && displayAllFeatures.value)

// 开关自身的可见性与其生效范围保持一致。
export const showDisplayAllFeatures = computed(() => !!activeBackend.value && isNonMihomoCore.value)

export type Cap =
  | 'coreUpgrade'
  | 'coreRestart'
  | 'dashboardUpgrade'
  | 'reloadConfigs'
  | 'updateConfigs'
  | 'updateGeoDatabase'
  | 'syncSettings'
  | 'independentLatency'
  | 'coreUpdateCheck'
  | 'configPatch'
  | 'traceLogLevel'
  | 'silentLogLevel'
  | 'runtimeStats'
  | 'latencyTest'
  | 'proxyProviderUpdate'
  | 'proxyProviderHealthCheck'
  | 'ruleProviders'
  | 'flushDNSCache'
  | 'flushFakeIP'
  | 'dnsQuery'
  | 'connectionsClose'
  | 'connectionsFilterClose'
  | 'customTestUrl'
  | 'nodeLatencyTest'
  | 'metricsHistory'
  | 'backendEvents'
  | 'flows'
  | 'dnsCache'
  | 'dnsLog'
  | 'routingTrace'
  | 'datapath'
  | 'runtimeSettings'
  | 'configSources'
  | 'configEdit'
  | 'entryManage'
  | 'groupConfigPatch'
  | 'lifecycleControl'
  // ---------- sing-box 专属 ----------
  // sing-box 内核(无论走 gRPC 还是 Clash 兼容通道)的能力
  | 'singboxDeprecationNotice'
  | 'customGlobalNode'
  | 'logTypeFilter'
  | 'logConnectionDetail'
  | 'disconnectOnModeChange'
  | 'extraLogLevels'
  // 仅 sing-box API(gRPC)通道
  | 'tools'
  | 'goroutines'
  | 'startedAt'
  | 'usbip'
  | 'openvpn'
  | 'taildrop'
  // 路由可见性(规则页在 sing-box 上没有意义)
  | 'rules'

type Caps = Partial<Record<Cap, boolean>>

const clashCaps = computed<Caps>(() => {
  const mihomo = core.value === Core.Mihomo
  const honk = core.value === Core.Honk
  const singboxCore = core.value === Core.Singbox
  const mihomoOrForkCore = mihomo || isForkCoreOverride.value

  return {
    coreUpgrade: mihomoOrForkCore,
    coreRestart: mihomoOrForkCore,
    dashboardUpgrade: mihomoOrForkCore,
    reloadConfigs: mihomoOrForkCore,
    updateConfigs: mihomoOrForkCore,
    updateGeoDatabase: mihomoOrForkCore,
    syncSettings: mihomoOrForkCore,
    independentLatency: mihomoOrForkCore,
    coreUpdateCheck: mihomo,
    configPatch: mihomo,

    // sing-box 与 honk 有 trace,mihomo 没有
    traceLogLevel: honk || singboxCore,
    // fatal / panic 仅 sing-box
    extraLogLevels: singboxCore,
    // silent:mihomo 与 sing-box 有,honk 没有
    silentLogLevel: mihomo || singboxCore,

    runtimeStats: honk,

    latencyTest: true,
    proxyProviderUpdate: true,
    proxyProviderHealthCheck: true,
    ruleProviders: true,
    flushDNSCache: true,
    flushFakeIP: true,
    dnsQuery: true,
    connectionsClose: true,
    customTestUrl: true,
    nodeLatencyTest: true,

    // ---------- sing-box 内核侧(Clash 兼容通道) ----------
    singboxDeprecationNotice: singboxCore,
    customGlobalNode: singboxCore,
    // sing-box 日志 payload 带 "[type]:" 前缀,可据此做类型分面过滤
    logTypeFilter: singboxCore,
    // sing-box 日志以 "[连接id 耗时]" 开头,可据此从日志跳到对应连接
    logConnectionDetail: singboxCore,
    // sing-box 切换模式后需要主动断开命中 clash_mode 规则的连接
    disconnectOnModeChange: singboxCore,

    rules: true,
  }
})

const daeCaps = computed<Caps>(() => {
  const resources = daeCapabilities.value?.resources

  return {
    reloadConfigs: resources?.reload.available === true,
    updateGeoDatabase: resources?.geodata.can_update === true,

    traceLogLevel: resources?.logs.levels?.includes('trace') === true,

    runtimeStats: resources?.runtime_outbounds.available === true,

    latencyTest: resources?.probes.available === true,
    proxyProviderUpdate: resources?.providers.can_refresh === true,
    flushDNSCache: resources?.dns_cache.flush === true,
    dnsQuery: resources?.dns_query.available === true,
    connectionsClose: resources?.connections.can_close === true,
    connectionsFilterClose: resources?.connections.can_close === true,
    metricsHistory:
      resources?.traffic_history.available === true || resources?.memory_history.available === true,
    backendEvents: resources?.events.available === true,
    flows: resources?.flows.available === true,
    dnsCache: resources?.dns_cache.read === true,
    dnsLog: resources?.dns_log.available === true,
    routingTrace: resources?.routing_trace.available === true,
    datapath: resources?.datapath.available === true,
    runtimeSettings: resources?.runtime_settings.available === true,
    configSources: resources?.config.available === true,
    configEdit: resources?.config.writable === true && resources?.config.content === true,
    entryManage: resources?.nodes.can_manage === true || resources?.providers.can_manage === true,
    groupConfigPatch: resources?.groups.config_patch === true,
    lifecycleControl: resources?.suspend.available === true && resources?.resume.available === true,

    rules: true,
  }
})

const singboxCaps = computed<Caps>(() => {
  return {
    // 弃用公告要覆盖两种 sing-box 用法:原生 gRPC 通道同步可知；Clash 兼容
    // 通道由 clashCaps 依 core 判断。
    singboxDeprecationNotice: true,

    tools: true,
    goroutines: true,
    startedAt: true,
    usbip: apiVersion.value >= USBIP_MIN_API_VERSION,
    openvpn: apiVersion.value >= OPENVPN_MIN_API_VERSION,
    taildrop: apiVersion.value >= TAILDROP_MIN_API_VERSION,

    customGlobalNode: true,
    logTypeFilter: true,
    logConnectionDetail: true,
    disconnectOnModeChange: true,
    extraLogLevels: true,
    traceLogLevel: true,
    silentLogLevel: true,

    latencyTest: true,
    nodeLatencyTest: true,
    customTestUrl: true,
    connectionsClose: true,

    rules: false,
  }
})

const soft = computed<Caps>(() => {
  switch (activeBackend.value?.type) {
    case 'singbox':
      return singboxCaps.value
    case 'dae':
      return daeCaps.value
    default:
      return clashCaps.value
  }
})

export const can = (cap: Cap): boolean => {
  if (!activeBackend.value) return false

  return soft.value[cap] === true
}
