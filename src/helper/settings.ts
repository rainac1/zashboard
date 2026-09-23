import { DEFAULT_SETTINGS_MENU_ORDER, getAllSettingKeys } from '@/config/settings-items'
import { SETTINGS_MENU_KEY } from '@/constant'
import { hiddenSettingsItems, settingsMenuOrder } from '@/store/settings'
import { ref } from 'vue'

const renderedSettingCounts = ref<Record<string, number>>({})

export function registerRenderedSetting(key: string): () => void {
  renderedSettingCounts.value = {
    ...renderedSettingCounts.value,
    [key]: (renderedSettingCounts.value[key] ?? 0) + 1,
  }

  return () => {
    const next = { ...renderedSettingCounts.value }
    const count = (next[key] ?? 1) - 1
    if (count > 0) next[key] = count
    else delete next[key]
    renderedSettingCounts.value = next
  }
}

export function isSettingRendered(key: string): boolean {
  return !!renderedSettingCounts.value[key]
}

export function isSettingVisible(key: string): boolean {
  return !hiddenSettingsItems.value[key]
}

export function isSettingHidden(key: string): boolean {
  return !!hiddenSettingsItems.value[key]
}

export function toggleSettingHidden(key: string): void {
  hiddenSettingsItems.value = {
    ...hiddenSettingsItems.value,
    [key]: !hiddenSettingsItems.value[key],
  }
}

export function applyShowAllPreset(): void {
  hiddenSettingsItems.value = {}
  settingsMenuOrder.value = [...DEFAULT_SETTINGS_MENU_ORDER]
}

export function applyMinimalPreset(): void {
  const allKeys = getAllSettingKeys()
  const minimalHiddenKeys: string[] = [SETTINGS_MENU_KEY.proxies, SETTINGS_MENU_KEY.connections]

  for (const key of allKeys) {
    if (key.includes('emoji') || key.includes('language')) {
      minimalHiddenKeys.push(key)
    } else if (key.includes('autoDisconnectIdleUDP') || key.includes('autoDisconnectIdleUDPTime')) {
      minimalHiddenKeys.push(key)
    } else if (
      key.includes('scrollAnimationEffect') ||
      key.includes('swipeInPages') ||
      key.includes('swipeInTabs') ||
      key.includes('disablePullToRefresh')
    ) {
      minimalHiddenKeys.push(key)
    } else if (
      key.includes('displayAllFeatures') ||
      key.includes('IPInfoAPI') ||
      key.includes('numberOfChartsInSidebar') ||
      key.includes('proxyGroupIconSize') ||
      key.includes('proxyGroupIconMargin') ||
      key.includes('proxyPreviewType') ||
      key.includes('proxyCardSize') ||
      key.includes('twoColumnProxyGroup')
    ) {
      minimalHiddenKeys.push(key)
    }
  }

  const newHiddenItems: Record<string, boolean> = {}
  for (const key of minimalHiddenKeys) {
    newHiddenItems[key] = true
  }
  hiddenSettingsItems.value = newHiddenItems
  settingsMenuOrder.value = [...DEFAULT_SETTINGS_MENU_ORDER]
}

export function moveSettingsCategory(key: SETTINGS_MENU_KEY, direction: -1 | 1): void {
  const order = [
    ...settingsMenuOrder.value,
    ...DEFAULT_SETTINGS_MENU_ORDER.filter((item) => !settingsMenuOrder.value.includes(item)),
  ]
  const from = order.indexOf(key)
  if (from === -1) return
  const to = from + direction
  if (to < 0 || to >= order.length) return
  ;[order[from], order[to]] = [order[to], order[from]]
  settingsMenuOrder.value = order
}
