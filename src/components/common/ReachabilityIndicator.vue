<template>
  <div
    v-if="status !== 'idle'"
    class="flex items-start gap-2 text-xs leading-5"
    :class="toneClass"
  >
    <span
      v-if="status === 'checking'"
      class="loading loading-spinner loading-xs mt-0.5 flex-none"
    ></span>
    <CheckCircleIcon
      v-else-if="status === 'online'"
      class="mt-px h-4 w-4 flex-none"
    />
    <ExclamationTriangleIcon
      v-else
      class="mt-px h-4 w-4 flex-none"
    />

    <span class="min-w-0 flex-1">
      <template v-if="status === 'checking'">{{ $t('checking') }}</template>
      <template v-else-if="status === 'online'">
        {{ $t('backendReachable') }}
        <span class="text-base-content/50">· {{ latency }} ms</span>
      </template>
      <template v-else>{{ message || $t('backendUnreachable') }}</template>
    </span>

    <button
      v-if="status === 'offline'"
      class="btn btn-ghost btn-xs flex-none"
      @click="$emit('retry')"
    >
      {{ $t('retry') }}
    </button>
  </div>
</template>

<script setup lang="ts">
import type { ReachabilityStatus } from '@/composables/use-backend-reachability'
import { CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/vue/24/outline'
import { computed } from 'vue'

const props = defineProps<{
  status: ReachabilityStatus
  latency: number
  message: string
}>()

defineEmits<{
  (e: 'retry'): void
}>()

const toneClass = computed(() => {
  switch (props.status) {
    case 'online':
      return 'text-success'
    case 'offline':
      return 'text-error'
    default:
      return 'text-base-content/60'
  }
})
</script>
