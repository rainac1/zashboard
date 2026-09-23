<template>
  <div
    v-if="isDom"
    :class="['inline-block', fill || 'fill-primary']"
    :style="style"
    v-html="pureDom"
  />
  <img
    v-else
    class="inline-block"
    :style="style"
    :src="icon"
  />
</template>

<script lang="ts">
import DOMPurify from 'dompurify'

const DOM_STARTS_WITH = 'data:image/svg+xml,'

const sanitizedCache = new Map<string, string>()

const sanitizeIcon = (icon: string) => {
  const raw = icon.slice(DOM_STARTS_WITH.length)
  const cached = sanitizedCache.get(raw)

  if (cached !== undefined) return cached

  const pure = DOMPurify.sanitize(raw)

  sanitizedCache.set(raw, pure)

  return pure
}
</script>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    icon: string
    fill?: string
    size?: number
    margin?: number
  }>(),
  {
    size: 16,
    margin: 4,
  },
)

const style = computed(() => {
  return {
    width: `${props.size}px`,
    height: `${props.size}px`,
    marginRight: `${props.margin}px`,
  }
})
const isDom = computed(() => {
  return props.icon.startsWith(DOM_STARTS_WITH)
})

const pureDom = computed(() => {
  if (!isDom.value) return
  return sanitizeIcon(props.icon)
})
</script>
