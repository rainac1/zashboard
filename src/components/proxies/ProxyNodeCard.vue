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
import { PROXY_CARD_SIZE, PROXY_SORT_TYPE } from '@/constant'
import { checkTruncation } from '@/helper/tooltip'
import {
  highlightProxyNode,
  highlightedProxyNode,
  scrollNodeIntoViewKey,
} from '@/composables/proxiesScroll'
import { proxyLatencyTest } from '@/assembly/proxies'
import { getIPv6ByName, getTestUrl, proxyMap } from '@/assembly/proxies'
import { IPv6test, proxyCardSize, proxySortType, truncateProxyName } from '@/store/settings'
import { smartWeightsMap } from '@/store/smart'
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

/*
 * 这几段类名都是本组件自己写死的,唯一会打架的是底色,分支写掉就行 —— 不必再过一遍
 * tailwind-merge。一次展开要挂几十张卡片,省的是几十次类名解析。
 */
const cardClass = computed(() => [
  'relative flex cursor-pointer flex-col items-start rounded-md hover:shadow-sm',
  props.active ? 'bg-primary/95 sm:hover:bg-primary' : 'bg-base-200 sm:hover:bg-base-300/50',
  isSmallCard.value ? 'gap-1 p-1' : 'gap-2 p-2',
  latencyTipAnimationClass.value,
])
const handlerLatencyTest = async () => {
  if (isLatencyTesting.value) return

  isLatencyTesting.value = true
  try {
    await proxyLatencyTest(props.name, getTestUrl(props.groupName), undefined, props.groupName)
    isLatencyTesting.value = false
  } catch {
    isLatencyTesting.value = false
  }

  if ([PROXY_SORT_TYPE.LATENCY_ASC, PROXY_SORT_TYPE.LATENCY_DESC].includes(proxySortType.value)) {
    // 高亮先标上:重排可能把这张卡挪出虚拟列表的渲染窗口,那时组件已经没了
    highlightProxyNode(props.name)
    // 等排序后的 DOM 落地再量位置,否则拿到的还是重排前的旧坐标。
    await nextTick()
    // 虚拟列表能定位尚未挂载的节点,位置提示交给上面的高亮。
    scrollNodeIntoView?.(props.name)
  }
}
</script>

<style scoped>
.tooltip:before {
  z-index: 20;
}
</style>
