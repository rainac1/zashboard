<template>
  <TimeSeriesChart
    :title="$t('memoryUsage')"
    :data="chartsData"
    :label-formatter="labelFormatter"
    :tooltip-formatter="tooltipFormatter"
    :y-axis-floor="100 * 1024 * 1024"
    :window-seconds="timeSaved"
  />
</template>

<script setup lang="ts">
import { memoryHistory, timeSaved } from '@/assembly/overview'
import TimeSeriesChart from '@/components/charts/TimeSeriesChart.vue'
import { formatHistoryTooltipParam } from '@/components/charts/chart-tooltip'
import type { ChartTooltipParam } from '@/components/charts/chart-types'
import { prettyBytesHelper } from '@/helper/utils'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const chartsData = computed(() => {
  return [
    {
      name: t('memoryUsage'),
      data: memoryHistory.value,
    },
  ]
})

const labelFormatter = (value: number) => {
  return `${prettyBytesHelper(value, {
    maximumFractionDigits: 0,
    binary: true,
  })}`
}
const tooltipFormatter = (value: ChartTooltipParam[]) => {
  return value.map((item) => formatHistoryTooltipParam(item, { binary: true })).join('')
}
</script>
