<template>
  <div
    ref="previewRef"
    class="flex flex-wrap"
    :class="[showDots ? 'gap-1 pt-3' : 'gap-2 pt-3.5 pb-0.5']"
  >
    <template v-if="showDots">
      <div
        v-for="node in nodesLatency"
        :key="node.name"
        class="flex size-3 items-center justify-center rounded-sm transition hover:scale-110"
        :class="getBgColor(node.latency)"
        ref="dotsRef"
        @mouseenter="(e) => makeTippy(e, node)"
        @click.stop="$emit('nodeclick', node.name)"
      >
        <div
          class="size-[5px] rounded-[2px] bg-white"
          v-if="now === node.name"
        ></div>
      </div>
    </template>
    <div
      v-else
      class="flex flex-1 items-center justify-center overflow-hidden rounded-2xl *:h-2"
    >
      <div
        :class="getBgColor(lowLatency - 1)"
        :style="{
          width: getPreviewWidth(latencyCounts.good),
        }"
      />
      <div
        :class="getBgColor(mediumLatency - 1)"
        :style="{
          width: getPreviewWidth(latencyCounts.medium),
        }"
      />
      <div
        :class="getBgColor(mediumLatency + 1)"
        :style="{
          width: getPreviewWidth(latencyCounts.bad),
        }"
      />
      <div
        :class="getBgColor(NOT_CONNECTED)"
        :style="{
          width: getPreviewWidth(latencyCounts.notConnected),
        }"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { NOT_CONNECTED, PROXY_PREVIEW_TYPE } from '@/constant'
import { getColorForLatency } from '@/helper'
import { useTooltip } from '@/composables/use-tooltip'
import { latencyMapOf } from '@/assembly/proxies'
import { lowLatency, mediumLatency, proxyPreviewType } from '@/store/settings'
import { useElementSize } from '@vueuse/core'
import { computed, ref } from 'vue'

const props = defineProps<{
  nodes: string[]
  now?: string
  groupName?: string
}>()

const { showTip } = useTooltip()
const previewRef = ref<HTMLElement | null>(null)
const { width } = useElementSize(previewRef)

const widthEnough = computed(() => {
  return width.value > 16 * props.nodes.length
})

const makeTippy = (e: Event, node: { name: string; latency: number }) => {
  const tag = document.createElement('div')
  const name = document.createElement('div')

  name.textContent = node.name
  tag.append(name)

  if (node.latency !== NOT_CONNECTED) {
    const latency = document.createElement('div')

    latency.textContent = `${node.latency}ms`
    latency.classList.add(getColorForLatency(node.latency))
    tag.append(latency)
  }

  tag.classList.add('flex', 'items-center', 'gap-2')
  showTip(e, tag)
}

const getPreviewWidth = (count: number) => {
  if (!props.nodes.length) {
    return '0%'
  }

  return `${(count * 100) / props.nodes.length}%`
}

const showDots = computed(() => {
  return (
    proxyPreviewType.value === PROXY_PREVIEW_TYPE.DOTS ||
    (proxyPreviewType.value === PROXY_PREVIEW_TYPE.AUTO && widthEnough.value)
  )
})

const latencyMap = latencyMapOf(() => props.groupName)
const latencyList = computed(() =>
  props.nodes.map((name) => latencyMap.value.get(name) ?? NOT_CONNECTED),
)

const nodesLatency = computed(() => {
  if (!showDots.value) {
    return []
  }

  return props.nodes.map((name, index) => ({ name, latency: latencyList.value[index] }))
})
const getBgColor = (latency: number) => {
  if (latency === NOT_CONNECTED) {
    return 'bg-base-content/60'
  } else if (latency < lowLatency.value) {
    return 'bg-low-latency'
  } else if (latency < mediumLatency.value) {
    return 'bg-medium-latency'
  } else {
    return 'bg-high-latency'
  }
}

const latencyCounts = computed(() => {
  const counts = { good: 0, medium: 0, bad: 0, notConnected: 0 }

  for (const latency of latencyList.value) {
    if (latency === NOT_CONNECTED) {
      counts.notConnected++
    } else if (latency < lowLatency.value) {
      counts.good++
    } else if (latency < mediumLatency.value) {
      counts.medium++
    } else {
      counts.bad++
    }
  }

  return counts
})
</script>

<style scoped>
.tooltip:before {
  left: 0;
  transform: translateX(-10px);
}
</style>
