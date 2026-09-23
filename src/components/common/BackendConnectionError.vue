<template>
  <Transition name="connection-error">
    <div
      v-if="visible && activeBackend"
      class="bg-base-200/80 fixed inset-0 z-[100000] flex items-center justify-center overflow-auto p-4 backdrop-blur-sm"
    >
      <div
        class="border-base-border bg-base-100 flex w-96 max-w-full flex-col gap-3 rounded-xl border px-6 py-5 shadow-lg"
      >
        <div class="flex items-start gap-3">
          <span
            class="bg-error/10 text-error flex h-10 w-10 flex-none items-center justify-center rounded-lg"
          >
            <ExclamationTriangleIcon class="h-5 w-5" />
          </span>
          <div class="min-w-0 flex-1">
            <h1 class="text-base font-medium">{{ $t('backendUnreachable') }}</h1>
            <div class="text-base-content/60 truncate text-sm">{{ label }}</div>
            <div
              v-if="url !== label"
              class="text-base-content/40 truncate text-xs"
            >
              {{ url }}
            </div>
          </div>
        </div>

        <div class="bg-error/10 text-error rounded-lg px-3 py-2 text-xs leading-5 break-all">
          {{ detail || $t('backendConnectionFailed') }}
        </div>

        <div class="flex gap-2">
          <button
            class="btn btn-primary btn-sm flex-1"
            :disabled="isRetrying"
            @click="retry"
          >
            <span
              v-if="isRetrying"
              class="loading loading-spinner loading-xs"
            ></span>
            {{ isRetrying ? $t('backendConnecting') : $t('retry') }}
          </button>
          <button
            class="btn btn-sm flex-1"
            @click="editActiveBackend"
          >
            {{ $t('editBackendTitle') }}
          </button>
        </div>

        <template v-if="otherBackends.length">
          <div class="divider my-0 text-xs">{{ $t('switchToAnotherBackend') }}</div>
          <div class="-mr-2 flex max-h-48 flex-col gap-1 overflow-y-auto pr-2">
            <button
              v-for="backend in otherBackends"
              :key="backend.uuid"
              class="hover:bg-base-200 flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors"
              @click="setActiveBackend(backend.uuid)"
            >
              <ServerIcon class="text-base-content/40 h-4 w-4 flex-none" />
              <span class="min-w-0 flex-1 truncate text-sm">
                {{ getLabelFromBackend(backend) }}
              </span>
              <ChevronRightIcon class="text-base-content/30 h-4 w-4 flex-none" />
            </button>
          </div>
          <button
            class="btn btn-ghost btn-sm"
            :disabled="isSwitching"
            @click="switchToReachableBackend"
          >
            <span
              v-if="isSwitching"
              class="loading loading-spinner loading-sm"
            ></span>
            {{ $t('autoSwitchBackend') }}
          </button>
        </template>

        <button
          class="btn btn-ghost btn-sm"
          @click="openBackendManager()"
        >
          {{ $t('manageBackends') }}
        </button>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { probeBackend } from '@/assembly/probe'
import { startBackendSession } from '@/assembly/session'
import { backendProbe } from '@/assembly/version'
import { ROUTE_NAME } from '@/constant'
import { describeConnectionError } from '@/helper/connectivity'
import { showNotification } from '@/helper/notification'
import { getBackendProbeUrl, getLabelFromBackend } from '@/helper/utils'
import {
  activeBackend,
  activeUuid,
  backendList,
  backendManagerView,
  openBackendManager,
  setActiveBackend,
} from '@/store/setup'
import { ChevronRightIcon, ExclamationTriangleIcon, ServerIcon } from '@heroicons/vue/24/outline'
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

const AUTO_SWITCH_TIMEOUT = 8000

const isSwitching = ref(false)
const detail = ref('')

const probe = computed(() =>
  backendProbe.value?.uuid === activeUuid.value ? backendProbe.value : undefined,
)
const isRetrying = computed(() => probe.value?.status === 'probing')

const failed = ref(false)

watch(
  () => probe.value?.status,
  (status) => {
    if (status === 'failed') failed.value = true
    if (status === 'connected' || status === undefined) failed.value = false
  },
  { immediate: true },
)

const route = useRoute()
const visible = computed(
  () => failed.value && backendManagerView.value === null && route.name !== ROUTE_NAME.setup,
)

const label = computed(() => (activeBackend.value ? getLabelFromBackend(activeBackend.value) : ''))
const url = computed(() => (activeBackend.value ? getBackendProbeUrl(activeBackend.value) : ''))

const otherBackends = computed(() =>
  backendList.value.filter((backend) => backend.uuid !== activeUuid.value),
)

watch(
  probe,
  async (value) => {
    if (!value || value.status === 'connected') {
      detail.value = ''
      return
    }
    if (value.status !== 'failed') return

    const target = value.uuid
    const described = await describeConnectionError(value.message, url.value)

    if (activeUuid.value === target) {
      detail.value = described
    }
  },
  { immediate: true },
)

const retry = () => startBackendSession()

const editActiveBackend = () => {
  if (!activeUuid.value) return
  openBackendManager({ mode: 'edit', uuid: activeUuid.value })
}

const switchToReachableBackend = async () => {
  if (isSwitching.value) return
  isSwitching.value = true

  try {
    const reachable = await Promise.any(
      otherBackends.value.map(async (backend) => {
        const result = await probeBackend(backend, AUTO_SWITCH_TIMEOUT)
        if (!result.ok) throw new Error(backend.uuid)
        return backend
      }),
    ).catch(() => null)

    if (reachable) {
      setActiveBackend(reachable.uuid)
    } else {
      showNotification({ content: 'noReachableBackend', type: 'alert-error' })
    }
  } finally {
    isSwitching.value = false
  }
}
</script>

<style scoped>
.connection-error-enter-active,
.connection-error-leave-active {
  transition: opacity 0.2s ease;
}

.connection-error-enter-from,
.connection-error-leave-to {
  opacity: 0;
}
</style>
