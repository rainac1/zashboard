import { theme } from '@/store/settings'
import { computed } from 'vue'

export type ThemeColorScheme = 'dark' | 'light'

export const themeColorScheme = computed<ThemeColorScheme>(() => {
  void theme.value
  const colorScheme = getComputedStyle(document.documentElement)
    .getPropertyValue('color-scheme')
    .trim()

  return colorScheme.split(/\s+/).includes('dark') ? 'dark' : 'light'
})
