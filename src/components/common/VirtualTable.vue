<template>
  <div
    ref="parentRef"
    class="base-container m-3 h-full overflow-auto backdrop-blur-none!"
  >
    <!-- 玻璃挂在这一层：表格用撑高的空行虚拟，盒子高度就是虚拟总高（见 appearance.css） -->
    <div class="table-glass min-w-min">
      <table :class="['table', sizeOfTable, tableClass]">
        <thead
          class="bg-base-100 border-base-300/60 sticky top-0 z-10 border-b backdrop-blur-none!"
        >
          <tr
            v-for="headerGroup in tanstackTable.getHeaderGroups()"
            :key="headerGroup.id"
          >
            <th
              v-for="header in headerGroup.headers"
              :key="header.id"
              :colSpan="header.colSpan"
              :class="[
                inheritedStyle,
                header.column.columnDef.meta?.headerClass,
                header.column.getCanSort() && 'cursor-pointer select-none',
              ]"
              @click="header.column.getToggleSortingHandler()?.($event)"
            >
              <div class="inline-flex items-center gap-1 whitespace-nowrap">
                <FlexRender
                  v-if="!header.isPlaceholder"
                  :render="header.column.columnDef.header"
                  :props="header.getContext()"
                />
                <ArrowUpCircleIcon
                  v-if="header.column.getIsSorted() === 'asc'"
                  class="h-4 w-4"
                />
                <ArrowDownCircleIcon
                  v-if="header.column.getIsSorted() === 'desc'"
                  class="h-4 w-4"
                />
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="rows.length === 0">
            <td
              :colspan="tanstackTable.getVisibleLeafColumns().length"
              class="text-base-content/50 h-90"
            >
              <div class="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                <CircleStackIcon class="h-10 w-10 opacity-60" />
                <div class="text-base">{{ t('noData') }}</div>
              </div>
            </td>
          </tr>
          <template v-else>
            <!--
              行高固定,用上下两个撑高的空行代替 transform 定位:表格行不能脱离文档流,
              spacer 是唯一能让 tbody 高度与虚拟总高对齐、又不影响 sticky thead 的写法。
            -->
            <tr
              v-if="paddingTop > 0"
              :style="{ height: `${paddingTop}px` }"
            ></tr>
            <tr
              v-for="virtualRow in virtualRows"
              :key="virtualRow.key.toString()"
              :style="{ height: `${estimateSize}px` }"
              class="hover:bg-(--table-hover)!"
              :class="[
                virtualRow.index % 2 === 0 && 'table-row-stripe',
                rowClass?.(rows[virtualRow.index].original),
              ]"
              @click="emits('rowClick', rows[virtualRow.index].original)"
            >
              <td
                v-for="cell in rows[virtualRow.index].getVisibleCells()"
                :key="cell.id"
                class="max-w-xl truncate text-sm whitespace-nowrap"
                :class="cell.column.columnDef.meta?.cellClass"
                :title="cellTitle(cell)"
                @contextmenu="handleCellRightClick($event, cell)"
              >
                <FlexRender
                  v-if="!cell.getIsPlaceholder()"
                  :render="cell.column.columnDef.cell"
                  :props="cell.getContext()"
                />
              </td>
            </tr>
            <tr
              v-if="paddingBottom > 0"
              :style="{ height: `${paddingBottom}px` }"
            ></tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts" generic="T">
import { TABLE_SIZE } from '@/constant'
import { backgroundImage } from '@/helper/indexeddb'
import { showNotification } from '@/helper/notification'
import { useStorage } from '@/helper/storage'
import { tableSize } from '@/store/settings'
import { ArrowDownCircleIcon, ArrowUpCircleIcon, CircleStackIcon } from '@heroicons/vue/24/outline'
import {
  FlexRender,
  getCoreRowModel,
  getSortedRowModel,
  isFunction,
  useVueTable,
  type Cell,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from '@tanstack/vue-table'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const props = withDefaults(
  defineProps<{
    data: T[]
    columns: ColumnDef<T>[]
    // 排序状态落盘的 key,同一个表格换页面回来还在
    sortingKey: string
    initialSorting?: SortingState
    estimateSize?: number
    overscan?: number
    columnVisibility?: VisibilityState
    rowClass?: (row: T) => string | undefined
    tableClass?: string
  }>(),
  {
    estimateSize: 36,
    overscan: 24,
  },
)

const emits = defineEmits<{
  (e: 'rowClick', row: T): void
}>()

const { t } = useI18n()

const sorting = useStorage<SortingState>(props.sortingKey, () => props.initialSorting ?? [])

const tanstackTable = useVueTable({
  get data() {
    return props.data
  },
  get columns() {
    return props.columns
  },
  state: {
    get sorting() {
      return sorting.value
    },
    get columnVisibility() {
      return props.columnVisibility ?? {}
    },
  },
  onSortingChange: (updater) => {
    sorting.value = isFunction(updater) ? updater(sorting.value) : updater
  },
  getSortedRowModel: getSortedRowModel(),
  getCoreRowModel: getCoreRowModel(),
})

const rows = computed(() => tanstackTable.getRowModel().rows)

const parentRef = ref<HTMLElement | null>(null)
const rowVirtualizerOptions = computed(() => {
  return {
    count: rows.value.length,
    getScrollElement: () => parentRef.value,
    estimateSize: () => props.estimateSize,
    overscan: props.overscan,
  }
})

const rowVirtualizer = useVirtualizer(rowVirtualizerOptions)
const virtualRows = computed(() => rowVirtualizer.value.getVirtualItems())
const paddingTop = computed(() => virtualRows.value[0]?.start ?? 0)
const paddingBottom = computed(() => {
  const last = virtualRows.value[virtualRows.value.length - 1]

  if (!last) {
    return 0
  }

  return rowVirtualizer.value.getTotalSize() - last.end
})

const classMap = {
  [TABLE_SIZE.SMALL]: 'table-xs',
  [TABLE_SIZE.LARGE]: 'table-sm',
}
const sizeOfTable = computed(() => classMap[tableSize.value])

const inheritedStyle = computed(() => {
  const baseStyle = 'bg-inherit'

  if (!backgroundImage.value) {
    return baseStyle
  }

  return `${baseStyle} backdrop-blur-sm`
})

// 单元格自带更完整的 tooltip 时,原生 title 和右键复制拿到的都只是排序用的原始值,反而是干扰
const cellTitle = (cell: Cell<T, unknown>) => {
  if (cell.column.columnDef.meta?.noCellTitle) {
    return undefined
  }

  const value = cell.getValue()

  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined
}

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    showNotification({
      content: 'copySuccess',
      type: 'alert-success',
      timeout: 2000,
    })
  } catch {
    // 降级处理
    const textArea = document.createElement('textarea')

    textArea.value = text
    document.body.appendChild(textArea)
    textArea.select()
    try {
      document.execCommand('copy')
      showNotification({
        content: 'copySuccess',
        type: 'alert-success',
        timeout: 2000,
      })
    } catch (error) {
      console.error('复制失败:', error)
    }
    document.body.removeChild(textArea)
  }
}

const handleCellRightClick = (event: MouseEvent, cell: Cell<T, unknown>) => {
  const cellValue = cellTitle(cell)

  if (cellValue && cellValue !== '-') {
    event.preventDefault()
    copyToClipboard(cellValue)
  }
}
</script>
