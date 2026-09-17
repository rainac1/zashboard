<template>
  <div class="flex flex-col items-center gap-2 px-1.5 pt-1 pb-2">
    <div class="sidebar-stats-card">
      <div
        v-for="item in sidebarStatItems"
        :key="item.key"
        class="sidebar-stat-cell"
        @mouseenter="(e) => showTip(e, statTipOf(item, t), { placement: 'right' })"
      >
        <component
          :is="item.icon"
          class="sidebar-stat-icon"
          :class="item.iconClass"
          aria-hidden="true"
        />
        <span class="sidebar-stat-value">{{ item.value }}</span>
        <span
          v-if="item.unit"
          class="sidebar-stat-unit"
          >{{ item.unit }}</span
        >
        <span
          v-if="item.total"
          class="sidebar-stat-total"
          >{{ item.total }}</span
        >
      </div>
    </div>

    <div class="flex flex-col items-center">
      <slot></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { sidebarStatItems, statTipOf } from '@/composables/sidebarStats'
import { useTooltip } from '@/helper/tooltip'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { showTip } = useTooltip()
</script>

<style scoped>
/* 折叠态的统计：macOS 的「内嵌分组」——一块带发丝边的圆角面板，行与行之间通铺一条
   分隔线，数值和单位分两行竖排，60px 宽也不会挤。指标名靠 hover 的 tooltip 补。 */

.sidebar-stats-card {
  display: flex;
  width: 100%;
  flex-direction: column;
  overflow: hidden;
  border-radius: 10px;
  background-color: var(--color-base-100);
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--color-base-content) 8%, transparent),
    0 1px 2px color-mix(in srgb, var(--color-base-content) 5%, transparent);
}

.sidebar-stat-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem 0.25rem;
  transition: background-color 150ms;
}

.sidebar-stat-cell + .sidebar-stat-cell {
  border-top: 1px solid var(--color-base-border);
}

@media (hover: hover) {
  .sidebar-stat-cell:hover {
    background-color: color-mix(in srgb, var(--color-base-content) 4%, transparent);
  }
}

.sidebar-stat-icon {
  width: 0.875rem;
  height: 0.875rem;
  flex-shrink: 0;
  color: color-mix(in srgb, var(--color-base-content) 70%, transparent);
  stroke-width: 1.75;
}

/* 上下箭头是竖长图形，和 ⇄ / 芯片同尺寸时视觉上会更大，单独收一档 */
.sidebar-stat-icon-arrow {
  width: 0.75rem;
  height: 0.75rem;
  stroke-width: 2;
}

.sidebar-stat-value {
  font-size: 13px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  color: color-mix(in srgb, var(--color-base-content) 88%, transparent);
}

.sidebar-stat-unit {
  font-size: 10px;
  line-height: 1;
  letter-spacing: 0.02em;
  white-space: nowrap;
  color: color-mix(in srgb, var(--color-base-content) 88%, transparent);
}

.sidebar-stat-total {
  margin-top: 0.125rem;
  font-size: 10px;
  line-height: 1;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  color: color-mix(in srgb, var(--color-base-content) 30%, transparent);
}
</style>
