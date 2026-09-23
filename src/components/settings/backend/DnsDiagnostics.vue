<template>
  <div class="flex w-full flex-col gap-3">
    <SegmentedControl
      v-if="tabOptions.length > 1"
      block
      :model-value="activeTab"
      :options="tabOptions"
      @update:model-value="activeTab = $event as DnsTab"
    />

    <DnsQuery v-if="activeTab === 'query'" />
    <DaeDnsPanel
      v-else
      :view="activeTab === 'cache' ? 'cache' : 'log'"
    />
  </div>
</template>

<script lang="ts" setup>
import { can } from '@/assembly/backend'
import SegmentedControl, { type SegmentOption } from '@/components/common/SegmentedControl.vue'
import DaeDnsPanel from '@/components/dae/DaeDnsPanel.vue'
import DnsQuery from '@/components/settings/backend/DnsQuery.vue'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

type DnsTab = 'query' | 'cache' | 'log'

const { t } = useI18n()

const availableTabs = computed<DnsTab[]>(() => {
  const tabs: DnsTab[] = []

  if (can('dnsQuery')) tabs.push('query')
  if (can('dnsCache')) tabs.push('cache')
  if (can('dnsLog')) tabs.push('log')

  return tabs
})

const TAB_LABEL: Record<DnsTab, string> = {
  query: 'DNSQuery',
  cache: 'daeDnsCache',
  log: 'daeDnsLog',
}

const activeTab = ref<DnsTab>(availableTabs.value[0] ?? 'query')
const tabOptions = computed<SegmentOption[]>(() =>
  availableTabs.value.map((tab) => ({ value: tab, label: t(TAB_LABEL[tab]) })),
)

watch(availableTabs, (tabs) => {
  if (tabs.length && !tabs.includes(activeTab.value)) activeTab.value = tabs[0]
})
</script>
