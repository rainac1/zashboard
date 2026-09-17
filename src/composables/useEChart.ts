import { themeColorScheme, type ThemeColorScheme } from '@/helper/theme'
import { isMiddleScreen } from '@/helper/utils'
import { emoji, font } from '@/store/settings'
import { useElementSize } from '@vueuse/core'
import { BarChart, LineChart, SankeyChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { debounce } from 'lodash'
import type { ComputedRef, Ref } from 'vue'
import { nextTick, onMounted, onUnmounted, reactive, ref, shallowRef, watch } from 'vue'

echarts.use([BarChart, LineChart, SankeyChart, GridComponent, TooltipComponent, CanvasRenderer])

export type EChart = echarts.ECharts
export type EChartOption = echarts.EChartsCoreOption

type ChartElementRef = Ref<HTMLElement | null | undefined>

export interface ChartTheme {
  seriesPrimary: string
  seriesPrimaryMuted: string
  seriesSecondary: string
  seriesSecondaryMuted: string
  grid: string
  border: string
  textMuted: string
  text: string
  surface: string
}

const CHART_COLOR_SCHEMES: Record<ThemeColorScheme, ChartTheme> = {
  light: {
    seriesPrimary: 'rgba(29, 29, 31, 0.6)',
    seriesPrimaryMuted: 'rgba(29, 29, 31, 0.3)',
    seriesSecondary: 'rgba(81, 104, 139, 0.75)',
    seriesSecondaryMuted: 'rgba(71, 85, 105, 0.28)',
    grid: 'rgba(29, 29, 31, 0.1)',
    border: 'rgba(29, 29, 31, 0.3)',
    textMuted: 'rgba(29, 29, 31, 0.6)',
    text: '#1d1d1f',
    surface: 'rgba(255, 255, 255, 0.7)',
  },
  dark: {
    seriesPrimary: 'rgba(245, 245, 247, 0.6)',
    seriesPrimaryMuted: 'rgba(245, 245, 247, 0.3)',
    seriesSecondary: 'rgba(148, 163, 184, 0.78)',
    seriesSecondaryMuted: 'rgba(148, 163, 184, 0.32)',
    grid: 'rgba(245, 245, 247, 0.1)',
    border: 'rgba(245, 245, 247, 0.3)',
    textMuted: 'rgba(245, 245, 247, 0.6)',
    text: '#f5f5f7',
    surface: 'rgba(29, 29, 31, 0.7)',
  },
}

export const useChartTheme = (chartRef: ChartElementRef) => {
  const colors = reactive<ChartTheme>({ ...CHART_COLOR_SCHEMES[themeColorScheme.value] })
  const fontFamily = ref('')

  const updateFont = () => {
    if (!chartRef.value) return
    fontFamily.value = getComputedStyle(chartRef.value).fontFamily
  }

  onMounted(updateFont)
  watch(themeColorScheme, (scheme) => Object.assign(colors, CHART_COLOR_SCHEMES[scheme]), {
    flush: 'post',
  })
  watch([font, emoji], () => nextTick(updateFont))

  return { colors, fontFamily }
}

interface UseEChartOptions {
  paused?: Readonly<Ref<boolean>>
  isEmpty?: Readonly<Ref<boolean>>
  onInit?: (chart: EChart) => void | (() => void)
}

export const useEChart = (
  chartRef: ChartElementRef,
  options: ComputedRef<EChartOption>,
  { paused, isEmpty, onInit }: UseEChartOptions = {},
) => {
  const chart = shallowRef<EChart>()
  const { width, height } = useElementSize(chartRef)
  let removeInitListeners: (() => void) | undefined
  let touchTarget: HTMLElement | null = null

  const render = () => {
    if (!chart.value || paused?.value) return

    if (isEmpty?.value) {
      chart.value.clear()
      return
    }

    chart.value.setOption(options.value)
  }

  const resize = debounce(() => chart.value?.resize(), 100)

  const removeTouchListener = () => {
    touchTarget?.removeEventListener('touchend', hideTooltip)
    touchTarget = null
  }

  const hideTooltip = () => {
    chart.value?.dispatchAction({ type: 'hideTip' })
  }

  const syncTouchListener = () => {
    removeTouchListener()
    if (!isMiddleScreen.value || !chartRef.value) return

    touchTarget = chartRef.value
    touchTarget.addEventListener('touchend', hideTooltip)
  }

  watch(options, render)
  watch([width, height], resize)
  watch(isMiddleScreen, syncTouchListener)
  if (paused) {
    watch(paused, (value) => {
      if (!value) render()
    })
  }
  if (isEmpty) {
    watch(isEmpty, render)
  }

  onMounted(() => {
    if (!chartRef.value) return

    chart.value = echarts.init(chartRef.value)
    removeInitListeners = onInit?.(chart.value) || undefined
    syncTouchListener()
    render()
  })

  onUnmounted(() => {
    resize.cancel()
    removeTouchListener()
    removeInitListeners?.()
    chart.value?.dispose()
    chart.value = undefined
  })

  return {
    chart,
    render,
    resize: () => {
      resize.cancel()
      chart.value?.resize()
    },
  }
}

export { echarts }
