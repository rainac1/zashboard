import { ref } from 'vue'

export const proxyGroupChainTarget = ref('')
export const proxyGroupChainModalOpen = ref(false)

export const openProxyGroupChain = (groupName: string) => {
  proxyGroupChainTarget.value = groupName
  proxyGroupChainModalOpen.value = true
}

export const closeProxyGroupChain = () => {
  proxyGroupChainModalOpen.value = false
  proxyGroupChainTarget.value = ''
}
