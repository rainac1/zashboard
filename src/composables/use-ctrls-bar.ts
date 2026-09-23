import { useCurrentElement, useElementSize } from '@vueuse/core'
import { computed, toValue, type MaybeRefOrGetter } from 'vue'

export function useCtrlsBar(width: MaybeRefOrGetter<number> = 720) {
  const element = useCurrentElement()
  const { width: ctrlsBarWidth } = useElementSize(element)
  const isLargeCtrlsBar = computed(() => {
    return ctrlsBarWidth.value > toValue(width)
  })

  return {
    isLargeCtrlsBar,
  }
}
