<template>
  <nav
    ref="containerRef"
    class="relative"
    :aria-label="ariaLabel"
  >
    <div
      aria-hidden="true"
      class="nav-indicator pointer-events-none absolute"
      :class="{ 'nav-indicator-ready': indicatorReady }"
      :style="indicatorStyle"
    />
    <ul
      ref="menuRef"
      class="nav-menu"
      :class="{ 'nav-menu-collapsed': collapsed }"
    >
      <li
        v-for="item in items"
        :key="item.key"
        @mouseenter="(e) => mouseenterHandler(e, item)"
      >
        <component
          :is="item.to ? RouterLink : 'button'"
          v-bind="bindingOf(item)"
          class="nav-item w-full text-left"
          :data-nav-key="item.key"
          :aria-label="item.label"
          @click="!item.to && emit('select', item.key)"
        >
          <component
            :is="item.icon"
            class="nav-item-icon"
            aria-hidden="true"
          />
          <span
            v-if="!collapsed"
            class="min-w-0 flex-1 truncate"
          >
            {{ item.label }}
          </span>
        </component>
      </li>
    </ul>
  </nav>
</template>

<script setup lang="ts">
import { useTooltip } from '@/composables/use-tooltip'
import { useResizeObserver } from '@vueuse/core'
import { nextTick, ref, watch, type Component } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'

export type NavMenuItem = {
  key: string
  label: string
  icon: Component
  to?: RouteLocationRaw
}

const props = defineProps<{
  items: NavMenuItem[]
  activeKey?: string
  collapsed?: boolean
  ariaLabel?: string
}>()

const emit = defineEmits<{
  select: [key: string]
}>()

const containerRef = ref<HTMLElement>()
const menuRef = ref<HTMLUListElement>()
const indicatorReady = ref(false)
const indicatorStyle = ref({
  height: '0px',
  opacity: '0',
  transform: 'translate3d(0, 0, 0)',
  width: '0px',
})
const { showTip } = useTooltip()

const mouseenterHandler = (e: MouseEvent, item: NavMenuItem) => {
  if (!props.collapsed) return
  showTip(e, item.label, { placement: 'right' })
}

const bindingOf = (item: NavMenuItem) =>
  item.to
    ? { to: item.to }
    : { type: 'button', 'aria-current': item.key === props.activeKey ? 'page' : undefined }

const syncIndicator = () => {
  const container = containerRef.value
  if (!container || !props.activeKey) return

  const activeItem = container.querySelector<HTMLElement>(
    `[data-nav-key="${CSS.escape(props.activeKey)}"]`,
  )
  if (!activeItem) return

  const containerRect = container.getBoundingClientRect()
  const itemRect = activeItem.getBoundingClientRect()
  const x = itemRect.left - containerRect.left + container.scrollLeft
  const y = itemRect.top - containerRect.top + container.scrollTop

  indicatorStyle.value = {
    height: `${itemRect.height}px`,
    opacity: '1',
    transform: `translate3d(${x}px, ${y}px, 0)`,
    width: `${itemRect.width}px`,
  }
}

watch(
  [() => props.activeKey, () => props.collapsed, () => props.items],
  async () => {
    await nextTick()
    syncIndicator()
    requestAnimationFrame(() => {
      indicatorReady.value = true
    })
  },
  { immediate: true },
)

useResizeObserver(menuRef, syncIndicator)
useResizeObserver(containerRef, syncIndicator)

defineExpose({ syncIndicator })
</script>

<style scoped>
.nav-menu {
  width: 100%;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.25rem;
}

.nav-menu-collapsed {
  align-items: center;
  gap: 0.375rem;
}

.nav-item {
  min-height: 2.25rem;
  flex-shrink: 0;
  gap: 0.625rem;
  padding: 0.375rem 0.625rem;
  font-size: 13px;
  line-height: 1.25rem;
}

.nav-menu-collapsed .nav-item {
  width: 2.5rem;
  height: 2.5rem;
  justify-content: center;
  padding: 0;
}

.nav-item-icon {
  width: 18px;
  height: 18px;
}

.nav-indicator {
  background-color: color-mix(in srgb, var(--color-base-content) 9%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-base-content) 3%, transparent);
}
</style>
