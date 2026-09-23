import { DEFAULT_SETTINGS_MENU_ORDER, SETTINGS_CATEGORIES } from '@/config/settings-items'
import { isSettingVisible } from '@/helper/settings'
import { settingsMenuOrder } from '@/store/settings'
import { computed } from 'vue'

export const visibleSectionKeys = computed(() => {
  const order = [
    ...settingsMenuOrder.value,
    ...DEFAULT_SETTINGS_MENU_ORDER.filter((key) => !settingsMenuOrder.value.includes(key)),
  ]

  return order.filter(
    (key) => SETTINGS_CATEGORIES.some((category) => category.key === key) && isSettingVisible(key),
  )
})
