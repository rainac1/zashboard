import { hiddenSettingsItems } from '@/store/settings'
import type { MaybeRef } from 'vue'
import { computed, unref } from 'vue'

export function useIsSettingVisible(key: MaybeRef<string>) {
  return computed(() => !hiddenSettingsItems.value[unref(key)])
}
