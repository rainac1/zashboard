import { prettyBytesHelper } from '@/helper/utils'
import dayjs from 'dayjs'
import type { ChartTooltipParam } from './chart-types'
import { getChartPointValue, isInitialChartPoint } from './chart-types'

export const escapeChartHtml = (value: unknown) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

export const chartTooltipRow = ({
  color,
  label,
  detail,
}: {
  color: string
  label: string
  detail: string
}) => `
  <div class="flex items-center my-2 gap-1">
    <div class="w-4 h-4 rounded-full" style="background-color: ${escapeChartHtml(color)}"></div>
    ${escapeChartHtml(label)}
    ${escapeChartHtml(detail)}
  </div>`

export const formatHistoryTooltipParam = (
  param: ChartTooltipParam,
  {
    binary,
    suffix = '',
  }: {
    binary: boolean
    suffix?: string
  },
) =>
  formatTimeSeriesTooltipParam(param, (value) => `${prettyBytesHelper(value, { binary })}${suffix}`)

export const formatTimeSeriesTooltipParam = (
  param: ChartTooltipParam,
  formatValue: (value: number) => string,
) => {
  if (isInitialChartPoint(param.data)) return ''

  const [timestamp, value] = getChartPointValue(param.data)
  return chartTooltipRow({
    color: param.color,
    label: param.seriesName,
    detail: `(${dayjs(timestamp).format('HH:mm:ss')}): ${formatValue(value)}`,
  })
}
