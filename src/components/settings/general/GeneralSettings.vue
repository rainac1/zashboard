<template>
  <template v-if="hasVisibleApplicationItems">
    <div class="settings-section-label">{{ $t('settingsSectionApplication') }}</div>
    <div class="settings-grid">
      <SettingItem
        v-if="showDashboardUpgrade"
        :setting-key="k.actions"
        :anchor-key="`${k.actions}.upgradeDashboard`"
        :when="can('dashboardUpgrade')"
      >
        <div class="setting-item-label">{{ $t('upgradeDashboard') }}</div>
        <button
          :class="twMerge('btn btn-sm', isUIUpgrading ? 'animate-pulse' : '')"
          @click="handlerClickUpgradeUI"
        >
          <ArrowUpCircleIcon class="h-4 w-4" />
        </button>
      </SettingItem>
      <SettingItem :setting-key="k.actions">
        <div class="setting-item-label">{{ $t('dashboardSettings') }}</div>
        <DashboardSettings icon-only />
      </SettingItem>
      <LanguageSelect />
      <SettingItem
        :setting-key="k.autoUpgradeDashboard"
        :when="can('dashboardUpgrade')"
      >
        <div class="setting-item-label">{{ $t('autoUpgradeDashboard') }}</div>
        <input
          v-model="autoUpgradeDashboard"
          class="toggle"
          type="checkbox"
        />
      </SettingItem>
    </div>
  </template>

  <template v-if="hasVisibleNetworkItems">
    <div class="settings-section-label">{{ $t('settingsSectionNetworkData') }}</div>
    <div class="settings-grid">
      <SettingItem :setting-key="k.autoDisconnectIdleUDP">
        <div class="setting-item-label">
          {{ $t('autoDisconnectIdleUDP') }}
          <QuestionMarkCircleIcon
            class="h-4 w-4 cursor-pointer"
            @mouseenter="showTip($event, $t('autoDisconnectIdleUDPTip'))"
          />
        </div>
        <input
          v-model="autoDisconnectIdleUDP"
          type="checkbox"
          class="toggle"
        />
      </SettingItem>
      <SettingItem
        :setting-key="k.autoDisconnectIdleUDPTime"
        :when="autoDisconnectIdleUDP"
        class="settings-dependent-item"
      >
        <div class="setting-item-label">{{ $t('autoDisconnectIdleUDPTime') }}</div>
        <input
          v-model="autoDisconnectIdleUDPTime"
          type="number"
          class="input input-sm w-20"
        />
        mins
      </SettingItem>
      <SettingItem :setting-key="k.IPInfoAPI">
        <div class="setting-item-label">
          {{ $t('IPInfoAPI') }}
          <QuestionMarkCircleIcon
            class="h-4 w-4 cursor-pointer"
            @mouseenter="showTip($event, $t('IPInfoAPITip'))"
          />
        </div>
        <SelectInput
          v-model="IPInfoAPI"
          class="select select-sm min-w-24"
          :options="
            Object.values(IP_INFO_API)
              .filter((value) => value !== IP_INFO_API.IPIP)
              .map((value) => ({ value, label: value }))
          "
        />
      </SettingItem>
      <SettingItem
        :setting-key="k.geoipCountryDatabaseURL"
        class="max-sm:flex-col max-sm:items-start! max-sm:py-3"
      >
        <div class="setting-item-label">
          {{ $t('geoipCountryDatabaseURL') }}
          <QuestionMarkCircleIcon
            class="h-4 w-4 cursor-pointer"
            @mouseenter="showTip($event, $t('geoipDatabaseURLTip'))"
          />
        </div>
        <TextInput
          v-model="geoipCountryDatabaseURL"
          class="w-full flex-2"
          :clearable="true"
        />
      </SettingItem>
      <SettingItem
        :setting-key="k.geoipASNDatabaseURL"
        class="max-sm:flex-col max-sm:items-start! max-sm:py-3"
      >
        <div class="setting-item-label">
          {{ $t('geoipASNDatabaseURL') }}
          <QuestionMarkCircleIcon
            class="h-4 w-4 cursor-pointer"
            @mouseenter="showTip($event, $t('geoipDatabaseURLTip'))"
          />
        </div>
        <TextInput
          v-model="geoipASNDatabaseURL"
          class="w-full flex-2"
          :clearable="true"
        />
      </SettingItem>
    </div>
  </template>

  <template v-if="hasVisibleInteractionItems">
    <div class="settings-section-label">{{ $t('settingsSectionInteraction') }}</div>
    <div class="settings-grid">
      <SettingItem
        :setting-key="k.scrollAnimationEffect"
        :when="isMiddleScreen"
      >
        <div class="setting-item-label">{{ $t('scrollAnimationEffect') }}</div>
        <input
          v-model="scrollAnimationEffect"
          type="checkbox"
          class="toggle"
        />
      </SettingItem>
      <SettingItem
        :setting-key="k.swipeInPages"
        :when="isMiddleScreen"
      >
        <div class="setting-item-label">{{ $t('swipeInPages') }}</div>
        <input
          v-model="swipeInPages"
          type="checkbox"
          class="toggle"
        />
      </SettingItem>
      <SettingItem
        :setting-key="k.swipeInTabs"
        :when="isMiddleScreen && swipeInPages"
        class="settings-dependent-item"
      >
        <div class="setting-item-label">{{ $t('swipeInTabs') }}</div>
        <input
          v-model="swipeInTabs"
          type="checkbox"
          class="toggle"
        />
      </SettingItem>
      <SettingItem
        :setting-key="k.disablePullToRefresh"
        :when="isMiddleScreen"
      >
        <div class="setting-item-label">
          {{ $t('disablePullToRefresh') }}
          <QuestionMarkCircleIcon
            class="h-4 w-4 cursor-pointer"
            @mouseenter="showTip($event, $t('disablePullToRefreshTip'))"
          />
        </div>
        <input
          v-model="disablePullToRefresh"
          type="checkbox"
          class="toggle"
        />
      </SettingItem>
      <KeyboardShortcutsSettings v-if="!isMiddleScreen" />
      <SettingItem
        :setting-key="k.displayAllFeatures"
        :when="showDisplayAllFeatures"
      >
        <div class="setting-item-label">
          {{ $t('displayAllFeatures') }}
          <QuestionMarkCircleIcon
            class="h-4 w-4 cursor-pointer"
            @mouseenter="showTip($event, $t('displayAllFeaturesTip'))"
          />
        </div>
        <input
          v-model="displayAllFeatures"
          type="checkbox"
          class="toggle"
        />
      </SettingItem>
    </div>
  </template>
