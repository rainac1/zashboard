import { can } from '@/assembly/backend'
import {
  fetchConfigs,
  flushDNSCache,
  flushFakeIP,
  reloadConfigs,
  updateGeoData,
} from '@/assembly/config'
import { fetchProxies, flushSmartGroupWeights, hasSmartGroup } from '@/assembly/proxies'
import { fetchRules } from '@/assembly/rules'
import { restartCore } from '@/assembly/version'
import { BACKEND_ITEM_KEYS } from '@/config/settings-items'
import { showConfirmDialog } from '@/helper/confirm-dialog'
import { notifyActionPending, showNotification } from '@/helper/notification'
import { notifyRequestError } from '@/helper/request-error'
import { isSettingHidden } from '@/helper/settings'
import { i18n } from '@/i18n'
import { activeBackend } from '@/store/setup'
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowPathRoundedSquareIcon,
  ArrowUpCircleIcon,
  DocumentTextIcon,
  PencilSquareIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline'
import { computed, ref, type Component, type Ref } from 'vue'

const k = BACKEND_ITEM_KEYS

export type BackendAction = {
  key: string
  label: string
  icon: Component
  running: boolean
  opensModal: boolean
  run: () => void
}

export const showUpgradeCoreModal = ref(false)
export const showUpdateConfigModal = ref(false)
export const showDaeConfigModal = ref(false)

const reloadAll = () => {
  fetchConfigs()
  fetchRules()
  fetchProxies()
}

const isCoreRestarting = ref(false)
const isConfigReloading = ref(false)
const isGeoUpdating = ref(false)
const isDNSCacheFlushing = ref(false)
const isFakeIPFlushing = ref(false)
const isSmartWeightsFlushing = ref(false)

const runOnce = async (
  label: string,
  running: Ref<boolean>,
  request: () => Promise<unknown>,
  successMessage: string,
  afterSuccess?: () => void,
  confirm?: { title: string; message: string },
) => {
  if (running.value) return
  if (confirm) {
    const { confirmed } = await showConfirmDialog({
      title: i18n.global.t(confirm.title),
      message: i18n.global.t(confirm.message),
    })
    if (!confirmed) return
  }
  running.value = true
  const notifyKey = notifyActionPending(label)
  try {
    await request()
    afterSuccess?.()
    showNotification({
      key: notifyKey,
      content: successMessage,
      type: 'alert-success',
    })
  } catch (e) {
    notifyRequestError(e, notifyKey)
  } finally {
    running.value = false
  }
}

export const backendActions = computed<BackendAction[]>(() => {
  if (!activeBackend.value) return []

  const actions: BackendAction[] = []

  if (can('coreUpgrade') && !activeBackend.value?.disableUpgradeCore) {
    actions.push({
      key: k.upgradeCore,
      label: 'upgradeCore',
      icon: ArrowUpCircleIcon,
      running: false,
      opensModal: true,
      run: () => (showUpgradeCoreModal.value = true),
    })
  }

  if (can('coreRestart')) {
    actions.push({
      key: k.restartCore,
      label: 'restartCore',
      icon: ArrowPathRoundedSquareIcon,
      running: isCoreRestarting.value,
      opensModal: false,
      run: () =>
        runOnce(
          'restartCore',
          isCoreRestarting,
          restartCore,
          'restartCoreSuccess',
          () => setTimeout(reloadAll, 500),
          { title: 'restartCore', message: 'restartCoreConfirm' },
        ),
    })
  }

  if (can('reloadConfigs')) {
    actions.push({
      key: k.reloadConfigs,
      label: 'reloadConfigs',
      icon: ArrowPathIcon,
      running: isConfigReloading.value,
      opensModal: false,
      run: () =>
        runOnce(
          'reloadConfigs',
          isConfigReloading,
          reloadConfigs,
          'reloadConfigsSuccess',
          reloadAll,
        ),
    })
  }

  if (can('updateConfigs')) {
    actions.push({
      key: k.updateConfigs,
      label: 'updateConfigs',
      icon: PencilSquareIcon,
      running: false,
      opensModal: true,
      run: () => (showUpdateConfigModal.value = true),
    })
  }

  if (can('updateGeoDatabase')) {
    actions.push({
      key: k.updateGeoDatabase,
      label: 'updateGeoDatabase',
      icon: ArrowDownTrayIcon,
      running: isGeoUpdating.value,
      opensModal: false,
      run: () =>
        runOnce('updateGeoDatabase', isGeoUpdating, updateGeoData, 'updateGeoSuccess', reloadAll),
    })
  }

  if (can('flushDNSCache')) {
    actions.push({
      key: k.flushDNSCache,
      label: 'flushDNSCache',
      icon: TrashIcon,
      running: isDNSCacheFlushing.value,
      opensModal: false,
      run: () =>
        runOnce('flushDNSCache', isDNSCacheFlushing, flushDNSCache, 'flushDNSCacheSuccess'),
    })
  }

  if (can('flushFakeIP')) {
    actions.push({
      key: k.flushFakeIP,
      label: 'flushFakeIP',
      icon: TrashIcon,
      running: isFakeIPFlushing.value,
      opensModal: false,
      run: () => runOnce('flushFakeIP', isFakeIPFlushing, flushFakeIP, 'flushFakeIPSuccess'),
    })
  }

  if (can('configSources')) {
    actions.push({
      key: k.daeConfigSources,
      label: 'daeConfigSources',
      icon: DocumentTextIcon,
      running: false,
      opensModal: true,
      run: () => (showDaeConfigModal.value = true),
    })
  }

  if (hasSmartGroup.value) {
    actions.push({
      key: k.flushSmartWeights,
      label: 'flushSmartWeights',
      icon: TrashIcon,
      running: isSmartWeightsFlushing.value,
      opensModal: false,
      run: () =>
        runOnce(
          'flushSmartWeights',
          isSmartWeightsFlushing,
          flushSmartGroupWeights,
          'flushSmartWeightsSuccess',
        ),
    })
  }

  return actions
})

export const menuBackendActions = computed(() =>
  backendActions.value.filter((action) => !isSettingHidden(action.key)),
)
