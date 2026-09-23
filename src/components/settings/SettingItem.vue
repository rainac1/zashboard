<template>
  <div
    v-if="shouldRender"
    class="setting-item"
    :id="`setting-${anchorKey || settingKey}`"
    :data-setting-key="settingKey"
    tabindex="-1"
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
import { useIsSettingVisible } from '@/composables/use-setting-visibility'
import { registerRenderedSetting } from '@/helper/settings'
import { computed, onUnmounted, toRef, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    settingKey: string
    when?: boolean
    anchorKey?: string
  }>(),
  { when: true },
)

const visible = useIsSettingVisible(toRef(props, 'settingKey'))
const shouldRender = computed(() => props.when && visible.value)

let unregister: (() => void) | undefined
watch(
  shouldRender,
  (rendered) => {
    unregister?.()
    unregister = rendered ? registerRenderedSetting(props.anchorKey || props.settingKey) : undefined
  },
  { immediate: true },
)
onUnmounted(() => unregister?.())
</script>
