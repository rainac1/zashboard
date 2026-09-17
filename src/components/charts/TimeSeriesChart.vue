<!--
  侧边栏里的趋势图。一行一个指标：标题和图例在头部,走势在下面,
  高度由外层的 .sidebar-chart-row 决定。

  图例自己画,不用 echarts 的 legend —— 它画在图的底部,和暂停按钮抢同一块地方,
  还得为它留出一条 bottom 边距。挪到头部之后那块地方全给了走势。
  只有一条线时不出图例:名字和左边的标题是同一个,再写一遍是噪声。
-->
<template>
  <div
    class="flex flex-col overflow-hidden"
    data-page-swipe-ignore
  >
    <div class="sidebar-chart-head">
      <span class="sidebar-chart-title">{{ title }}</span>
      <span
        v-if="legend.length"
        class="sidebar-chart-legend"
      >
        <span
          v-for="item in legend"
          :key="item.name"
          class="sidebar-chart-legend-item"
        >
          <span
            class="sidebar-chart-legend-dot"
            :style="{ backgroundColor: item.color }"
          />
          {{ item.name }}
        </span>
      </span>
      <button
        v-if="showPauseButton"
        class="sidebar-chart-pause"
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
import { echarts, useChartTheme, useEChart, type EChartOption } from '@/composables/useEChart'
import { PauseCircleIcon, PlayCircleIcon } from '@heroicons/vue/24/outline'
import { computed, ref } from 'vue'
import type { ChartSeries, ChartTooltipParam } from './chartTypes'
import { getChartPointValue } from './chartTypes'

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

// 最后一条是主角,用主色;其余用次色。图例的点要和线条同色,所以这条规则得共用。
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
    // 头部已经占掉了标题的位置,四周只留够刻度文字的量,让走势铺满剩下的地方。
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
      // 只切三段:侧边栏这点高度里,再多几条线和几个数字就只剩噪声了。
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
        // 底部那个 0 是废话,藏掉;其余刻度右对齐贴着轴,左边留一条窄槽就够。
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
