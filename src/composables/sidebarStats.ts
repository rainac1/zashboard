import { prettyBytesHelper, prettySpeedHelper } from '@/helper/utils'
import { activeConnections, downloadTotal, uploadTotal } from '@/store/connections'
import { downloadSpeed, memory, uploadSpeed } from '@/store/overview'
import {
  ArrowDownIcon,
  ArrowsRightLeftIcon,
  ArrowUpIcon,
  CpuChipIcon,
} from '@heroicons/vue/24/outline'
import type { Options } from 'pretty-bytes'
import { computed, type Component } from 'vue'

export type SidebarStatItem = {
  key: string
  icon: Component
  iconClass?: string
  label: string
  value: string | number
  /** 折叠态要把单位另起一行，所以数值和单位始终分开给 */
  unit?: string
  total?: string
  totalLabel?: string
}

/** 展开态不画图标，只留文字 */
export type SidebarStatGridItem = Omit<SidebarStatItem, 'icon' | 'iconClass'>

const splitText = (text: string) => {
  const at = text.lastIndexOf(' ')

  return at === -1
    ? { value: text, unit: '' }
    : { value: text.slice(0, at), unit: text.slice(at + 1) }
}

const splitBytes = (bytes: number, opts?: Options) =>
  splitText(prettyBytesHelper(bytes, { maximumFractionDigits: 1, ...opts }))

const splitSpeed = (bytes: number) => splitText(prettySpeedHelper(bytes))

export const sidebarStatItems = computed<SidebarStatItem[]>(() => {
  const download = splitSpeed(downloadSpeed.value)
  const upload = splitSpeed(uploadSpeed.value)
  const mem = splitBytes(memory.value, { binary: true })

  return [
    {
      key: 'connections',
      icon: ArrowsRightLeftIcon,
      label: 'connections',
      value: activeConnections.value.length,
    },
    {
      key: 'download',
      icon: ArrowDownIcon,
      iconClass: 'sidebar-stat-icon-arrow',
      label: 'dlSpeed',
      value: download.value,
      unit: `${download.unit}/s`,
      total: prettyBytesHelper(downloadTotal.value, { maximumFractionDigits: 1 }),
      totalLabel: 'download',
    },
    {
      key: 'upload',
      icon: ArrowUpIcon,
      iconClass: 'sidebar-stat-icon-arrow',
      label: 'ulSpeed',
      value: upload.value,
      unit: `${upload.unit}/s`,
      total: prettyBytesHelper(uploadTotal.value, { maximumFractionDigits: 1 }),
      totalLabel: 'upload',
    },
    {
      key: 'memory',
      icon: CpuChipIcon,
      label: 'memoryUsage',
      value: mem.value,
      unit: mem.unit,
    },
  ]
})

/*
 * 展开态：宽度够，累计量各占一格，六格按 2×3 排 —— 上一行是连接和内存，
 * 下两行左边下载、右边上传，先累计后速度。
 */
export const sidebarStatGrid = computed<SidebarStatGridItem[]>(() => {
  const download = splitSpeed(downloadSpeed.value)
  const upload = splitSpeed(uploadSpeed.value)
  const mem = splitBytes(memory.value, { binary: true })
  const downloaded = splitBytes(downloadTotal.value)
  const uploaded = splitBytes(uploadTotal.value)

  return [
    {
      key: 'connections',
      label: 'connections',
      value: activeConnections.value.length,
    },
    {
      key: 'memory',
      label: 'memoryUsage',
      value: mem.value,
      unit: mem.unit,
    },
    {
      key: 'download',
      label: 'download',
      value: downloaded.value,
      unit: downloaded.unit,
    },
    {
      key: 'upload',
      label: 'upload',
      value: uploaded.value,
      unit: uploaded.unit,
    },
    {
      key: 'dlSpeed',
      label: 'dlSpeed',
      value: download.value,
      unit: `${download.unit}/s`,
    },
    {
      key: 'ulSpeed',
      label: 'ulSpeed',
      value: upload.value,
      unit: `${upload.unit}/s`,
    },
  ]
})

export const statTipOf = (item: SidebarStatItem, t: (key: string) => string) =>
  item.totalLabel ? `${t(item.label)} · ${t(item.totalLabel)} ${item.total}` : t(item.label)
