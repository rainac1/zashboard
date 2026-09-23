import { ref, type InjectionKey } from 'vue'

export type ScrollProxyNodeIntoView = (name: string) => void

export const scrollNodeIntoViewKey: InjectionKey<ScrollProxyNodeIntoView> =
  Symbol('scrollNodeIntoView')

export const highlightedProxyNode = ref('')

let highlightTimer: ReturnType<typeof setTimeout> | undefined

export const highlightProxyNode = (name: string) => {
  highlightedProxyNode.value = name
  clearTimeout(highlightTimer)
  highlightTimer = setTimeout(() => {
    if (highlightedProxyNode.value === name) {
      highlightedProxyNode.value = ''
    }
  }, 1500)
}
