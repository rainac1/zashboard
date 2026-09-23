<template>
  <div
    v-if="proxyGroup"
    class="flex flex-col gap-3 p-4"
    :data-group-name="proxyGroup.name"
    @contextmenu.prevent.stop="handlerLatencyTest"
  >
    <div>
      <ProxyGroupHeaderForMobile
        v-if="isMiddleScreen"
        :name="name"
        :proxies-count="proxiesCount"
        :is-latency-testing="isLatencyTesting"
        :display-content="true"
        @latency-test="handlerLatencyTest"
      />
      <ProxyGroupHeader
        v-else
        :name="name"
        :proxies-count="proxiesCount"
        :is-latency-testing="isLatencyTesting"
        @latency-test="handlerLatencyTest"
      />
    </div>
    <Component
      :is="groupProxiesByProvider ? ProxiesByProvider : ProxiesContent"
      :name="name"
      :now="proxyGroup.now"
      :render-proxies="renderProxies"
    />
  </div>
</template>

<script setup lang="ts">
import { proxyGroupLatencyTest, proxyMap } from '@/assembly/proxies'
import { useRenderProxyList } from '@/composables/use-render-proxy-list'
import { isMiddleScreen } from '@/helper/utils'
import { groupProxiesByProvider } from '@/store/settings'
import { computed, ref } from 'vue'
import ProxiesByProvider from './ProxiesByProvider.vue'
import ProxiesContent from './ProxiesContent.vue'
import ProxyGroupHeader from './ProxyGroupHeader.vue'
import ProxyGroupHeaderForMobile from './ProxyGroupHeaderForMobile.vue'

const props = defineProps<{
  name: string
}>()

const proxyGroup = computed(() => proxyMap.value[props.name])
const allProxies = computed(() => proxyGroup.value?.all ?? [])
const { proxiesCount, renderProxies } = useRenderProxyList(allProxies, props.name)

const isLatencyTesting = ref(false)
const handlerLatencyTest = async () => {
  if (isLatencyTesting.value) return

  isLatencyTesting.value = true
  try {
    await proxyGroupLatencyTest(props.name)
    isLatencyTesting.value = false
  } catch {
    isLatencyTesting.value = false
  }
}
</script>
