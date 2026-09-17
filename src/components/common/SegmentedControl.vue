<template>
  <div
    ref="containerRef"
    role="tablist"
    class="nav-menu nav-menu-horizontal relative"
    :class="block && 'nav-menu-block'"
  >
    <div
      aria-hidden="true"
      class="nav-indicator pointer-events-none absolute top-0 left-0"
      :class="{ 'nav-indicator-ready': ready }"
      :style="indicatorStyle"
    />
    <button
      v-for="opt in options"
      ref="segmentRefs"
      :key="opt.value"
      :data-value="opt.value"
      role="tab"
      type="button"
      class="nav-item"
      :aria-selected="modelValue === opt.value"
      @click="select(opt.value)"
    >
      <component
        :is="opt.icon"
        v-if="opt.icon"
        class="nav-item-icon"
        aria-hidden="true"
      />
      <span
        v-if="opt.label"
        class="truncate"
      >
        {{ opt.label }}
      </span>
      <span
        v-if="opt.count !== undefined && opt.count !== ''"
        class="nav-item-count"
      >
        {{ opt.count }}
      </span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { useElementSize } from '@vueuse/core'
import { nextTick, ref, watch, type Component } from 'vue'

export type SegmentOption = {
  value: string
  label?: string
  count?: string | number
  icon?: Component
}

const props = withDefaults(
  defineProps<{
    modelValue: string
    options: SegmentOption[]
    block?: boolean
  }>(),
  {
    block: false,
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const containerRef = ref<HTMLDivElement>()
const segmentRefs = ref<HTMLButtonElement[]>([])
const { width } = useElementSize(containerRef)

const ready = ref(false)
const indicatorStyle = ref({
  height: '0px',
  opacity: '0',
  transform: 'translate3d(0, 0, 0)',
  width: '0px',
})

const updateIndicator = async () => {
  await nextTick()
  const el = segmentRefs.value.find((s) => s?.dataset.value === props.modelValue)
  if (!el || !el.offsetWidth) return

  // 容器是 relative，按钮的 offsetParent 就是它，offsetLeft/Top 已经算进了容器的内边距。
  indicatorStyle.value = {
    height: `${el.offsetHeight}px`,
    opacity: '1',
    transform: `translate3d(${el.offsetLeft}px, ${el.offsetTop}px, 0)`,
    width: `${el.offsetWidth}px`,
  }
  if (!ready.value) {
    requestAnimationFrame(() => (ready.value = true))
  }
}

const select = (value: string) => {
  if (value === props.modelValue) return
  emit('update:modelValue', value)
}

watch(() => [props.modelValue, props.options, width.value], updateIndicator, {
  immediate: true,
  deep: true,
})
</script>

<style scoped>
/*
 * 共用的结构和交互配色在 styles/components/app.css 的 .nav-* 里，这里只写 Tabs 这一侧：
 * 底槽 + 主色滑块。选中态用主色是和侧栏刻意拉开的差别 —— 侧栏一次只有一个页面在身，
 * Tabs 是页面内的并列选择，需要更强的落点。
 *
 * 底槽 6% 约等于改版前的 bg-base-300/50，但走 base-content 百分比而不是 base-300：
 * base-300 在各主题里和 base-100 的明暗关系不一致，直接混主题色会让底槽时深时浅。
 */

.nav-menu {
  width: auto;
  flex-direction: row;
  gap: 2px;
  border-radius: 0.625rem;
  padding: 3px;
  background-color: color-mix(in srgb, var(--color-base-content) 6%, transparent);
}

.nav-menu-block {
  width: 100%;
}

.nav-indicator {
  background-color: var(--color-primary);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--color-base-content) 5%, transparent),
    0 1px 2px color-mix(in srgb, var(--color-base-content) 10%, transparent);
}

/* 3px 内边距 + 26px 行高 = 2rem，和同排的 *-sm 控件齐高。 */
.nav-item {
  min-height: 26px;
  flex-shrink: 1;
  justify-content: center;
  gap: 0.375rem;
  padding: 3px 0.625rem;
  font-size: 0.875rem;
  line-height: 1.25rem;
}

.nav-menu-block .nav-item {
  flex: 1;
}

.nav-item-icon {
  width: 1rem;
  height: 1rem;
}

.nav-item:not([aria-selected='true']) {
  color: color-mix(in srgb, var(--color-base-content) 55%, transparent);
}

/*
 * hover 必须在这里重申一遍：app.css 那条和上面这条特异性打平，谁赢只取决于两个
 * <style> 谁先注入，而 dev 和构建产物的注入顺序并不一致。多带一个 :hover 就稳了。
 */
@media (hover: hover) {
  .nav-item:not([aria-selected='true']):hover {
    color: var(--color-base-content);
  }
}

.nav-item[aria-selected='true'] {
  color: var(--color-primary-content);
}

.nav-item[aria-selected='true'] .nav-item-icon {
  color: currentcolor;
}

.nav-item[aria-selected='true'] .nav-item-count {
  color: color-mix(in srgb, currentcolor 70%, transparent);
}
</style>
