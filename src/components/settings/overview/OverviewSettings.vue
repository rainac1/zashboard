<template>
  <div class="text-sm">
    <template v-if="hasVisibleCardsLayout">
      <div class="settings-section-label">{{ $t('settingsSectionCardsLayout') }}</div>
      <div class="settings-grid">
        <OverviewCard v-if="!splitOverviewPage" />
        <SettingItem :setting-key="k.splitOverviewPage">
          <div class="setting-item-label">{{ $t('splitOverviewPage') }}</div>
          <input
            v-model="splitOverviewPage"
            class="toggle"
            type="checkbox"
          />
        </SettingItem>
      </div>
    </template>

    <template v-if="hasVisibleStartupChecks">
      <div class="settings-section-label">{{ $t('settingsSectionStartupChecks') }}</div>
      <div class="settings-grid">
        <SettingItem :setting-key="k.autoIPCheckWhenStart">
          <div class="setting-item-label">{{ $t('autoIPCheckWhenStart') }}</div>
          <input
            v-model="autoIPCheck"
            class="toggle"
            type="checkbox"
          />
        </SettingItem>
        <SettingItem :setting-key="k.autoConnectionCheckWhenStart">
          <div class="setting-item-label">{{ $t('autoConnectionCheckWhenStart') }}</div>
          <input
            v-model="autoConnectionCheck"
            class="toggle"
            type="checkbox"
          />
        </SettingItem>
      </div>
    </template>

    <template v-if="hasVisibleDesktopSidebar">
      <div class="settings-section-label">{{ $t('settingsSectionDesktopSidebar') }}</div>
      <div class="settings-grid">
        <SettingItem
          :setting-key="k.showStatisticsWhenSidebarCollapsed"
          :when="!isMiddleScreen"
        >
          <div class="setting-item-label">{{ $t('showStatisticsWhenSidebarCollapsed') }}</div>
          <input
            v-model="showStatisticsWhenSidebarCollapsed"
            class="toggle"
            type="checkbox"
          />
        </SettingItem>
        <SettingItem
          :setting-key="k.numberOfChartsInSidebar"
          :when="!isMiddleScreen"
        >
          <div class="setting-item-label">{{ $t('numberOfChartsInSidebar') }}</div>
          <SelectInput
            v-model="numberOfChartsInSidebar"
            class="select select-sm min-w-24"
            :options="[1, 2, 3].map((value) => ({ value, label: String(value) }))"
          />
        </SettingItem>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import SelectInput from '@/components/common/SelectInput.vue'
import SettingItem from '@/components/settings/SettingItem.vue'
import { useIsSettingVisible } from '@/composables/use-setting-visibility'
import { OVERVIEW_ITEM_KEYS } from '@/config/settings-items'
import { isMiddleScreen } from '@/helper/utils'
import {
  autoConnectionCheck,
  autoIPCheck,
  numberOfChartsInSidebar,
  showStatisticsWhenSidebarCollapsed,
  splitOverviewPage,
} from '@/store/settings'
import { computed } from 'vue'
import OverviewCard from './OverviewCard.vue'

const k = OVERVIEW_ITEM_KEYS
const isVisibleSplitOverview = useIsSettingVisible(k.splitOverviewPage)
const isVisibleIPCheck = useIsSettingVisible(k.autoIPCheckWhenStart)
const isVisibleConnectionCheck = useIsSettingVisible(k.autoConnectionCheckWhenStart)
const isVisibleSidebarStatistics = useIsSettingVisible(k.showStatisticsWhenSidebarCollapsed)
const isVisibleSidebarCharts = useIsSettingVisible(k.numberOfChartsInSidebar)

const hasVisibleCardsLayout = computed(
  () => isVisibleSplitOverview.value || !splitOverviewPage.value,
)
const hasVisibleStartupChecks = computed(
  () => isVisibleIPCheck.value || isVisibleConnectionCheck.value,
)
const hasVisibleDesktopSidebar = computed(
  () => !isMiddleScreen.value && (isVisibleSidebarStatistics.value || isVisibleSidebarCharts.value),
)
</script>
