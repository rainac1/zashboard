<template>
  <TimeSeriesChart
    :title="$t('traffic')"
    :data="chartsData"
    :label-formatter="labelFormatter"
    :tooltip-formatter="tooltipFormatter"
    :y-axis-floor="60 * 1000"
    :window-seconds="timeSaved"
  />
</template>

<script setup lang="ts">
import TimeSeriesChart from '@/components/charts/TimeSeriesChart.vue'
import { formatHistoryTooltipParam } from '@/components/charts/chartTooltip'
import type { ChartTooltipParam } from '@/components/charts/chartTypes'
import { prettyBytesHelper } from '@/helper/utils'
import { downloadSpeedHistory, timeSaved, uploadSpeedHistory } from '@/store/overview'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const chartsData = computed(() => {
  return [
    {
      name: t('ulSpeed'),
      data: uploadSpeedHistory.value,
    },
    {
      name: t('dlSpeed'),
      data: downloadSpeedHistory.value,
    },
  ]
})

const labelFormatter = (value: number) => {
  return `${prettyBytesHelper(value, {
    maximumFractionDigits: 0,
    binary: false,
  })}/s`
}
const tooltipFormatter = (value: ChartTooltipParam[]) => {
  return value
    .map((item) => formatHistoryTooltipParam(item, { binary: false, suffix: '/s' }))
    .join('')
}
</script>
