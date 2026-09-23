<template>
  <div
    class="sidebar-chart-group base-container flex min-h-0 flex-2 flex-col"
    :data-rows="numberOfChartsInSidebar"
  >
    <div class="scrollbar-hidden flex min-h-0 flex-1 flex-col overflow-y-auto">
      <SpeedCharts class="sidebar-chart-row h-(--sidebar-chart-row) shrink-0" />
      <MemoryCharts class="sidebar-chart-row h-(--sidebar-chart-row) shrink-0" />
      <ConnectionsCharts class="sidebar-chart-row h-(--sidebar-chart-row) shrink-0" />
    </div>
  </div>
</template>

<script setup lang="ts">
import ConnectionsCharts from '@/components/overview/ConnectionsCharts.vue'
import MemoryCharts from '@/components/overview/MemoryCharts.vue'
import SpeedCharts from '@/components/overview/SpeedCharts.vue'
import { numberOfChartsInSidebar } from '@/store/settings'
</script>

<style scoped>
.sidebar-chart-group {
  --sidebar-chart-row: 7.5rem;
}

.sidebar-chart-group[data-rows='1'] {
  max-height: var(--sidebar-chart-row);
}
.sidebar-chart-group[data-rows='2'] {
  max-height: calc(var(--sidebar-chart-row) * 2);
}
.sidebar-chart-group[data-rows='3'] {
  max-height: calc(var(--sidebar-chart-row) * 3);
}

.sidebar-chart-row + .sidebar-chart-row {
  border-top: 1px solid var(--color-base-border);
}
</style>
