import { disablePullToRefresh } from '@/store/settings'
import { watchEffect } from 'vue'

/**
 * 关掉 iOS 的整页橡皮筋（含下拉刷新）。
 *
 * iOS 上纵向拖动只要没地方可滚，就会去拖整个 layout viewport：要么手指落在不可滚动
 * 的区域，要么落在已经顶到头/底的滚动容器里、剩余的滚动量链式冒泡到 document。页面
 * 整体位移时 fixed 的 dock、顶栏都会跟着飞。overscroll-behavior 在 iOS 上管不住这个，
 * 只能自己接管：找到最近的纵向滚动祖先，只在它还能往这个方向滚时放行，否则 preventDefault。
 *
 * 轴向必须在 touchstart 时一次定死、整串手势不再变。iOS 只看第一个 touchmove 决定这串
 * 手势归谁，错过了后面再 preventDefault 也收不回来；而累计位移是会骗人的——先横滑一小段
 * 再上下拖，deltaX 会一直压过 deltaY，整串 touchmove 全被当成横滑放行，页面就飞了。
 */
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

  const onTouchStart = (event: TouchEvent) => {
    startX = event.touches[0].clientX
    startY = event.touches[0].clientY
    scrollableY = findScrollable(event.target, 'y')
    // 祖先里没有横向滚动容器（dock、卡片空白处）就直接锁死纵轴，没有任何理由把这串
    // 手势让出去；有的话才留一个方向锁窗口，免得吃掉表格、标签条的横滑。
    lockedAxis = findScrollable(event.target, 'x') ? null : 'y'
  }

  const onTouchMove = (event: TouchEvent) => {
    if (event.touches.length > 1) return

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
    // deltaY > 0 是往下拖，露出上面的内容。
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
