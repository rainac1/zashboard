<template>
  <div
    class="flex flex-col overflow-hidden"
    data-page-swipe-ignore
  >
    <div class="flex min-w-0 items-center gap-2 px-3 pt-2 pb-0.5">
      <span class="text-base-content/70 min-w-0 flex-1 truncate text-[11px] leading-4 font-medium">
        {{ title }}
      </span>
      <span
        v-if="legend.length"
        class="text-base-content/70 flex min-w-0 items-center gap-2.5 text-[10px] leading-4"
      >
        <span
          v-for="item in legend"
          :key="item.name"
          class="flex min-w-0 items-center gap-1 truncate"
        >
          <span
            class="size-1.5 shrink-0 rounded-full"
            :style="{ backgroundColor: item.color }"
          />
          {{ item.name }}
        </span>
      </span>
      <button
        v-if="showPauseButton"
        class="sidebar-chart-pause text-base-content/45 flex size-4 flex-none items-center justify-center rounded transition-opacity duration-150 outline-none"
        :aria-pressed="isPaused"
        :aria-label="title"
        @click="isPaused = !isPaused"
      >
        <component
          :is="isPaused ? PlayCircleIcon : PauseCircleIcon"
          class="size-3.5"
        />
      </button>
    </div>
    <div
      ref="chartRef"
      class="min-h-0 w-full flex-1"
    />
  </div>
</template>

<script setup lang="ts">
import { echarts, useChartTheme, useEChart, type EChartOption } from '@/composables/use-echart'
import { PauseCircleIcon, PlayCircleIcon } from '@heroicons/vue/24/outline'
import { computed, ref } from 'vue'
import type { ChartSeries, ChartTooltipParam } from './chart-types'
import { getChartPointValue } from './chart-types'

const props = withDefaults(
  defineProps<{
    title: string
    data: ChartSeries[]
    labelFormatter: (value: number) => string
    tooltipFormatter: (value: ChartTooltipParam[]) => string
    yAxisFloor?: number
    windowSeconds?: number
    showPauseButton?: boolean
  }>(),
  {
    windowSeconds: 20,
    showPauseButton: true,
  },
)

const chartRef = ref<HTMLElement>()
const isPaused = ref(false)
const { colors, fontFamily } = useChartTheme(chartRef)

const colorOf = (index: number) =>
  index === props.data.length - 1
    ? { line: colors.seriesPrimary, area: colors.seriesPrimaryMuted }
    : { line: colors.seriesSecondary, area: colors.seriesSecondaryMuted }

const legend = computed(() =>
  props.data.length > 1
    ? props.data.map((item, index) => ({ name: item.name, color: colorOf(index).line }))
    : [],
)

const options = computed<EChartOption>(() => {
  const lastPoint = props.data[0]?.data.at(-1)
  const latest = lastPoint ? getChartPointValue(lastPoint)[0] : Date.now()

  return {
    animationDurationUpdate: 1000,
    animationEasingUpdate: 'linear',
    grid: { left: 42, top: 12, right: 10, bottom: 8 },
    tooltip: {
      show: true,
      trigger: 'axis',
      backgroundColor: colors.surface,
      borderColor: colors.surface,
      borderRadius: 8,
      confine: true,
      padding: [0, 3],
      textStyle: {
        color: colors.text,
        fontFamily: fontFamily.value,
        fontSize: 11,
      },
      formatter: props.tooltipFormatter,
    },
    xAxis: {
      type: 'time',
      min: latest - (props.windowSeconds - 1) * 1000,
      max: latest - 1000,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
    },
    yAxis: {
      type: 'value',
      splitNumber: 3,
      min: 0,
      max:
        props.yAxisFloor === undefined
          ? undefined
          : (value: { max: number }) => Math.max(value.max, props.yAxisFloor!),
      axisTick: { show: false },
      axisLine: { show: false },
      splitLine: {
        show: true,
        lineStyle: {
          type: 'dashed',
          color: colors.grid,
        },
      },
      axisLabel: {
        showMinLabel: false,
        align: 'right',
        margin: 8,
        formatter: props.labelFormatter,
        color: colors.textMuted,
        fontFamily: fontFamily.value,
        fontSize: 9,
      },
    },
    series: props.data.map((item, index) => {
      const { line: lineColor, area: areaColor } = colorOf(index)

      return {
        name: item.name,
        type: 'line',
        data: item.data,
        symbol: 'none',
        smooth: true,
        color: lineColor,
        emphasis: { disabled: true },
        lineStyle: { width: 1 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: lineColor },
            { offset: 1, color: areaColor },
          ]),
        },
      }
    }),
  }
})

useEChart(chartRef, options, { paused: isPaused })
</script>

<style scoped>
@media (hover: hover) {
  .sidebar-chart-pause {
    opacity: 0;
  }

  .sidebar-chart-row:hover .sidebar-chart-pause {
    opacity: 1;
  }

  .sidebar-chart-pause:hover {
    color: var(--color-base-content);
  }
}

.sidebar-chart-pause:focus-visible,
.sidebar-chart-pause[aria-pressed='true'] {
  opacity: 1;
}
</style>
