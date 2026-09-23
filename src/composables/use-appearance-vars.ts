import { blurIntensity, dashboardTransparent } from '@/store/settings'
import { watchEffect } from 'vue'

const OVERLAY_BLUR_MIN = 12

export const useAppearanceVars = () => {
  watchEffect(() => {
    const root = document.documentElement

    root.style.setProperty('--app-surface-alpha', `${dashboardTransparent.value}%`)
    root.style.setProperty(
      '--app-glass',
      Number(blurIntensity.value) > 0 ? `blur(${blurIntensity.value}px)` : 'none',
    )
    root.style.setProperty(
      '--app-glass-overlay',
      `blur(${Math.max(Number(blurIntensity.value) || 0, OVERLAY_BLUR_MIN)}px)`,
    )
  })
}
