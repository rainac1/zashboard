<template>
  <template
    v-for="(part, index) in parts"
    :key="index"
  >
    <mark
      v-if="part.matched"
      class="rounded-xs bg-yellow-300 text-black"
    >
      {{ part.text }}
    </mark>
    <template v-else>{{ part.text }}</template>
  </template>
</template>

<script setup lang="ts">
import { getSearchTextParts } from '@/helper/search'
import { computed } from 'vue'

const props = defineProps<{
  text: string
  filter: string
}>()

const parts = computed(() => getSearchTextParts(props.text, props.filter))
</script>
