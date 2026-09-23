import { computed, nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { provideCollapseTransition } from './use-collapse-transition'
import { useVirtualRowShift } from './use-virtual-row-shift'

type Phase = 'idle' | 'preparing' | 'animating' | 'settling'

const FLOATING_CLASS = 'collapse-motion-floating'

const waitFrames = async (count: number, signal: AbortSignal) => {
  for (let i = 0; i < count; i++) {
    signal.throwIfAborted()
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        cancelAnimationFrame(frame)
        reject(signal.reason)
      }
      const frame = requestAnimationFrame(() => {
        signal.removeEventListener('abort', abort)
        resolve()
      })

      signal.addEventListener('abort', abort, { once: true })
    })
  }
  signal.throwIfAborted()
}

export const useCollapseMotion = (open: Ref<boolean>) => {
  const placeholderRef = ref<HTMLDivElement>()
  const cardRef = ref<HTMLDivElement>()
  const headerRef = ref<HTMLDivElement>()
  const bodyRef = ref<HTMLDivElement>()
  const previewRef = ref<HTMLDivElement>()
  const contentRef = ref<HTMLDivElement>()

  const phase = ref<Phase>('idle')
  const expanded = ref(open.value)
  const transitioning = computed(() => phase.value === 'preparing' || phase.value === 'animating')
  const showContent = computed(() => transitioning.value || expanded.value)
  const showPreview = computed(() => transitioning.value || !expanded.value)

  provideCollapseTransition(computed(() => phase.value !== 'idle'))

  const rowShift = useVirtualRowShift()
  let shiftRow: HTMLElement | null = null
  let shiftBaseHeight = 0
  let operation: AbortController | undefined

  const releaseShift = () => {
    placeholderRef.value?.classList.remove(FLOATING_CLASS)
    if (placeholderRef.value) placeholderRef.value.style.height = ''
    shiftRow = null
  }

  watch(open, async (value) => {
    const body = bodyRef.value
    if (!body) return

    const fromHeight = getComputedStyle(body).height
    const fromPreview = previewRef.value ? getComputedStyle(previewRef.value).opacity : '0'
    const fromContent = contentRef.value ? getComputedStyle(contentRef.value).opacity : '0'
    const contentReady = phase.value === 'animating'

    if (previewRef.value) previewRef.value.style.opacity = fromPreview
    if (contentRef.value) contentRef.value.style.opacity = fromContent
    operation?.abort()
    operation = new AbortController()
    const { signal } = operation
    const animations: Animation[] = []
    const cancelAnimations = () => animations.forEach((animation) => animation.cancel())
    signal.addEventListener('abort', cancelAnimations, { once: true })

    try {
      phase.value = 'preparing'
      body.style.height = fromHeight
      await nextTick()
      if (!contentReady) await waitFrames(value ? 2 : 1, signal)
      signal.throwIfAborted()

      const content = contentRef.value
      const preview = previewRef.value
      const targetHeight = value
        ? (content?.offsetHeight ?? 0) +
          (content ? parseFloat(getComputedStyle(content).marginTop) : 0)
        : (preview?.offsetHeight ?? 0)
      const placeholder = placeholderRef.value
      const card = cardRef.value
      const header = headerRef.value
      const row = placeholder?.parentElement
      const headerHeight = header?.offsetHeight ?? 0
      const baseHeight = shiftRow ? shiftBaseHeight : (card?.offsetHeight ?? 0)
      const style = getComputedStyle(body)
      const duration = style.getPropertyValue('--collapse-motion-duration').trim()
      const timing = {
        duration: parseFloat(duration) * (duration.endsWith('ms') ? 1 : 1000),
        easing: style.getPropertyValue('--collapse-motion-ease').trim(),
        fill: 'both' as const,
      }

      if (rowShift && placeholder && row) {
        shiftBaseHeight = baseHeight
        rowShift.begin(row, headerHeight + targetHeight - baseHeight, timing, releaseShift)
        if (!shiftRow) {
          placeholder.style.height = `${baseHeight}px`
          placeholder.classList.add(FLOATING_CLASS)
          shiftRow = row
        }
      }

      phase.value = 'animating'
      expanded.value = value
      body.style.height = `${targetHeight}px`
      animations.push(body.animate({ height: [fromHeight, `${targetHeight}px`] }, timing))
      if (preview) {
        animations.push(preview.animate({ opacity: [fromPreview, value ? '0' : '1'] }, timing))
        preview.style.opacity = ''
      }
      if (content) {
        animations.push(content.animate({ opacity: [fromContent, value ? '1' : '0'] }, timing))
        content.style.opacity = ''
      }
      await Promise.all(animations.map((animation) => animation.finished))
      signal.throwIfAborted()

      phase.value = 'settling'
      body.style.height = ''
      await nextTick()
      signal.throwIfAborted()
      cancelAnimations()
      if (rowShift && shiftRow) await rowShift.end(shiftRow)

      await waitFrames(2, signal)
      phase.value = 'idle'
    } catch (error) {
      if (!signal.aborted) throw error
    } finally {
      signal.removeEventListener('abort', cancelAnimations)
      cancelAnimations()
    }
  })

  onBeforeUnmount(() => {
    operation?.abort()
    if (rowShift && shiftRow) rowShift.cancel(shiftRow)
    else releaseShift()
  })

  return {
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
  }
}
