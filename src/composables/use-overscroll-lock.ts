import { disablePullToRefresh } from '@/store/settings'
import { watchEffect } from 'vue'

const AXIS_LOCK_DISTANCE = 10

const findScrollable = (target: EventTarget | null, axis: 'x' | 'y') => {
  let el = target as HTMLElement | null
  while (el && el !== document.body && el !== document.documentElement) {
    const style = getComputedStyle(el)
    const overflow = axis === 'y' ? style.overflowY : style.overflowX
    const overflows =
      axis === 'y' ? el.scrollHeight > el.clientHeight : el.scrollWidth > el.clientWidth
    if ((overflow === 'auto' || overflow === 'scroll') && overflows) {
      return el
    }
    el = el.parentElement
  }
  return null
}

export const useOverscrollLock = () => {
  let startX = 0
  let startY = 0
  let scrollableY: HTMLElement | null = null
  let lockedAxis: 'x' | 'y' | null = null
  let ignored = false

  const onTouchStart = (event: TouchEvent) => {
    ignored = (event.target as Element | null)?.closest?.('input[type="range"], .tab-bar') != null
    if (ignored) return
    startX = event.touches[0].clientX
    startY = event.touches[0].clientY
    scrollableY = findScrollable(event.target, 'y')
    lockedAxis = findScrollable(event.target, 'x') ? null : 'y'
  }

  const onTouchMove = (event: TouchEvent) => {
    if (ignored || event.touches.length > 1) return

    const deltaX = event.touches[0].clientX - startX
    const deltaY = event.touches[0].clientY - startY

    if (!lockedAxis) {
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < AXIS_LOCK_DISTANCE) return
      lockedAxis = Math.abs(deltaX) > Math.abs(deltaY) ? 'x' : 'y'
    }
    if (lockedAxis === 'x') return

    if (!scrollableY) {
      event.preventDefault()
      return
    }

    const atTop = scrollableY.scrollTop <= 0
    const atBottom =
      scrollableY.scrollTop + scrollableY.clientHeight >= scrollableY.scrollHeight - 1
    if ((atTop && deltaY > 0) || (atBottom && deltaY < 0)) {
      event.preventDefault()
    }
  }

  watchEffect((onCleanup) => {
    if (!disablePullToRefresh.value) return

    const body = document.body
    body.style.overscrollBehavior = 'none'
    body.style.overflow = 'hidden'
    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: false })

    onCleanup(() => {
      body.style.overscrollBehavior = ''
      body.style.overflow = ''
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
    })
  })
}
