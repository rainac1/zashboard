<template>
  <div
    class="base-container w-full backdrop-blur-none!"
    v-if="isVisible"
  >
    <div class="surface flex items-center justify-between p-4">
      <div
        class="text-base-content/60 flex items-center gap-2 text-xs font-semibold tracking-wider uppercase"
      >
        {{ t('honkStatsCard') }}
      </div>
    </div>
    <div class="surface grid grid-cols-2 gap-3 px-4 pb-4 sm:grid-cols-5">
      <div class="bg-base-200/30 flex flex-col gap-1.5 rounded-xl p-4">
        <div class="text-base-content/60 text-xs font-semibold tracking-wider uppercase">
          {{ t('honkStatsOutbounds') }}
        </div>
        <div class="text-2xl font-extralight tabular-nums">{{ outbounds.length }}</div>
      </div>
      <div class="bg-base-200/30 flex flex-col gap-1.5 rounded-xl p-4">
        <div class="text-base-content/60 text-xs font-semibold tracking-wider uppercase">
          {{ t('totalTraffic') }}
        </div>
        <div class="text-2xl font-extralight tabular-nums">
          {{ prettyBytesHelper(totalStats.download + totalStats.upload) }}
        </div>
      </div>
      <div class="bg-base-200/30 flex flex-col gap-1.5 rounded-xl p-4">
        <div class="text-base-content/60 text-xs font-semibold tracking-wider uppercase">
          {{ t('download') }}
        </div>
        <div class="text-2xl font-extralight tabular-nums">
          {{ prettyBytesHelper(totalStats.download) }}
        </div>
      </div>
      <div class="bg-base-200/30 flex flex-col gap-1.5 rounded-xl p-4">
        <div class="text-base-content/60 text-xs font-semibold tracking-wider uppercase">
          {{ t('upload') }}
        </div>
        <div class="text-2xl font-extralight tabular-nums">
          {{ prettyBytesHelper(totalStats.upload) }}
        </div>
      </div>
      <div class="bg-base-200/30 flex flex-col gap-1.5 rounded-xl p-4">
        <div class="text-base-content/60 text-xs font-semibold tracking-wider uppercase">
          {{ t('honkStatsActiveConns') }}
        </div>
        <div class="text-2xl font-extralight tabular-nums">{{ totalStats.activeConns }}</div>
      </div>
    </div>
    <div class="h-96">
      <VirtualTable
        :data="outbounds"
        :columns="columns"
        sorting-key="config/honk-outbound-stats-table-sorting"
        :estimate-size="36"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { can } from '@/assembly/backend'
import { honkStats, startHonkStats, stopHonkStats } from '@/assembly/overview'
import VirtualTable from '@/components/common/VirtualTable.vue'
import { prettyBytesHelper } from '@/helper/utils'
import type { HonkStats } from '@/types'
import type { ColumnDef } from '@tanstack/vue-table'
import { computed, h, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

type HonkOutbound = HonkStats['outbounds'][number]

const { t } = useI18n()

const outbounds = computed(() =>
  [...(honkStats.value?.outbounds ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
)

const isVisible = computed(() => can('runtimeStats') && outbounds.value.length > 0)

const totalStats = computed(() =>
  outbounds.value.reduce(
    (acc, outbound) => {
      acc.upload += outbound.upload ?? 0
      acc.download += outbound.download ?? 0
      acc.activeConns += outbound.activeConns ?? 0

      return acc
    },
    { upload: 0, download: 0, activeConns: 0 },
  ),
)

const num = (value: unknown) => h('span', { class: 'tabular-nums' }, String(value ?? 0))
const bytes = (value: unknown) =>
  h('span', { class: 'tabular-nums' }, prettyBytesHelper(Number(value ?? 0)))

const columns = computed<ColumnDef<HonkOutbound>[]>(() => [
  {
    header: () => t('name'),
    id: 'name',
    accessorFn: (outbound) => outbound.name,
    cell: ({ getValue }) => h('span', {}, String(getValue() ?? '')),
    meta: { cellClass: 'w-48' },
  },
  {
    header: () => t('honkStatsActiveConns'),
    id: 'activeConns',
    accessorFn: (outbound) => outbound.activeConns ?? 0,
    cell: ({ getValue }) => num(getValue()),
    meta: { cellClass: 'w-24' },
  },
  {
    header: () => t('total'),
    id: 'totalConns',
    accessorFn: (outbound) => outbound.totalConns ?? 0,
    cell: ({ getValue }) => num(getValue()),
    meta: { cellClass: 'w-24' },
  },
  {
    header: () => t('upload'),
    id: 'upload',
    accessorFn: (outbound) => outbound.upload ?? 0,
    cell: ({ getValue }) => bytes(getValue()),
    meta: { cellClass: 'w-28' },
  },
  {
    header: () => t('download'),
    id: 'download',
    accessorFn: (outbound) => outbound.download ?? 0,
    cell: ({ getValue }) => bytes(getValue()),
    meta: { cellClass: 'w-28' },
  },
  {
    header: () => t('honkStatsErrors'),
    id: 'errors',
    accessorFn: (outbound) => outbound.errors ?? 0,
    cell: ({ getValue }) => num(getValue()),
    meta: { cellClass: 'w-24' },
  },
])

onMounted(startHonkStats)
onUnmounted(stopHonkStats)
</script>
