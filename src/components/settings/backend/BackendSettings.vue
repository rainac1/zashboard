<template>
  <div
    v-if="hasVisibleItems"
    class="text-sm"
  >
    <template v-if="isVisibleBackendSwitch">
      <div class="settings-section-label">{{ $t('settingsSectionCurrentBackend') }}</div>
      <div class="settings-grid">
        <SettingItem
          :setting-key="k.backend"
          class="py-3"
        >
          <div class="flex w-full flex-col gap-3">
            <div class="flex items-center gap-2 px-1">
              <div class="indicator">
                <span
                  v-if="isCoreUpdateAvailable"
                  class="indicator-item top-1 -right-1 flex"
                >
                  <span class="bg-secondary absolute h-2 w-2 animate-ping rounded-full"></span>
                  <span class="bg-secondary h-2 w-2 rounded-full"></span>
                </span>
                <a
                  class="flex cursor-pointer items-center gap-2 font-semibold"
                  :href="coreBrand.url"
                  target="_blank"
                >
                  {{ $t('backend') }}
                  <BackendVersion class="text-sm font-normal" />
                </a>
              </div>
            </div>
            <BackendSwitch :show-actions="false" />
          </div>
        </SettingItem>
      </div>
    </template>

    <template v-if="hasVisibleActions">
      <div class="settings-section-label">{{ $t('settingsSectionCoreOperations') }}</div>
      <div class="settings-grid">
        <SettingItem
          v-for="action in backendActions"
          :key="action.key"
          :setting-key="action.key"
        >
          <div class="setting-item-label">{{ $t(action.label) }}</div>
          <button
            :class="['btn btn-sm min-w-11', action.key === k.upgradeCore && 'btn-neutral']"
            :disabled="action.running"
            :aria-label="$t(action.label)"
            @click="action.run()"
          >
            <span
              v-if="action.running"
              class="loading loading-spinner h-4 w-4"
            ></span>
            <component
              :is="action.icon"
              v-else
              class="h-4 w-4"
            />
          </button>
        </SettingItem>
      </div>
    </template>

    <template v-if="hasVisibleNetworkSettings">
      <div class="settings-section-label">{{ $t('settingsSectionNetworkListening') }}</div>
      <div class="settings-grid">
        <SettingItem
          :setting-key="k.ports"
          class="py-3"
        >
          <div class="flex w-full flex-col gap-3">
            <div class="setting-item-label">{{ $t('ports') }}</div>
            <BackendPortsGrid />
          </div>
        </SettingItem>
        <SettingItem
          :setting-key="k.tunMode"
          :when="!!configs?.tun && !activeBackend?.disableTunMode"
        >
          <div class="setting-item-label">{{ $t('tunMode') }}</div>
          <input
            v-model="configs!.tun.enable"
            class="toggle"
            type="checkbox"
            @change="hanlderTunModeChange"
          />
        </SettingItem>
        <SettingItem
          :setting-key="k.tunStack"
          :when="canShowTunStack"
          class="settings-dependent-item"
        >
          <div class="setting-item-label">{{ $t('tunStack') }}</div>
          <SelectInput
            v-model="tunStack"
            class="select select-sm min-w-24"
            :options="tunStackOptions"
          />
        </SettingItem>
        <SettingItem
          :setting-key="k.allowLan"
          :when="!!configs"
        >
          <div class="setting-item-label">{{ $t('allowLan') }}</div>
          <input
            v-model="configs!['allow-lan']"
            class="toggle"
            type="checkbox"
            @change="handlerAllowLanChange"
          />
        </SettingItem>
      </div>
    </template>

    <template v-if="hasVisibleUpgradeSettings">
      <div class="settings-section-label">{{ $t('settingsSectionCoreUpdates') }}</div>
      <div class="settings-grid">
        <SettingItem :setting-key="k.checkCoreUpgrade">
          <div class="setting-item-label">{{ $t('checkCoreUpgrade') }}</div>
          <input
            v-model="checkUpgradeCore"
            class="toggle"
            type="checkbox"
            @change="handlerCheckUpgradeCoreChange"
          />
        </SettingItem>
        <SettingItem
          :setting-key="k.autoUpgradeCore"
          :when="checkUpgradeCore"
          class="settings-dependent-item"
        >
          <div class="setting-item-label">{{ $t('autoUpgradeCore') }}</div>
          <input
            v-model="autoUpgradeCore"
            class="toggle"
            type="checkbox"
          />
        </SettingItem>
      </div>
    </template>

    <template v-if="showDnsQuery">
      <div class="settings-section-label">{{ $t('settingsSectionDiagnostics') }}</div>
      <div class="settings-grid">
        <SettingItem
          :setting-key="k.DNSQuery"
          class="py-3"
        >
          <DnsQuery />
        </SettingItem>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { can } from '@/assembly/backend'
