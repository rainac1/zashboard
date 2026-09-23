import type { StorageLike, UseStorageOptions } from '@vueuse/core'
import { useStorage as useVueUseStorage } from '@vueuse/core'
import type { MaybeRefOrGetter } from 'vue'

export function useStorage<T>(
  key: MaybeRefOrGetter<string>,
  defaults: MaybeRefOrGetter<T>,
  storage?: StorageLike,
  options?: UseStorageOptions<T>,
) {
  return useVueUseStorage(key, defaults, storage, {
    writeDefaults: false,
    ...options,
  })
}
