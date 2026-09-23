<template>
  <Transition name="backend-switch">
    <div
      v-if="visible && activeBackend"
      class="pointer-events-none fixed inset-x-0 top-0 z-[100001] flex justify-end pt-[calc(0.75rem+env(safe-area-inset-top,0px))] pr-[calc(0.75rem+env(safe-area-inset-right,0px))] pl-3"
    >
      <div
        v-if="isMiddleScreen"
        class="bg-base-100/95 border-base-border pointer-events-auto flex w-full items-center gap-2 rounded-full border py-2 pr-2 pl-3 shadow-lg backdrop-blur"
      >
        <span
          v-if="status === 'probing'"
          class="loading loading-spinner loading-xs text-primary flex-none"
        ></span>
        <CheckCircleIcon
          v-else
          class="text-success h-4 w-4 flex-none"
        />

        <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ label }}</span>
        <span
          class="flex-none text-xs"
          :class="status === 'connected' ? 'text-success' : 'text-base-content/70'"
        >
          {{ status === 'connected' ? $t('backendReachable') : $t('backendConnecting') }}
        </span>
        <span
          v-if="status === 'connected'"
          class="text-base-content/50 flex-none text-xs"
        >
          {{ latency }} ms
        </span>

        <button
          class="btn btn-circle btn-ghost btn-xs flex-none"
          @click="hide"
        >
          <XMarkIcon class="h-3.5 w-3.5" />
        </button>
      </div>

      <div
        v-else
        class="bg-base-100/95 border-base-border pointer-events-auto flex w-full max-w-sm gap-3 rounded-xl border p-3 shadow-lg backdrop-blur"
      >
        <div
          class="w-1 flex-none rounded-full transition-colors"
          :class="status === 'connected' ? 'bg-success' : 'bg-primary'"
        ></div>
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <div class="flex items-center gap-2">
            <ArrowsRightLeftIcon class="text-base-content/50 h-4 w-4 flex-none" />
            <span class="text-base-content/50 flex-1 truncate text-xs">
              {{ $t('backendSwitched') }}
            </span>
            <button
              class="btn btn-circle btn-ghost btn-xs -mt-1 -mr-1"
              @click="hide"
            >
              <XMarkIcon class="h-3.5 w-3.5" />
            </button>
          </div>

          <div class="truncate text-sm font-medium">{{ label }}</div>
          <div
            v-if="url !== label"
            class="text-base-content/50 truncate text-xs"
          >
            {{ url }}
          </div>

          <div class="mt-1 flex items-center gap-2 text-xs">
            <template v-if="status === 'probing'">
              <span class="loading loading-spinner loading-xs text-primary flex-none"></span>
              <span class="text-base-content/70">{{ $t('backendConnecting') }}</span>
            </template>
            <template v-else>
              <CheckCircleIcon class="text-success h-4 w-4 flex-none" />
              <span class="text-success">{{ $t('backendReachable') }}</span>
              <span class="text-base-content/50">{{ latency }} ms</span>
              <BackendVersion
                v-if="version"
                class="ml-auto min-w-0 text-xs"
              />
            </template>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { backendProbe, version } from '@/assembly/version'
import { getBackendProbeUrl, getLabelFromBackend, isMiddleScreen } from '@/helper/utils'
import { activeBackend, activeUuid } from '@/store/setup'
import { ArrowsRightLeftIcon, CheckCircleIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import { computed, ref, watch } from 'vue'
import BackendVersion from './BackendVersion.vue'

const CONNECTED_HIDE_DELAY = 2500

const visible = ref(false)
let hideTimer = -1

const hide = () => {
  clearTimeout(hideTimer)
  visible.value = false
}

watch(activeUuid, (uuid) => {
  clearTimeout(hideTimer)
  visible.value = Boolean(uuid)
})

const probe = computed(() =>
  backendProbe.value?.uuid === activeUuid.value ? backendProbe.value : undefined,
)
const status = computed(() => probe.value?.status ?? 'probing')
const latency = computed(() => probe.value?.latency ?? 0)

const label = computed(() => (activeBackend.value ? getLabelFromBackend(activeBackend.value) : ''))
const url = computed(() => (activeBackend.value ? getBackendProbeUrl(activeBackend.value) : ''))

watch(status, (value) => {
  if (!visible.value) return

  clearTimeout(hideTimer)

  if (value === 'connected') {
    hideTimer = setTimeout(hide, CONNECTED_HIDE_DELAY)
  } else if (value === 'failed') {
    hide()
  }
})
</script>

<style scoped>
.backend-switch-enter-active,
.backend-switch-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.backend-switch-enter-from,
.backend-switch-leave-to {
  opacity: 0;
  transform: translateX(0.75rem);
}
</style>