</template>

<script setup lang="ts">
import { can, showDisplayAllFeatures } from '@/assembly/backend'
import { upgradeUIAPI } from '@/assembly/version'
import DashboardSettings from '@/components/common/DashboardSettings.vue'
import SelectInput from '@/components/common/SelectInput.vue'
import TextInput from '@/components/common/TextInput.vue'
import KeyboardShortcutsSettings from '@/components/settings/general/KeyboardShortcutsSettings.vue'
import LanguageSelect from '@/components/settings/general/LanguageSelect.vue'
import SettingItem from '@/components/settings/SettingItem.vue'
import { useIsSettingVisible } from '@/composables/settings'
import { GENERAL_ITEM_KEYS } from '@/config/settingsItems'
import { IP_INFO_API } from '@/constant'
import { handlerUpgradeSuccess } from '@/helper'
import { notifyActionPending } from '@/helper/notification'
import { notifyRequestError } from '@/helper/requestError'
import { useTooltip } from '@/helper/tooltip'
import { isMiddleScreen } from '@/helper/utils'
import {
  autoDisconnectIdleUDP,
  autoDisconnectIdleUDPTime,
  autoUpgradeDashboard,
  disablePullToRefresh,
  displayAllFeatures,
  geoipASNDatabaseURL,
  geoipCountryDatabaseURL,
  IPInfoAPI,
  scrollAnimationEffect,
  swipeInPages,
  swipeInTabs,
} from '@/store/settings'
import { ArrowUpCircleIcon, QuestionMarkCircleIcon } from '@heroicons/vue/24/outline'
import { twMerge } from 'tailwind-merge'
import { computed, ref } from 'vue'

