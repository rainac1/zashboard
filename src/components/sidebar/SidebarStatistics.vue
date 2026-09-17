<!--
  展开态的统计：一块浅色底上摆 2×3 六个图块，标签小字在上、数值在下，
  累计量各占一格。不画边框也不画分割线，分组全靠底色和留白。
-->
<template>
  <div class="bg-base-150 grid w-full grid-cols-2 gap-x-3 gap-y-4 rounded-[10px] px-3.5 py-4">
    <div
      v-for="item in sidebarStatGrid"
      :key="item.key"
      class="flex min-w-0 flex-col gap-2"
    >
      <span
        class="text-base-content/60 min-w-0 truncate text-[11px] leading-none"
        @mouseenter="checkTruncation"
        >{{ $t(item.label) }}</span
      >
      <span class="text-base-content/85 truncate text-sm leading-none tabular-nums">
        {{ item.value }}{{ item.unit ? ` ${item.unit}` : '' }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { sidebarStatGrid } from '@/composables/sidebarStats'
import { checkTruncation } from '@/helper/tooltip'
</script>
