<template>
  <span class="flex flex-none items-center gap-1.5">
    <span
      v-if="status === 'checking'"
      class="loading loading-spinner loading-xs opacity-50"
    ></span>
    <span
      v-else
      class="h-2 w-2 rounded-full"
      :class="dotClass"
    ></span>
    <span
      v-if="showLatency && status === 'online' && latency"
      class="text-base-content/50 text-xs tabular-nums"
    >
      {{ latency }} ms
    </span>
  </span>
</template>

<script setup lang="ts">
import type { ReachabilityStatus } from '@/composables/use-backend-reachability'
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    status: ReachabilityStatus
    latency?: number
    showLatency?: boolean
  }>(),
  {
    latency: 0,
    showLatency: true,
  },
)

const dotClass = computed(() => {
  switch (props.status) {
    case 'online':
      return 'bg-backend-online'
    case 'offline':
      return 'bg-error'
    default:
      return 'bg-base-content/25'
  }
})
</script>
