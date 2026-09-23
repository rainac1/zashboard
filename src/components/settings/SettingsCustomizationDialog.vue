<template>
  <DialogWrapper
    v-model="open"
    :title="$t('customizeSettingsPage')"
    box-class="w-full max-w-2xl"
  >
    <div class="flex flex-col gap-4">
      <p class="text-base-content/55 text-sm">
        {{ $t('customizeSettingsDescription') }}
      </p>

      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="btn btn-sm"
          @click="applyShowAllPreset"
        >
          {{ $t('showAllPreset') }}
        </button>
        <button
          type="button"
          class="btn btn-sm"
          @click="applyMinimalPreset"
        >
          {{ $t('minimalPreset') }}
        </button>
      </div>

      <div class="flex flex-col gap-3">
        <details
          v-for="category in orderedCategories"
          :key="category.key"
          class="border-base-border bg-base-100 rounded-xl border"
          open
        >
          <summary class="flex min-h-12 cursor-pointer list-none items-center gap-2 px-3">
            <input
              type="checkbox"
              class="toggle toggle-sm"
              :checked="!isSettingHidden(category.key)"
              :aria-label="$t(SETTINGS_MENU_LABELS[category.key])"
              @click.stop
              @change="toggleSettingHidden(category.key)"
            />
            <span class="min-w-0 flex-1 font-medium">
              {{ $t(SETTINGS_MENU_LABELS[category.key]) }}
            </span>
            <button
              type="button"
              class="btn btn-circle btn-ghost btn-sm"
              :title="$t('moveUp')"
              @click.prevent.stop="moveSettingsCategory(category.key, -1)"
            >
              <ChevronUpIcon class="h-4 w-4" />
            </button>
            <button
              type="button"
              class="btn btn-circle btn-ghost btn-sm"
              :title="$t('moveDown')"
              @click.prevent.stop="moveSettingsCategory(category.key, 1)"
            >
              <ChevronDownIcon class="h-4 w-4" />
            </button>
            <ChevronRightIcon class="details-chevron h-4 w-4 opacity-40" />
          </summary>

          <div class="border-base-border grid border-t sm:grid-cols-2">
            <label
              v-for="item in category.items"
              :key="item.key"
              class="border-base-border flex min-h-11 cursor-pointer items-center gap-3 border-b px-3 text-sm last:border-b-0 sm:odd:border-r"
            >
              <input
                type="checkbox"
                class="checkbox checkbox-sm"
                :checked="!isSettingHidden(item.key)"
                @change="toggleSettingHidden(item.key)"
              />
              <span class="min-w-0 flex-1">{{ $t(item.label) }}</span>
            </label>
          </div>
        </details>
      </div>
    </div>
  </DialogWrapper>
</template>

<script setup lang="ts">
import DialogWrapper from '@/components/common/DialogWrapper.vue'
import {
  applyMinimalPreset,
  applyShowAllPreset,
  isSettingHidden,
  moveSettingsCategory,
  toggleSettingHidden,
} from '@/helper/settings'
import {
  DEFAULT_SETTINGS_MENU_ORDER,
  SETTINGS_CATEGORIES,
  SETTINGS_MENU_LABELS,
} from '@/config/settings-items'
import { settingsMenuOrder } from '@/store/settings'
import { ChevronDownIcon, ChevronRightIcon, ChevronUpIcon } from '@heroicons/vue/24/outline'
import { computed } from 'vue'

const open = defineModel<boolean>()

const orderedCategories = computed(() => {
  const order = [
    ...settingsMenuOrder.value,
    ...DEFAULT_SETTINGS_MENU_ORDER.filter((key) => !settingsMenuOrder.value.includes(key)),
  ]
  return order.flatMap((key) => {
    const category = SETTINGS_CATEGORIES.find((item) => item.key === key)
    return category ? [category] : []
  })
})
</script>

<style scoped>
details[open] > summary .details-chevron {
  transform: rotate(90deg);
}
</style>
