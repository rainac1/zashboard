<!--
  展开态的指标面板:一块分组卡片,每个指标占一行,行与行之间一条发丝线。
  能看几行由设置决定 —— 行高是固定的,卡片的高度上限正好是整数行,
  不会在某一行中间被切开,剩下的滚上来看。
-->
<template>
  <div
    class="sidebar-chart-group base-container flex-2"
    :data-rows="numberOfChartsInSidebar"
  >
    <div class="sidebar-chart-scroller scrollbar-hidden">
      <SpeedCharts class="sidebar-chart-row" />
      <MemoryCharts class="sidebar-chart-row" />
      <ConnectionsCharts class="sidebar-chart-row" />
    </div>
  </div>
</template>

<script setup lang="ts">
import ConnectionsCharts from '@/components/overview/ConnectionsCharts.vue'
import MemoryCharts from '@/components/overview/MemoryCharts.vue'
import SpeedCharts from '@/components/overview/SpeedCharts.vue'
import { numberOfChartsInSidebar } from '@/store/settings'
</script>
