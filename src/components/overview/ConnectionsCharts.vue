<template>
  <TimeSeriesChart
    :title="$t('connections')"
    :data="chartsData"
    :label-formatter="labelFormatter"
    :tooltip-formatter="tooltipFormatter"
    :y-axis-floor="100"
    :window-seconds="timeSaved"
  />
</template>

<script setup lang="ts">
import TimeSeriesChart from '@/components/charts/TimeSeriesChart.vue'
import { formatTimeSeriesTooltipParam } from '@/components/charts/chartTooltip'
import type { ChartTooltipParam } from '@/components/charts/chartTypes'
import { connectionsHistory, timeSaved } from '@/store/overview'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const chartsData = computed(() => {
  return [
    {
      name: t('connections'),
      data: connectionsHistory.value,
    },
  ]
})

const labelFormatter = (value: number) => String(value)
const tooltipFormatter = (value: ChartTooltipParam[]) => {
  return value.map((item) => formatTimeSeriesTooltipParam(item, String)).join('\n')
}
</script>
