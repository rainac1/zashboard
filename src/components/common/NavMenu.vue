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
          @click="clickHandler(item)"
        >
          <component
            :is="item.icon"
            class="nav-item-icon"
            :class="[motionOf(item.icon), { 'is-playing': playing.has(item.key) }]"
            aria-hidden="true"
            @animationend="playing.delete(item.key)"
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
import {
  ArrowsRightLeftIcon,
  Cog6ToothIcon,
  CubeTransparentIcon,
  DocumentTextIcon,
  GlobeAltIcon,
  HomeIcon,
  ServerIcon,
  Squares2X2Icon,
  SwatchIcon,
} from '@heroicons/vue/24/outline'
import { useResizeObserver } from '@vueuse/core'
import { nextTick, reactive, ref, watch, type Component } from 'vue'
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

const ICON_MOTION = new Map<Component, string>([
  [Squares2X2Icon, 'motion-tiles'],
  [GlobeAltIcon, 'motion-spin-y'],
  [ArrowsRightLeftIcon, 'motion-swap'],
  [SwatchIcon, 'motion-fan'],
  [DocumentTextIcon, 'motion-flip'],
  [Cog6ToothIcon, 'motion-gear'],
  [CubeTransparentIcon, 'motion-cube'],
  [ServerIcon, 'motion-bounce'],
  [HomeIcon, 'motion-bounce'],
])

const motionOf = (icon: Component) => ICON_MOTION.get(icon) ?? 'motion-pop'
const playing = reactive(new Set<string>())

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

const clickHandler = (item: NavMenuItem) => {
  playing.add(item.key)
  if (!item.to) emit('select', item.key)
}

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
  flex-shrink: 0;
  transform-origin: center;
}

.nav-indicator {
  background-color: color-mix(in srgb, var(--color-base-content) 9%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-base-content) 3%, transparent);
}

@media (prefers-reduced-motion: no-preference) {
  .motion-fan {
    transform-origin: 30% 80%;
  }

  .is-playing {
    animation-duration: 0.6s;
    animation-timing-function: ease-in-out;
  }

  .is-playing.motion-tiles {
    animation-name: nav-tiles;
    animation-timing-function: cubic-bezier(0.34, 1.4, 0.64, 1);
  }

  .is-playing.motion-gear {
    animation-name: nav-gear;
    animation-duration: 0.7s;
    animation-timing-function: cubic-bezier(0.34, 1.4, 0.64, 1);
  }

  .is-playing.motion-fan {
    animation-name: nav-fan;
  }

  .is-playing.motion-pop {
    animation-name: nav-pop;
  }

  .is-playing.motion-spin-y {
    animation-name: nav-spin-y;
    animation-duration: 0.8s;
  }

  .is-playing.motion-swap {
    animation-name: nav-swap;
  }

  .is-playing.motion-flip {
    animation-name: nav-flip;
  }

  .is-playing.motion-cube {
    animation-name: nav-cube;
    animation-duration: 0.8s;
  }

  .is-playing.motion-bounce {
    animation-name: nav-bounce;
  }
}

@keyframes nav-tiles {
  to {
    transform: rotate(90deg);
  }
}

@keyframes nav-gear {
  to {
    transform: rotate(180deg);
  }
}

@keyframes nav-fan {
  50% {
    transform: rotate(-14deg);
  }
}

@keyframes nav-pop {
  50% {
    transform: scale(1.18);
  }
}

@keyframes nav-spin-y {
  to {
    transform: rotateY(360deg);
  }
}

@keyframes nav-swap {
  25% {
    transform: translateX(-3px);
  }
  75% {
    transform: translateX(3px);
  }
}

@keyframes nav-flip {
  40% {
    transform: translateY(-3px) rotate(-6deg);
  }
  70% {
    transform: translateY(0) rotate(3deg);
  }
}

@keyframes nav-cube {
  to {
    transform: rotateX(180deg) rotateY(180deg);
  }
}

@keyframes nav-bounce {
  30% {
    transform: translateY(-4px) scaleY(1.05);
  }
  55% {
    transform: translateY(0) scaleY(0.92);
  }
  75% {
    transform: translateY(-1px);
  }
}
</style>
