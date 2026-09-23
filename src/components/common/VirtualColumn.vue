<template>
  <div
    ref="columnRef"
    class="relative w-full"
    :style="{ height: `${totalSize}px` }"
  >
    <div
      v-for="row in virtualRows"
      :key="row.key.toString()"
      :data-index="row.index"
      :data-proxy-page-item="data[row.index]"
      :ref="(el) => measureRow(el as Element | null)"
      class="absolute inset-x-0"
      :style="{ top: `${row.start - scrollMargin}px` }"
    >
      <slot
        :item="data[row.index]"
        :index="row.index"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { provideVirtualRowShift } from '@/composables/use-virtual-row-shift'
import { createVirtualRowShift } from '@/helper/virtual-row-shift'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    data: string[]
    scrollElement: HTMLElement | null
    scrollMargin: number
    estimateSize: number
    sizeCacheKey: string
    gap?: number
    overscan?: number
  }>(),
  {
    gap: 12,
    overscan: 4,
  },
)

const measuredSizes = new Map<string, number>()
const sizeKey = (name: string) => `${props.sizeCacheKey}::${name}`

const measureCardHeight = (element: Element, entry: ResizeObserverEntry | undefined) => {
  const box = entry?.borderBoxSize?.[0]

  return box ? Math.round(box.blockSize) : (element as HTMLElement).offsetHeight
}

const virtualizerOptions = computed(() => ({
  count: props.data.length,
  getScrollElement: () => props.scrollElement,
  getItemKey: (index: number) => props.data[index],
  estimateSize: (index: number) =>
    measuredSizes.get(sizeKey(props.data[index])) ?? props.estimateSize,
  measureElement: measureCardHeight,
  scrollMargin: props.scrollMargin,
  overscan: props.overscan,
  gap: props.gap,
}))

const columnRef = ref<HTMLDivElement>()
const rowVirtualizer = useVirtualizer(virtualizerOptions)

const virtualRowShift = createVirtualRowShift(
  () => columnRef.value,
  (row) => rowVirtualizer.value.measureElement(row),
)
provideVirtualRowShift(virtualRowShift)
const virtualRows = computed(() => rowVirtualizer.value.getVirtualItems())
const totalSize = computed(() => rowVirtualizer.value.getTotalSize())

const measuredElements = new WeakSet<Element>()

const measureRow = (el: Element | null) => {
  if (!el || measuredElements.has(el)) return

  measuredElements.add(el)
  nextTick(() => {
    if (el.isConnected) {
      rowVirtualizer.value.measureElement(el)
    }
  })
}

const scrollToItem = (name: string) => {
  const index = props.data.indexOf(name)

  if (index < 0) return false

  rowVirtualizer.value.scrollToIndex(index, { align: 'start', behavior: 'auto' })

  return true
}

const correctScrollBy = (delta: number) => {
  const scrollElement = props.scrollElement

  if (!scrollElement) return

  rowVirtualizer.value.scrollToOffset(scrollElement.scrollTop + delta, { behavior: 'auto' })
}

defineExpose({ scrollToItem, correctScrollBy })

onBeforeUnmount(() => {
  virtualRowShift.destroy()

  for (const [key, size] of rowVirtualizer.value.itemSizeCache) {
    if (size > 0) {
      measuredSizes.set(sizeKey(String(key)), size)
    }
  }
})
</script>

<style scoped>
.virtual-row-shift-row {
  transform: translateY(var(--virtual-row-shift, 0px));
}
</style>
