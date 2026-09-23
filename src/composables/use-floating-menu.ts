import { nextTick, onBeforeUnmount, ref, watch, type CSSProperties, type Ref } from 'vue'

type FloatingMenuOptions = {
  gap?: number
  minimumWidth?: number
  minimumVisibleHeight?: number
  maximumHeight?: number
  viewportPadding?: number
}

type FloatingMenuReturn = {
  close: () => void
  panelStyle: Ref<CSSProperties>
  remeasure: () => void
  updatePosition: () => void
}

export const useFloatingMenu = <TAnchor extends HTMLElement, TPanel extends HTMLElement>(
  anchorRef: Ref<TAnchor | undefined>,
  panelRef: Ref<TPanel | undefined>,
  isOpen: Ref<boolean>,
  options: FloatingMenuOptions = {},
): FloatingMenuReturn => {
  const {
    gap = 4,
    minimumWidth = 96,
    minimumVisibleHeight = 80,
    maximumHeight = Number.POSITIVE_INFINITY,
    viewportPadding = 8,
  } = options
  const panelStyle = ref<CSSProperties>({})
  let listening = false

  const updatePosition = () => {
    const anchor = anchorRef.value
    if (!anchor) return

    const rect = anchor.getBoundingClientRect()
    const maxWidth = Math.max(window.innerWidth - viewportPadding * 2, minimumWidth)
    const minWidth = Math.min(Math.max(rect.width, minimumWidth), maxWidth)
    const measuredWidth = panelRef.value?.getBoundingClientRect().width
    const width = Math.min(Math.max(measuredWidth ?? minWidth, minWidth), maxWidth)
    const left = Math.min(
      Math.max(rect.left, viewportPadding),
      window.innerWidth - width - viewportPadding,
    )
    const spaceBelow = window.innerHeight - rect.bottom - gap - viewportPadding
    const spaceAbove = rect.top - gap - viewportPadding
    const dropUp = spaceBelow < 160 && spaceAbove > spaceBelow
    const availableHeight = dropUp ? spaceAbove : spaceBelow
    const maxHeight = Math.min(Math.max(availableHeight, minimumVisibleHeight), maximumHeight)

    panelStyle.value = {
      left: `${left}px`,
      width: measuredWidth ? `${width}px` : 'max-content',
      minWidth: `${minWidth}px`,
      maxWidth: `${maxWidth}px`,
      maxHeight: `${maxHeight}px`,
      ...(dropUp
        ? { bottom: `${window.innerHeight - rect.top + gap}px`, top: undefined }
        : { top: `${rect.bottom + gap}px`, bottom: undefined }),
    }
  }

  const remeasure = () => {
    if (!isOpen.value) return
    panelStyle.value = { ...panelStyle.value, width: 'max-content' }
    nextTick(updatePosition)
  }

  const close = () => {
    isOpen.value = false
  }

  const handleOutsidePointerDown = (event: PointerEvent) => {
    const target = event.target as Node | null
    if (!target) return
    if (anchorRef.value?.contains(target) || panelRef.value?.contains(target)) return
    close()
  }

  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close()
  }

  const setListeners = (enabled: boolean) => {
    if (enabled === listening) return
    listening = enabled
    const method = enabled ? window.addEventListener : window.removeEventListener

    method('scroll', updatePosition, true)
    method('resize', updatePosition)
    method('pointerdown', handleOutsidePointerDown as EventListener, true)
    method('keydown', handleKeydown as EventListener)
  }

  watch(
    isOpen,
    (open) => {
      setListeners(open)
      if (!open) return
      updatePosition()
      nextTick(updatePosition)
    },
    { flush: 'sync' },
  )

  onBeforeUnmount(() => setListeners(false))

  return {
    close,
    panelStyle,
    remeasure,
    updatePosition,
  }
}
