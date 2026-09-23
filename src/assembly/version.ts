// 组装层 · 版本与升级。
// system.fetchVersion 按驱动取回版本字符串:Clash /version、sing-box gRPC getVersion
// 或 dae 的版本端点。版本字符串是 core 轴(assembly/backend.ts)的唯一来源:
// 这里探测完成后写入 core,后端切换的瞬间先重置为 'unknown',避免沿用上一个后端的结论。
import DaeLogo from '@/assets/images/dae.jpg'
import HonkLogo from '@/assets/images/honk.svg'
import MetacubexLogo from '@/assets/images/metacubex.jpg'
import SingBoxLogo from '@/assets/images/sing-box.svg'
import { MIHOMO, MIHOMO_CHANNEL } from '@/constant'
import { fetchWithLocalCache } from '@/helper/cache'
import { getRequestErrorMessage } from '@/helper/request-error'
import { autoUpgradeCore, autoUpgradeDashboard, checkUpgradeCore } from '@/store/settings'
import { activeBackend } from '@/store/setup'
import type { Backend } from '@/types'
import { computed, nextTick, ref } from 'vue'
import { can, core, Core, resetCore } from './backend'
import { fetchCapabilities, resetCapabilities } from './capabilities'
import { driver } from './driver'

export const version = ref()
export const isCoreUpdateAvailable = ref(false)
export const isUIUpdateAvailable = ref(false)
export const zashboardVersion = ref(__APP_VERSION__)

// 切后端时本来就要打一次版本端点,顺手把它的结果暴露成连通性状态,
// 给切换提示用 —— 不额外发探测请求,量的也正是实际在用的那条 API。
export type BackendProbe = {
  uuid: string
  status: 'probing' | 'connected' | 'failed'
  // 拿到版本响应的耗时(ms),failed 时无意义。
  latency: number
  message: string
}

export const backendProbe = ref<BackendProbe | undefined>()

// sing-box 内核启动时刻(ms epoch);0 表示未知 / 当前后端无此能力。
// 仅 sing-box API(GetStartedAt)提供,Clash /version 无运行时长。
export const startedAt = ref(0)

// honk 的 /version 返回 "honk <semver>"(见 honk-core/src/clash_api.rs 的 version handler)。
const detectCore = (versionString: string): Core => {
  if (versionString.includes('sing-box')) return Core.Singbox
  if (/\bhonk\b/i.test(versionString)) return Core.Honk
  if (activeBackend.value?.type === 'dae') return Core.Dae
  if (!versionString) return Core.Unknown
  return Core.Mihomo
}

// 内核品牌的展示信息(logo / 官网链接)。纯展示,不是能力门控,故允许 view 使用。
export const coreBrand = computed(() => {
  switch (core.value) {
    case Core.Singbox:
      return { logo: SingBoxLogo, url: 'https://github.com/sagernet/sing-box' }
    case Core.Honk:
      return { logo: HonkLogo, url: 'https://github.com/Glassyiris/honk' }
    case Core.Dae:
      return { logo: DaeLogo, url: 'https://github.com/daeuniverse/dae' }
    default:
      return {
        logo: MetacubexLogo,
        url: MIHOMO_CHANNEL[mihomo.value?.[0] ?? MIHOMO.Meta].url,
      }
  }
})

export const mihomo = computed<[MIHOMO, string] | undefined>(() => {
  if (core.value !== Core.Mihomo) return undefined

  const match = /(alpha-smart|alpha|beta|meta)-?(\w+)/.exec(version.value)
  switch (match?.[1]) {
    case 'alpha':
      return [MIHOMO.Alpha, match[2] ?? version.value]
    case 'alpha-smart':
      return [MIHOMO.Smart, match[2] ?? version.value]
    case 'meta':
      return [MIHOMO.Meta, match[2] ?? version.value]
    default:
      return [MIHOMO.Meta, version.value]
  }
})

export const restartCore = () => driver().system.restartCore()

export const upgradeCore = (channel: 'release' | 'alpha' | 'auto') =>
  driver().system.upgradeCore(channel)

export const upgradeUI = () => driver().system.upgradeUI()

const probeBackendVersion = async (backend: Backend) => {
  const startAt = Date.now()
  let versionString: string

  try {
    versionString = await driver().system.fetchVersion()
  } catch (e) {
    if (activeBackend.value?.uuid === backend.uuid) {
      backendProbe.value = {
        uuid: backend.uuid,
        status: 'failed',
        latency: 0,
        message: getRequestErrorMessage(e),
      }
    }
    throw e
  }

  if (activeBackend.value?.uuid !== backend.uuid) return

  version.value = versionString
  core.value = detectCore(version.value)

  if (backend.type === 'dae') {
    await fetchCapabilities()
  }

  backendProbe.value = {
    uuid: backend.uuid,
    status: 'connected',
    latency: Date.now() - startAt,
    message: '',
  }
  startedAt.value =
    (await driver()
      .system.startedAt?.()
      .catch(() => 0)) ?? 0

  if (!can('coreUpdateCheck') || !checkUpgradeCore.value || backend.disableUpgradeCore) return

  isCoreUpdateAvailable.value = await fetchIsCoreUpdateAvailable()

  if (isCoreUpdateAvailable.value && autoUpgradeCore.value) {
    // 自动升级不是用户点的,失败静默
    upgradeCore('auto').catch(() => {})
  }
}

// 探测期间 activeBackend 可能已经切走,运行时动作指向被探测的那个后端。
let probe: Promise<void> = Promise.resolve()

// core 未就绪前依赖它的判断都不可信,需要等结论的调用方(如登录后的设置同步)用 coreReady() 等待。
export const coreReady = async () => {
  // 先让会话的 watcher 跑完,确保拿到的是新后端的探测,而非上一次的残留。
  await nextTick()
  await probe
}

// 由 assembly/session 在每次会话开始时调用:先把上一个后端的结论清干净,
// 再对当前后端重新探测。返回的 promise 只给 coreReady 用,调用方不必等。
export const probeActiveBackend = () => {
  const backend = activeBackend.value

  resetCore()
  resetCapabilities()
  version.value = ''
  startedAt.value = 0
  isCoreUpdateAvailable.value = false
  backendProbe.value = backend
    ? { uuid: backend.uuid, status: 'probing', latency: 0, message: '' }
    : undefined

  probe = backend ? probeBackendVersion(backend).catch(() => {}) : Promise.resolve()
  return probe
}

const fetchIsCoreUpdateAvailable = async () => {
  const versionNumber = mihomo.value?.[1] ?? version.value
  const { assets } = await fetchWithLocalCache<{ assets: { name: string }[] }>(
    MIHOMO_CHANNEL[mihomo.value?.[0] ?? MIHOMO.Meta].check_update_url,
    versionNumber,
  )

  return !assets.some(({ name }) => name.includes(versionNumber))
}

export const checkUIUpdate = async () => {
  const { tag_name } = await fetchWithLocalCache<{ tag_name: string }>(
    'https://api.github.com/repos/Zephyruso/zashboard/releases/latest',
    zashboardVersion.value,
  )

  isUIUpdateAvailable.value = Boolean(tag_name && tag_name !== `v${zashboardVersion.value}`)

  if (isUIUpdateAvailable.value && autoUpgradeDashboard.value) {
    upgradeUI().catch(() => {})
  }
}
