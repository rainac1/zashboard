<template>
  <div :class="wrapperClass">
    <BackendSwitch
      v-if="vertical"
      compact
    />
    <button
      class="btn btn-circle btn-sm"
      @click="isSidebarCollapsed = !isSidebarCollapsed"
    >
      <component
        :is="isSidebarCollapsed ? ArrowRightCircleIcon : ArrowLeftCircleIcon"
        class="h-5 w-5"
      />
    </button>
  </div>
</template>

<script setup lang="ts">
import BackendSwitch from '@/components/settings/backend/BackendSwitch.vue'
import { isSidebarCollapsed } from '@/store/settings'
import { ArrowLeftCircleIcon, ArrowRightCircleIcon } from '@heroicons/vue/24/outline'
import { computed } from 'vue'

const props = defineProps<{
  vertical?: boolean
}>()

const wrapperClass = computed(() => {
  return props.vertical
    ? 'flex flex-col items-center justify-center gap-2'
    : 'flex flex-row-reverse items-center justify-center gap-2'
})
</script>
