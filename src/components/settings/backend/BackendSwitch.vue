<template>
  <div :class="compact ? 'flex-none' : 'w-full'">
    <button
      v-if="compact"
      ref="triggerRef"
      class="btn btn-circle btn-sm"
      :aria-label="$t('backend')"
      @click="toggle"
      @mouseenter="showLabelTip"
    >
      <ServerIcon class="h-5 w-5" />
    </button>

    <button
      v-else
      ref="triggerRef"
      class="btn btn-sm w-full flex-nowrap justify-between font-normal"
      @click="toggle"
    >
      <template v-if="activeBackend">
        <BackendStatusDot
          :status="activeState.status"
          :show-latency="false"
        />
        <span class="min-w-0 flex-1 truncate text-left">
          {{ getLabelFromBackend(activeBackend) }}
        </span>
      </template>
      <span
        v-else
        class="min-w-0 flex-1 truncate text-left"
      >
        {{ $t('noBackendYet') }}
      </span>
      <ChevronUpDownIcon class="h-4 w-4 flex-none opacity-50" />
    </button>

    <Teleport
      to="#app-content"
      v-if="isReady"
    >
      <Transition name="backend-switch">
        <div
          v-if="isOpen"
          ref="panelRef"
          class="border-base-border bg-base-100 overlay-glass fixed z-[998] flex flex-col gap-1 overflow-hidden rounded-lg border p-1 shadow-lg backdrop-blur-sm"
          :style="panelStyle"
        >
          <div
            v-if="backendList.length"
            class="flex min-h-0 flex-col gap-1 overflow-y-auto"
            @mouseenter="closeActions"
          >
            <button
              v-for="backend in backendList"
              :key="backend.uuid"
              class="flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors"
              :class="backend.uuid === activeUuid ? 'bg-primary/10' : 'hover:bg-base-200'"
              @click="switchTo(backend.uuid)"
            >
              <BackendStatusDot
                :status="stateOf(backend.uuid).status"
                :show-latency="false"
              />
              <span class="min-w-0 flex-1 truncate text-sm">
                {{ getLabelFromBackend(backend) }}
              </span>
              <span
                v-if="stateOf(backend.uuid).status === 'online'"
                class="text-base-content/50 flex-none text-xs tabular-nums"
              >
                {{ stateOf(backend.uuid).latency }} ms
              </span>
            </button>
          </div>

          <div
            v-if="backendList.length"
            class="bg-base-content/10 mx-1 h-px flex-none"
          ></div>

          <button
            v-if="menuActions.length"
            ref="actionsTriggerRef"
            class="flex flex-none items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors"
            :class="isActionsOpen ? 'bg-base-200' : 'hover:bg-base-200'"
            :aria-expanded="isActionsOpen"
            @click="toggleActions"
            @pointerenter="hoverOpenActions"
          >
            <WrenchScrewdriverIcon class="h-4 w-4 flex-none opacity-60" />
            <span class="min-w-0 flex-1 truncate">{{ $t('actions') }}</span>
            <ChevronRightIcon class="h-4 w-4 flex-none opacity-50" />
          </button>

          <button
            class="hover:bg-base-200 flex flex-none items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors"
            @click="manage"
            @mouseenter="closeActions"
          >
            <Cog6ToothIcon class="h-4 w-4 flex-none opacity-60" />
            {{ backendList.length ? $t('manageBackends') : $t('addBackend') }}
          </button>
        </div>
      </Transition>

      <Transition name="backend-switch">
        <div
          v-if="isOpen && isActionsOpen"
          ref="actionsPanelRef"
          class="border-base-border bg-base-100 overlay-glass fixed z-[998] flex flex-col gap-1 overflow-y-auto rounded-lg border p-1 shadow-lg backdrop-blur-sm"
          :style="actionsPanelStyle"
        >
          <button
            v-for="action in menuActions"
            :key="action.key"
            class="hover:bg-base-200 flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors disabled:opacity-50"
            :disabled="action.running"
            @click="runAction(action)"
          >
            <span
              v-if="action.running"
              class="loading loading-spinner h-4 w-4 flex-none"
            ></span>
            <component
              v-else
              :is="action.icon"
              class="h-4 w-4 flex-none opacity-60"
            />
            <span class="whitespace-nowrap">{{ $t(action.label) }}</span>
          </button>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import BackendStatusDot from '@/components/common/BackendStatusDot.vue'