import { configs, updateConfigs } from '@/assembly/config'
import { coreBrand, isCoreUpdateAvailable } from '@/assembly/version'
import BackendVersion from '@/components/common/BackendVersion.vue'
import SelectInput, { type SelectOption } from '@/components/common/SelectInput.vue'
import BackendPortsGrid from '@/components/settings/backend/BackendPortsGrid.vue'
import BackendSwitch from '@/components/settings/backend/BackendSwitch.vue'
import DnsQuery from '@/components/settings/backend/DnsQuery.vue'
import SettingItem from '@/components/settings/SettingItem.vue'
import { backendActions } from '@/composables/backendActions'
import { isSettingVisible, useIsSettingVisible } from '@/composables/settings'
import { BACKEND_ITEM_KEYS } from '@/config/settingsItems'
import { TUN_STACK } from '@/constant'
import { notifyRequestError } from '@/helper/requestError'
import { autoUpgradeCore, checkUpgradeCore } from '@/store/settings'
import { activeBackend } from '@/store/setup'
import { computed } from 'vue'

const k = BACKEND_ITEM_KEYS

const isVisibleBackendSwitch = useIsSettingVisible(k.backend)
const isVisiblePorts = useIsSettingVisible(k.ports)
const isVisibleTunMode = useIsSettingVisible(k.tunMode)
const isVisibleTunStack = useIsSettingVisible(k.tunStack)
const isVisibleAllowLan = useIsSettingVisible(k.allowLan)
const isVisibleCheckUpgrade = useIsSettingVisible(k.checkCoreUpgrade)
const isVisibleAutoUpgrade = useIsSettingVisible(k.autoUpgradeCore)
const isVisibleDnsQuery = useIsSettingVisible(k.DNSQuery)
const canShowTunMode = computed(
  () => isVisibleTunMode.value && !activeBackend.value?.disableTunMode,
)
// 只有核心在 /configs 里回报了 stack 才展示，避免对不支持该字段的核心下发无效 PATCH。
const canShowTunStack = computed(
  () =>
    !!configs.value?.tun?.stack && isVisibleTunStack.value && !activeBackend.value?.disableTunMode,
)

const hasVisibleActions = computed(() =>
  backendActions.value.some((action) => isSettingVisible(action.key)),
)
const showDnsQuery = computed(() => isVisibleDnsQuery.value && can('dnsQuery'))
const hasVisibleNetworkSettings = computed(
  () =>
    can('configPatch') &&
    !!configs.value &&
    (isVisiblePorts.value ||
      (!!configs.value.tun && canShowTunMode.value) ||
      canShowTunStack.value ||
      isVisibleAllowLan.value),
)
const hasVisibleUpgradeSettings = computed(
  () =>
    can('configPatch') &&
    !!configs.value &&
    !activeBackend.value?.disableUpgradeCore &&
    (isVisibleCheckUpgrade.value || (checkUpgradeCore.value && isVisibleAutoUpgrade.value)),
)
const hasVisibleItems = computed(
  () =>
    isVisibleBackendSwitch.value ||
    hasVisibleActions.value ||
    hasVisibleNetworkSettings.value ||
    hasVisibleUpgradeSettings.value ||
    showDnsQuery.value,
)

const handlerCheckUpgradeCoreChange = () => {
  if (!checkUpgradeCore.value) {
    autoUpgradeCore.value = false
    isCoreUpdateAvailable.value = false
  }
}
const hanlderTunModeChange = async () => {
  try {
    await updateConfigs({ tun: { enable: configs.value?.tun.enable } })
  } catch (error) {
    notifyRequestError(error)
  }
}
const tunStackOptions = computed<SelectOption<string>[]>(() => {
  const options: SelectOption<string>[] = Object.values(TUN_STACK).map((value) => ({
    value,
    label: value,
  }))
  const current = configs.value?.tun?.stack

  // 核心可能返回列表外的写法（大小写不同或新增的 stack），保留原值避免显示为空。
  if (current && !options.some((option) => option.value === current)) {
    options.unshift({ value: current, label: current })
  }

  return options
})
const tunStack = computed<string>({
  get: () => configs.value?.tun?.stack ?? '',
  set: (stack) => {
    if (!configs.value?.tun) return
    configs.value.tun.stack = stack
    handlerTunStackChange(stack)
  },
})
// mihomo 的 PATCH /configs 里 tun.enable 不是指针，缺省会被当成 false，所以必须一起回传。
const handlerTunStackChange = async (stack: string) => {
  try {
    await updateConfigs({ tun: { enable: configs.value?.tun.enable, stack } })
  } catch (error) {
    notifyRequestError(error)
  }
}
const handlerAllowLanChange = async () => {
  try {
    await updateConfigs({ ['allow-lan']: configs.value?.['allow-lan'] })
  } catch (error) {
    notifyRequestError(error)
  }
}
</script>
