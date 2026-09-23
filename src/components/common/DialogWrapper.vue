<template>
  <Teleport to="#app-content">
    <Transition
      name="modal"
      :duration="350"
      @after-leave="onAfterLeave"
    >
      <div
        v-show="isOpen"
        ref="backdropRef"
        class="modal"
        :class="{ 'modal-open': isPresenting }"
        :style="backdropSwipeStyle"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="title ? 'dialog-title' : undefined"
        @keydown.escape="close"
      >
        <div
          class="modal-backdrop w-screen"
          aria-hidden="true"
          @click="close"
        />

        <div
          ref="modalBoxRef"
          class="modal-box bg-base-100 relative flex flex-col overflow-hidden p-0 outline-none max-md:max-h-[85dvh] max-md:min-h-[40dvh]"
          :class="boxClass"
          :style="boxSwipeStyle"
          tabindex="-1"
          @click.stop
          @keydown.enter.self="enter"
          @touchstart="onTouchStart"
          @touchmove="onTouchMove"
          @touchend="onTouchEnd"
          @touchcancel="onTouchCancel"
          @transitionend.self="onBoxTransitionEnd"
        >
          <div
            v-if="title && isOpen"
            id="dialog-title"
            class="border-base-content/10 relative shrink-0 border-b px-4 py-2 text-base font-bold"
          >
            {{ title }}
            <slot name="title-right" />
            <button
              type="button"
              class="btn btn-circle btn-ghost btn-xs absolute top-2 right-2"
              aria-label="close"
              @click="close"
            >
              <XMarkIcon class="h-4 w-4" />
            </button>
          </div>
          <div
            v-if="isOpen"
            class="min-h-0 overflow-y-auto max-md:flex-1 md:max-h-[90dvh]"
            :class="
              noPadding
                ? 'p-0 max-md:pb-[env(safe-area-inset-bottom)]'
                : 'p-4 max-md:pb-[calc(1rem+env(safe-area-inset-bottom))]'
            "
          >
            <slot />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { useDialogOpenState } from '@/composables/use-dialog-state'
import { XMarkIcon } from '@heroicons/vue/24/outline'
import { computed, ref, watch, type CSSProperties } from 'vue'

const MOBILE_MEDIA_QUERY = '(width < 48rem)'
const DIRECTION_LOCK_DISTANCE = 10
const VERTICAL_DOMINANCE_RATIO = 1.2
const MIN_FLING_DISTANCE = 48
const CLOSE_VELOCITY = 0.5
const SWIPE_TRANSITION = 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.25s ease-out'
const SETTLE_TIMEOUT = 450

type SwipeState = 'idle' | 'pending' | 'dragging' | 'settling' | 'dismissing' | 'rejected'

const isOpen = defineModel<boolean>()
defineProps<{
  noPadding?: boolean
  boxClass?: string
  title?: string
}>()
const emits = defineEmits<{
  (e: 'enter'): void
}>()

const modalBoxRef = ref<HTMLDivElement | undefined>(undefined)
const swipeState = ref<SwipeState>('idle')
const swipeOffset = ref(0)
const swipeAnimating = ref(false)

let startX = 0
let startY = 0
let startTime = 0
let endY = 0
let settleTimer: ReturnType<typeof setTimeout> | undefined

const swipeProgress = computed(() => {
  const height = modalBoxRef.value?.offsetHeight || 1
  return Math.min(swipeOffset.value / height, 1)
})

const boxSwipeStyle = computed<CSSProperties | undefined>(() => {
  if (
    swipeState.value !== 'dragging' &&
    swipeState.value !== 'settling' &&
    swipeState.value !== 'dismissing'
  )
    return

  return {
    transform: `translate3d(0, ${swipeOffset.value}px, 0)`,
    transition: swipeAnimating.value ? SWIPE_TRANSITION : 'none',
    willChange: 'transform',
  }
})

const backdropSwipeStyle = computed<CSSProperties | undefined>(() => {
  if (
    swipeState.value !== 'dragging' &&
    swipeState.value !== 'settling' &&
    swipeState.value !== 'dismissing'
  )
    return

  return {
    backgroundColor: `oklch(0% 0 0 / ${0.4 * (1 - swipeProgress.value)})`,
    transition: swipeAnimating.value ? 'background-color 0.25s ease-out' : 'none',
  }
})

useDialogOpenState(isOpen)

const isPresenting = ref(!!isOpen.value)

const onAfterLeave = () => {
  isPresenting.value = false
  resetSwipe()
}

watch(isOpen, (val) => {
  if (val) {
    isPresenting.value = true
    resetSwipe()
    requestAnimationFrame(() => {
      modalBoxRef.value?.focus()
    })
  } else if (swipeState.value !== 'dismissing') {
    resetSwipe()
  }
})

