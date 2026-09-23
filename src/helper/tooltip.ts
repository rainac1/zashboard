import { useTooltip } from '@/composables/use-tooltip'

const { showTip } = useTooltip()

export const checkTruncation = (e: Event) => {
  const target = e.target as HTMLElement
  const { scrollWidth, clientWidth } = target

  if (scrollWidth > clientWidth) {
    showTip(e, target.innerText, {
      delay: [700, 0],
      trigger: 'mouseenter',
      touch: ['hold', 500],
    })
  }
}
