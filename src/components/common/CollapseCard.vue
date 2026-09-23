<template>
  <div
    ref="placeholderRef"
    class="collapse-motion-placeholder"
  >
    <div
      ref="cardRef"
      class="group collapse-motion collapse"
      :class="expanded && 'collapse-motion-open'"
    >
      <div
        ref="headerRef"
        class="collapse-motion-header relative cursor-pointer px-4 pt-4"
        @click="showCollapse = !showCollapse"
      >
        <slot name="title" />
      </div>
      <div
        ref="bodyRef"
        class="collapse-motion-body"
        :class="transitioning && 'collapse-motion-body-transitioning'"
      >
        <div
          v-if="showPreview"
          ref="previewRef"
          class="collapse-motion-preview px-4 pb-4"
        >
          <slot name="preview" />
        </div>
        <div
          v-if="showContent"
          ref="contentRef"
          class="collapse-motion-content mt-2 max-h-108 overflow-y-auto p-4 pt-0"
          :class="PROXIES_PARENT_CLASS"
        >
          <slot name="content" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useCollapseMotion } from '@/composables/use-collapse-motion'
import { PROXIES_PARENT_CLASS } from '@/helper/utils'
import { collapseGroupMap } from '@/store/settings'
import { computed } from 'vue'

const props = defineProps<{
  name: string
  forceOpen?: boolean
}>()

const showCollapse = computed({
  get: () => Boolean(props.forceOpen || collapseGroupMap.value[props.name]),
  set(value) {
    if (!props.forceOpen) collapseGroupMap.value[props.name] = value
  },
})

const {
  placeholderRef,
  cardRef,
  headerRef,
  bodyRef,
  previewRef,
  contentRef,
  expanded,
  transitioning,
  showContent,
  showPreview,
} = useCollapseMotion(showCollapse)
</script>

<style scoped>
.collapse-motion {
  --collapse-motion-duration: 0.26s;
  --collapse-motion-ease: cubic-bezier(0.34, 0.1, 0.2, 1);
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: max-content max-content;
}

.collapse-motion > .collapse-motion-header {
  grid-area: 1 / 1;
}

.collapse-motion > .collapse-motion-body {
  grid-area: 2 / 1;
  display: grid;
  position: relative;
  min-height: 0;
  overflow: hidden;
}

.collapse-motion-preview,
.collapse-motion-content {
  grid-area: 1 / 1;
  align-self: start;
  opacity: 1;
}

.collapse-motion-body-transitioning > :is(.collapse-motion-preview, .collapse-motion-content) {
  position: absolute;
  inset: 0 0 auto;
}

.collapse-motion-open .collapse-motion-preview,
.collapse-motion:not(.collapse-motion-open) .collapse-motion-content {
  pointer-events: none;
  opacity: 0;
}

.collapse-motion-placeholder {
  position: relative;
}

.collapse-motion-floating > .collapse-motion {
  position: absolute;
  inset-inline: 0;
  top: 0;
  z-index: 1;
}

@media (prefers-reduced-motion: reduce) {
  .collapse-motion {
    --collapse-motion-duration: 0s;
  }
}
</style>
