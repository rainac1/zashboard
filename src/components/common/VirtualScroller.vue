<template>
  <div
    ref="parentRef"
    class="flex h-full w-full flex-col overflow-y-auto"
  >
    <slot name="before" />
    <div
      :style="{
        height: `${totalSize}px`,
      }"
      class="relative w-full shrink-0"
      v-if="data.length > 0"
    >
      <div
        :class="['absolute top-3 right-3 left-3', contentClass]"
        :style="{
          transform: `translateY(${virtualRows[0]?.start ?? 0}px)`,
        }"
      >
        <div
          v-for="row in virtualRows"
          :key="row.key.toString()"
          :data-index="row.index"
          :ref="(ref) => measureElement(ref as Element | null)"
          class="pb-2"
        >
          <div class="base-container">
            <slot
              :item="data[row.index]"
              :index="row.index"
            />
          </div>
        </div>
      </div>
    </div>
    <div
      v-else
      class="base-container m-3 flex-row p-3 text-sm"
      :style="{ marginTop: `${paddingTop + 12}px`, marginBottom: `${paddingBottom}px` }"
    >
      {{ $t('noData') }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { usePaddingForViews } from '@/composables/use-padding-for-views'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { computed, nextTick, ref } from 'vue'

const { paddingTop, paddingBottom } = usePaddingForViews({
  offsetTop: 0,
  offsetBottom: 0,
})
const parentRef = ref<HTMLElement | null>(null)
const props = withDefaults(
  defineProps<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any[]
    size?: number
    overscan?: number
    contentClass?: string
    getItemKey?: (item: unknown, index: number) => string | number
  }>(),
  {
    data: () => [],
    size: 64,
    overscan: 24,
    contentClass: '',
  },
)

const virutalOptions = computed(() => {
  return {
    count: props.data.length,
    getScrollElement: () => parentRef.value,
    estimateSize: () => props.size,
    getItemKey: (index: number) => props.getItemKey?.(props.data[index], index) ?? index,
    overscan: props.overscan,
    paddingStart: paddingTop.value,
    paddingEnd: paddingBottom.value + 24,
  }
})

const rowVirtualizer = useVirtualizer(virutalOptions)
const virtualRows = computed(() => rowVirtualizer.value.getVirtualItems())
const totalSize = computed(() => rowVirtualizer.value.getTotalSize())
const measureElement = (el: Element | null) => {
  if (!el) {
    return
  }

  nextTick(() => {
    rowVirtualizer.value.measureElement(el)
  })

  return undefined
}
</script>