const { showTip } = useTooltip()
const k = GENERAL_ITEM_KEYS

const isVisibleActions = useIsSettingVisible(k.actions)
const isVisibleLanguage = useIsSettingVisible(k.language)
const isVisibleAutoUpgrade = useIsSettingVisible(k.autoUpgradeDashboard)
const isVisibleAutoDisconnectIdleUDP = useIsSettingVisible(k.autoDisconnectIdleUDP)
const isVisibleAutoDisconnectIdleUDPTime = useIsSettingVisible(k.autoDisconnectIdleUDPTime)
const isVisibleIPInfoAPI = useIsSettingVisible(k.IPInfoAPI)
const isVisibleGeoipCountryDatabaseURL = useIsSettingVisible(k.geoipCountryDatabaseURL)
const isVisibleGeoipASNDatabaseURL = useIsSettingVisible(k.geoipASNDatabaseURL)
const isVisibleScrollAnimationEffect = useIsSettingVisible(k.scrollAnimationEffect)
const isVisibleSwipeInPages = useIsSettingVisible(k.swipeInPages)
const isVisibleSwipeInTabs = useIsSettingVisible(k.swipeInTabs)
const isVisibleDisablePullToRefresh = useIsSettingVisible(k.disablePullToRefresh)
const isVisibleShortcuts = useIsSettingVisible(k.keyboardShortcuts)
const isVisibleDisplayAllFeatures = useIsSettingVisible(k.displayAllFeatures)

const hasVisibleApplicationItems = computed(
  () => isVisibleActions.value || isVisibleLanguage.value || isVisibleAutoUpgrade.value,
)
const hasVisibleNetworkItems = computed(
  () =>
    isVisibleAutoDisconnectIdleUDP.value ||
    (autoDisconnectIdleUDP.value && isVisibleAutoDisconnectIdleUDPTime.value) ||
    isVisibleIPInfoAPI.value ||
    isVisibleGeoipCountryDatabaseURL.value ||
    isVisibleGeoipASNDatabaseURL.value,
)
const hasVisibleInteractionItems = computed(
  () =>
    (isMiddleScreen.value &&
      (isVisibleScrollAnimationEffect.value ||
        isVisibleSwipeInPages.value ||
        (swipeInPages.value && isVisibleSwipeInTabs.value) ||
        isVisibleDisablePullToRefresh.value)) ||
    (!isMiddleScreen.value && isVisibleShortcuts.value) ||
    (showDisplayAllFeatures.value && isVisibleDisplayAllFeatures.value),
)

// honk 没有 /upgrade/ui,按钮点了必然 404。
const showDashboardUpgrade = computed(() => can('dashboardUpgrade'))

const isUIUpgrading = ref(false)
const handlerClickUpgradeUI = async () => {
  if (isUIUpgrading.value) return
  isUIUpgrading.value = true
  // 升级请求可能跑好一会儿,按钮只是轻轻闪一下 —— 先弹一条「执行中」,结果出来再顶掉。
  const notifyKey = notifyActionPending('upgradeDashboard')
  try {
    await upgradeUIAPI()
    handlerUpgradeSuccess(notifyKey)
    setTimeout(() => window.location.reload(), 1000)
  } catch (error) {
    notifyRequestError(error, notifyKey)
  } finally {
    isUIUpgrading.value = false
  }
}
</script>