import { menuBackendActions, type BackendAction } from '@/helper/backend-actions'
import { useBackendListProbe } from '@/composables/use-backend-list-probe'
import { useTooltip } from '@/composables/use-tooltip'
import { getLabelFromBackend } from '@/helper/utils'
import {
  activeBackend,
  activeUuid,
  backendList,
  openBackendManager,
  setActiveBackend,
} from '@/store/setup'
import {
  ChevronRightIcon,
  ChevronUpDownIcon,
  Cog6ToothIcon,
  ServerIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/vue/24/outline'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, type CSSProperties } from 'vue'

const GAP = 4
const MIN_WIDTH = 224
const ACTIONS_MIN_WIDTH = 176
const VIEWPORT_PADDING = 8

const props = withDefaults(
  defineProps<{
    compact?: boolean
    showActions?: boolean
  }>(),
  { compact: false, showActions: true },
)

const triggerRef = ref<HTMLButtonElement>()
const panelRef = ref<HTMLDivElement>()
const isOpen = ref(false)
const panelStyle = ref<CSSProperties>({})

const actionsTriggerRef = ref<HTMLButtonElement>()
const actionsPanelRef = ref<HTMLDivElement>()
const isActionsOpen = ref(false)
const actionsPanelStyle = ref<CSSProperties>({})

const menuActions = computed(() => (props.showActions ? menuBackendActions.value : []))

const isReady = ref(false)

const { stateOf } = useBackendListProbe(isOpen)

const activeState = computed(() => stateOf.value(activeUuid.value || ''))

const { showTip } = useTooltip()

const showLabelTip = (event: MouseEvent) => {
  if (!activeBackend.value) return
  showTip(event, getLabelFromBackend(activeBackend.value), { placement: 'right' })
}

const updatePosition = () => {
  const trigger = triggerRef.value

  if (!trigger) return

  const rect = trigger.getBoundingClientRect()
  const width = Math.max(rect.width, MIN_WIDTH)
  const left = Math.min(
    Math.max(rect.left, VIEWPORT_PADDING),
    window.innerWidth - width - VIEWPORT_PADDING,
  )
  const spaceBelow = window.innerHeight - rect.bottom - GAP - VIEWPORT_PADDING
  const spaceAbove = rect.top - GAP - VIEWPORT_PADDING

  const dropUp = spaceBelow < 160 && spaceAbove > spaceBelow

  panelStyle.value = {
    left: `${left}px`,
    width: `${width}px`,
    maxHeight: `${Math.max(dropUp ? spaceAbove : spaceBelow, 120)}px`,
    ...(dropUp
      ? { bottom: `${window.innerHeight - rect.top + GAP}px` }
      : { top: `${rect.bottom + GAP}px` }),
  }
}

const updateActionsPosition = () => {
  const anchor = actionsTriggerRef.value

  if (!anchor) return

  const rect = anchor.getBoundingClientRect()
  const panelRect = actionsPanelRef.value?.getBoundingClientRect()
  const width = Math.max(panelRect?.width ?? 0, ACTIONS_MIN_WIDTH)
  const spaceRight = window.innerWidth - rect.right - GAP - VIEWPORT_PADDING
  const spaceLeft = rect.left - GAP - VIEWPORT_PADDING
  const flipLeft = spaceRight < width && spaceLeft > spaceRight
  const left = flipLeft
    ? Math.max(rect.left - GAP - width, VIEWPORT_PADDING)
    : Math.min(
        rect.right + GAP,
        Math.max(window.innerWidth - width - VIEWPORT_PADDING, VIEWPORT_PADDING),
      )
  const maxHeight = window.innerHeight - VIEWPORT_PADDING * 2
  const height = Math.min(panelRect?.height ?? 0, maxHeight)

  actionsPanelStyle.value = {
    left: `${left}px`,
    top: `${Math.min(
      Math.max(rect.top - VIEWPORT_PADDING / 2, VIEWPORT_PADDING),
      Math.max(window.innerHeight - VIEWPORT_PADDING - height, VIEWPORT_PADDING),
    )}px`,
    minWidth: `${ACTIONS_MIN_WIDTH}px`,
    maxHeight: `${maxHeight}px`,
  }
}

const updatePositions = () => {
  updatePosition()
  if (isActionsOpen.value) nextTick(updateActionsPosition)
}

const closeActions = () => {
  isActionsOpen.value = false
}

const openActions = () => {
  if (!menuActions.value.length || isActionsOpen.value) return

  updateActionsPosition()
  isActionsOpen.value = true
  nextTick(updateActionsPosition)
}

const toggleActions = () => (isActionsOpen.value ? closeActions() : openActions())

const hoverOpenActions = (event: PointerEvent) => {
  if (event.pointerType !== 'mouse') return
  openActions()
}

const runAction = (action: BackendAction) => {
  if (action.running) return

  action.run()
  if (action.opensModal) close()
}

const handlePointerDown = (event: PointerEvent) => {
  const target = event.target as Node | null

  if (!target) return
  if (
    triggerRef.value?.contains(target) ||
    panelRef.value?.contains(target) ||
    actionsPanelRef.value?.contains(target)
  )
    return

  close()
}

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') close()
}

const listen = (add: boolean) => {
  const fn = add ? window.addEventListener : window.removeEventListener

  fn('scroll', updatePositions, true)
  fn('resize', updatePositions)
  fn('pointerdown', handlePointerDown as EventListener, true)
  fn('keydown', handleKeydown as EventListener)
}

function close() {
  if (!isOpen.value) return

  isOpen.value = false
  closeActions()
  listen(false)
}

const open = () => {
  updatePosition()
  isOpen.value = true
  listen(true)
}

const toggle = () => (isOpen.value ? close() : open())

const switchTo = (uuid: string) => {
  setActiveBackend(uuid)
  close()
}

const manage = () => {
  openBackendManager(backendList.value.length ? { mode: 'list' } : { mode: 'create' })
  close()
}

onMounted(() => {
  isReady.value = true
})

onBeforeUnmount(() => listen(false))
</script>

<style scoped>
.backend-switch-enter-active,
.backend-switch-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s cubic-bezier(0.32, 0.72, 0, 1);
}

.backend-switch-enter-from,
.backend-switch-leave-to {
  opacity: 0;
  transform: scale(0.97);
}

@media (prefers-reduced-motion: reduce) {
  .backend-switch-enter-active,
  .backend-switch-leave-active {
    transition: opacity 0.15s ease;
  }

  .backend-switch-enter-from,
  .backend-switch-leave-to {
    transform: none;
  }
}
</style>
