export type CartesianChartPoint = [number, number]

export interface TimestampedChartPoint {
  name: number
  value: CartesianChartPoint
  init?: boolean
}

export type ChartPoint = CartesianChartPoint | TimestampedChartPoint

export interface ChartSeries {
  name: string
  data: ChartPoint[]
}

export interface ChartTooltipParam {
  data: ChartPoint
  seriesName: string
  color: string
}

export const getChartPointValue = (point: ChartPoint): CartesianChartPoint =>
  Array.isArray(point) ? point : point.value

export const isInitialChartPoint = (point: ChartPoint) =>
  !Array.isArray(point) && point.init === true