function isAtTopOfScrollableAncestors(target: EventTarget | null) {
  const modalBox = modalBoxRef.value
  let element = target instanceof Element ? target : null

  while (element && element !== modalBox) {
    if (element instanceof HTMLElement) {
      const { overflowY } = getComputedStyle(element)
      const isScrollable =
        (overflowY === 'auto' || overflowY === 'scroll') &&
        element.scrollHeight > element.clientHeight

      if (isScrollable && element.scrollTop > 0) return false
    }
    element = element.parentElement
  }

  return true
}

function onTouchStart(event: TouchEvent) {
  if (swipeState.value === 'dragging') {
    settleSwipe()
    return
  }
  if (swipeState.value === 'settling') resetSwipe()
  if (swipeState.value !== 'idle') return

  if (
    !isOpen.value ||
    !window.matchMedia(MOBILE_MEDIA_QUERY).matches ||
    event.touches.length !== 1
  ) {
    swipeState.value = 'rejected'
    return
  }

  const touch = event.touches[0]
  startX = touch.clientX
  startY = touch.clientY
  endY = startY
  startTime = performance.now()
  swipeState.value = isAtTopOfScrollableAncestors(event.target) ? 'pending' : 'rejected'
}

function onTouchMove(event: TouchEvent) {
  if (swipeState.value !== 'pending' && swipeState.value !== 'dragging') return
  if (event.touches.length !== 1) {
    onTouchCancel()
    return
  }

  const touch = event.touches[0]
  const deltaX = touch.clientX - startX
  const deltaY = touch.clientY - startY
  endY = touch.clientY

  if (swipeState.value === 'pending') {
    if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < DIRECTION_LOCK_DISTANCE) return

    if (deltaY > 0 && deltaY >= Math.abs(deltaX) * VERTICAL_DOMINANCE_RATIO) {
      swipeState.value = 'dragging'
    } else if (deltaY < 0 || Math.abs(deltaX) >= Math.abs(deltaY) * VERTICAL_DOMINANCE_RATIO) {
      swipeState.value = 'rejected'
      return
    } else {
      return
    }
  }

  if (swipeState.value !== 'dragging') return

  event.preventDefault()
  swipeOffset.value = Math.max(deltaY, 0)
}

function closeDistance() {
  const height = modalBoxRef.value?.offsetHeight || 0
  return Math.min(120, Math.max(72, height * 0.2))
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function onTouchEnd(event: TouchEvent) {
  if (swipeState.value === 'settling' || swipeState.value === 'dismissing') return
  if (swipeState.value !== 'dragging') {
    resetSwipe()
    return
  }

  const touch = event.changedTouches[0]
  if (touch) endY = touch.clientY

  const distance = Math.max(endY - startY, 0)
  const duration = Math.max(performance.now() - startTime, 1)
  const isFastFling = distance >= MIN_FLING_DISTANCE && distance / duration >= CLOSE_VELOCITY

  if (distance >= closeDistance() || isFastFling) {
    if (prefersReducedMotion()) {
      resetSwipe()
      close()
      return
    }

    swipeState.value = 'dismissing'
    swipeAnimating.value = true
    swipeOffset.value = modalBoxRef.value?.offsetHeight || window.innerHeight
    close()
    return
  }

  settleSwipe()
}

function onTouchCancel() {
  if (swipeState.value === 'dragging') {
    settleSwipe()
  } else {
    resetSwipe()
  }
}

function settleSwipe() {
  if (prefersReducedMotion() || swipeOffset.value === 0) {
    resetSwipe()
    return
  }

  swipeState.value = 'settling'
  swipeAnimating.value = true
  swipeOffset.value = 0
  settleTimer = setTimeout(resetSwipe, SETTLE_TIMEOUT)
}

function onBoxTransitionEnd(event: TransitionEvent) {
  if (event.propertyName === 'transform' && swipeState.value === 'settling') resetSwipe()
}

function resetSwipe() {
  clearTimeout(settleTimer)
  settleTimer = undefined
  swipeState.value = 'idle'
  swipeOffset.value = 0
  swipeAnimating.value = false
  startX = 0
  startY = 0
  startTime = 0
  endY = 0
}

function close() {
  isOpen.value = false
}
function enter() {
  emits('enter')
}
</script>

<style scoped>
.modal {
  opacity: 1;
}

.modal-enter-active,
.modal-leave-active {
  transition: background-color 0.25s ease-out;
}
.modal-enter-from,
.modal-leave-to {
  background-color: transparent;
}

.modal-enter-active .modal-box,
.modal-leave-active .modal-box {
  transition:
    transform 0.35s cubic-bezier(0.32, 0.72, 0, 1),
    opacity 0.25s ease-out;
}
.modal-enter-from .modal-box,
.modal-leave-to .modal-box {
  opacity: 0;
  transform: scale(0.95);
}

@media (width < 48rem) {
  .modal-enter-from .modal-box,
  .modal-leave-to .modal-box {
    transform: translateY(100%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .modal-enter-active .modal-box,
  .modal-leave-active .modal-box {
    transition: none;
  }
  .modal-enter-from .modal-box,
  .modal-leave-to .modal-box {
    transform: none;
  }
}
</style>
