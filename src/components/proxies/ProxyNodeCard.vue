<template>
  <div
    :class="cardClass"
    @contextmenu.stop.prevent="handlerLatencyTest"
  >
    <div
      class="w-full flex-1 text-sm"
      :class="truncateProxyName && 'truncate'"
      @mouseenter="checkTruncation"
    >
      <ProxyIcon
        v-if="node?.icon"
        class="-mt-[2px] shrink-0 align-middle"
        :icon="node.icon"
        :fill="active ? 'fill-primary-content' : 'fill-base-content'"
      /><span
        v-if="active"
        class="text-primary-content"
        >{{ node.name }}</span
      ><span
        v-else
        class="text-base-content"
        >{{ node.name }}</span
      >
    </div>

    <div class="flex h-4 w-full items-center justify-between">
      <span
        :class="`truncate text-xs tracking-tight ${active ? 'text-primary-content' : 'text-base-content/60'}`"
        @mouseenter="checkTruncation"
      >
        {{ typeDescription }}
      </span>
      <LatencyTag
        :class="[isSmallCard && 'h-4! w-8! rounded-md!', 'shrink-0']"
        :name="node.name"
        :loading="isLatencyTesting"
        :group-name="groupName"
        @click.stop="handlerLatencyTest"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { smartWeightsMap } from '@/assembly/proxies'
import { PROXY_CARD_SIZE, PROXY_SORT_TYPE } from '@/constant'
import { checkTruncation } from '@/helper/tooltip'
import {
  highlightProxyNode,
  highlightedProxyNode,
  scrollNodeIntoViewKey,
} from '@/helper/proxies-scroll'
import { proxyLatencyTest } from '@/assembly/proxies'
import { getIPv6ByName, getTestUrl, proxyMap } from '@/assembly/proxies'
import { IPv6test, proxyCardSize, proxySortType, truncateProxyName } from '@/store/settings'
import { computed, inject, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import LatencyTag from './LatencyTag.vue'
import ProxyIcon from './ProxyIcon.vue'

const { t } = useI18n()
const props = defineProps<{
  name: string
  active?: boolean
  groupName?: string
}>()

const node = computed(() => proxyMap.value[props.name])
const isLatencyTesting = ref(false)
const typeFormatter = (type: string) => {
  type = type.toLowerCase()
  type = type.replace('shadowsocks', 'ss')
  type = type.replace('hysteria', 'hy')
  type = type.replace('wireguard', 'wg')

  return type
}
const isSmallCard = computed(() => proxyCardSize.value === PROXY_CARD_SIZE.SMALL)
const typeDescription = computed(() => {
  const type = typeFormatter(node.value.type)
  const smartUsage = smartWeightsMap.value[props.groupName ?? '']?.[props.name]
  const smartDesc = smartUsage ? t(smartUsage) : ''
  const isV6 = IPv6test.value && getIPv6ByName(node.value.name) ? 'IPv6' : ''
  const isUDP = node.value.udp ? (node.value.xudp ? 'xudp' : 'udp') : ''

  return [type, isUDP, smartDesc, isV6].filter(Boolean).join(isSmallCard.value ? '/' : ' / ')
})

const scrollNodeIntoView = inject(scrollNodeIntoViewKey, null)
const latencyTipAnimationClass = computed(() =>
  highlightedProxyNode.value === props.name ? ['latency-highlight'] : [],
)

const cardClass = computed(() => [
  'relative flex cursor-pointer flex-col items-start rounded-md hover:shadow-sm',
  props.active
    ? 'proxy-active-card bg-primary/95 sm:hover:bg-primary'
    : 'bg-base-200 sm:hover:bg-base-300/50',
  isSmallCard.value ? 'gap-1 p-1' : 'gap-2 p-2',
  latencyTipAnimationClass.value,
])
const handlerLatencyTest = async () => {
  if (isLatencyTesting.value) return

  isLatencyTesting.value = true
  try {
    await proxyLatencyTest(props.name, getTestUrl(props.groupName))
    isLatencyTesting.value = false
  } catch {
    isLatencyTesting.value = false
  }

  if ([PROXY_SORT_TYPE.LATENCY_ASC, PROXY_SORT_TYPE.LATENCY_DESC].includes(proxySortType.value)) {
    highlightProxyNode(props.name)
    await nextTick()
    scrollNodeIntoView?.(props.name)
  }
}
</script>

<style scoped>
.tooltip:before {
  z-index: 20;
}

.latency-highlight::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background-color: var(--color-info);
  animation: latencyHighlightFade 1.5s ease-out forwards;
}

@keyframes latencyHighlightFade {
  0% {
    opacity: 0.2;
  }
  100% {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .latency-highlight::after {
    animation: none;
  }
}
</style>
