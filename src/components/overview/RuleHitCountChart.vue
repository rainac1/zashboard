<template>
  <div
    class="relative h-48 w-full overflow-hidden xl:h-64"
    data-page-swipe-ignore
  >
    <div
      ref="chartRef"
      class="h-full w-full"
    />
    <div
      v-if="isEmpty"
      class="text-base-content/50 absolute inset-0 flex items-center justify-center"
    >
      {{ t('noData') }}
    </div>
    <button
      class="btn btn-ghost btn-xs absolute right-1 bottom-0"
      @click="isPaused = !isPaused"
    >
      <component
        :is="isPaused ? PlayCircleIcon : PauseCircleIcon"
        class="h-4 w-4"
      />
    </button>
  </div>
</template>

<script setup lang="ts">
import { escapeChartHtml } from '@/components/charts/chart-tooltip'
import { useChartTheme, useEChart, echarts, type EChartOption } from '@/composables/use-echart'
import { isMiddleScreen } from '@/helper/utils'
import { rules } from '@/assembly/rules'
import { PauseCircleIcon, PlayCircleIcon } from '@heroicons/vue/24/outline'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { buildRuleCountData, type RuleCountType } from './rule-hit-count'

const props = defineProps<{
  type: RuleCountType
}>()

const { t } = useI18n()
const chartRef = ref<HTMLElement>()
const isPaused = ref(false)
const { colors, fontFamily } = useChartTheme(chartRef)

const barData = computed(() =>
  buildRuleCountData(rules.value, props.type, isMiddleScreen.value ? 16 : 40),
)
const isEmpty = computed(() => barData.value.length === 0)

const options = computed<EChartOption>(() => {
  const barTopColor = props.type === 'hit' ? colors.seriesPrimaryMuted : colors.seriesSecondaryMuted
  const barBottomColor = props.type === 'hit' ? colors.seriesPrimary : colors.seriesSecondary
  const translationKey = props.type === 'hit' ? 'ruleHitCount' : 'ruleMissCount'

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: colors.surface,
      borderColor: colors.surface,
      confine: true,
      padding: [8, 12],
      textStyle: {
        color: colors.text,
        fontFamily: fontFamily.value,
      },
      formatter: (params: unknown) => {
        const value = Array.isArray(params) ? params[0] : params
        const param = value as { name: string; value: number }

        return `
          <div>
            <div class="font-semibold">${escapeChartHtml(param.name)}</div>
            <div class="text-sm opacity-80 mt-1">${escapeChartHtml(
              t(translationKey, { count: param.value }),
            )}</div>
          </div>
        `
      },
    },
    grid: {
      left: '2%',
      right: '2%',
      top: '10%',
      bottom: '5%',
      containLabel: false,
    },
    xAxis: {
      type: 'category',
      data: barData.value.map((item) => item.name),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: colors.text,
        fontFamily: fontFamily.value,
      },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: {
        show: true,
        lineStyle: {
          type: 'dashed',
          color: colors.grid,
        },
      },
      axisLabel: {
        color: colors.text,
        fontFamily: fontFamily.value,
      },
    },
    series: [
      {
        name: t('rule'),
        type: 'bar',
        data: barData.value.map((item) => item.value),
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: barTopColor },
            { offset: 1, color: barBottomColor },
          ]),
          borderRadius: [4, 4, 0, 0],
        },
        label: {
          show: true,
          position: 'top',
          formatter: (params: { value: number }) => params.value,
          color: colors.text,
          fontFamily: fontFamily.value,
        },
        emphasis: {
          itemStyle: { color: barTopColor },
        },
      },
    ],
  }
})

useEChart(chartRef, options, { paused: isPaused, isEmpty })
</script>
