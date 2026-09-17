import { dimmedOverlayCount } from '@/composables/dialog'
import { isPreferredDark } from '@/helper/utils'
import { onMounted, onUnmounted, watch, type Ref } from 'vue'

/**
 * 把 #app-content 的底色同步到 <meta name="theme-color">，并在全屏压暗层在场时
 * 一起压暗。
 *
 * iOS 的 PWA 会用 theme-color 去刷状态栏那条 chrome，它在 web view 之外，页面里
 * 任何 fixed 遮罩都盖不到，只能由 JS 补上同样强度的压暗（daisyUI 的 .modal 遮罩
 * 是 40% 纯黑）。压暗还必须逐帧补间跟着遮罩淡入淡出走：一次性切过去的话状态栏会
 * 比页面先暗 250ms，顶上那条读起来就是和页面割开的两块。
 */
const OVERLAY_DIM_ALPHA = 0.4
// 与遮罩的淡入淡出同时长（DialogWrapper、ProxyGroupForMobile 都是 250ms ease-out）。
const OVERLAY_DIM_DURATION = 250

let colorProbe: CanvasRenderingContext2D | null | undefined
let probedColor = ''
let probedRgb: { r: number; g: number; b: number } | null = null

// getComputedStyle 会原样吐回作者写的颜色空间（主题里就有 oklch()），这里借 canvas
// 的 CSS 颜色解析统一压成 sRGB 三通道，免得自己写一套各种语法的解析。补间期间每帧
// 都要用，所以缓存上一次的结果。
const toRgb = (color: string) => {
  if (color === probedColor) return probedRgb

  if (colorProbe === undefined) {
    colorProbe = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  }

  probedColor = color
  probedRgb = null
  if (!colorProbe) return null

  // 解析失败时 fillStyle 会保持原值，用哨兵色把这种情况认出来，别把状态栏刷错。
  colorProbe.fillStyle = '#010203'
  colorProbe.fillStyle = color
  if (colorProbe.fillStyle === '#010203') return null

  colorProbe.fillRect(0, 0, 1, 1)
  const [r, g, b] = colorProbe.getImageData(0, 0, 1, 1).data
  probedRgb = { r, g, b }
  return probedRgb
}

// CSS ease-out（cubic-bezier(0, 0, 0.58, 1)）的近似，两条曲线肉眼分不出来。
const easeOut = (t: number) => t * (2 - t)

export const useThemeColor = (app: Ref<HTMLElement | undefined>) => {
  let dimProgress = 0
  let dimFrame = 0

  const setThemeColor = () => {
    if (!app.value) return

    const themeColor = getComputedStyle(app.value).getPropertyValue('background-color').trim()
    const metaThemeColor = document.querySelector('meta[name="theme-color"]')
    if (!metaThemeColor) return

    const rgb = dimProgress > 0 ? toRgb(themeColor) : null
    if (!rgb) {
      metaThemeColor.setAttribute('content', themeColor)
      return
    }

    const scale = 1 - OVERLAY_DIM_ALPHA * dimProgress
    const dim = (channel: number) => Math.round(channel * scale)
    metaThemeColor.setAttribute('content', `rgb(${dim(rgb.r)}, ${dim(rgb.g)}, ${dim(rgb.b)})`)
  }

  const animateDim = (to: number) => {
    cancelAnimationFrame(dimFrame)

    const from = dimProgress
    const distance = to - from
    if (!distance) return

    // 中途反向时按剩余距离缩短时长，速度才和遮罩对得上。
    const duration = OVERLAY_DIM_DURATION * Math.abs(distance)
    const start = performance.now()

    const step = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)

      dimProgress = from + distance * easeOut(progress)
      setThemeColor()

      if (progress < 1) dimFrame = requestAnimationFrame(step)
    }

    dimFrame = requestAnimationFrame(step)
  }

  watch(isPreferredDark, setThemeColor)
  watch(dimmedOverlayCount, (count) => animateDim(count > 0 ? 1 : 0))

  onMounted(setThemeColor)
  onUnmounted(() => cancelAnimationFrame(dimFrame))

  // 主题切换要等 <body data-theme> 落定后才读得到新底色，交给调用方在改完后调。
  return { setThemeColor }
}
