<template>
  <div
    class="relative"
    @focusout="handleFocusOut"
  >
    <label class="input input-sm flex w-full items-center gap-2">
      <MagnifyingGlassIcon class="h-4 w-4 shrink-0 opacity-45" />
      <input
        v-model="query"
        type="search"
        class="min-w-0 flex-1"
        :placeholder="$t('searchSettings')"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="showResults"
        :aria-controls="listboxId"
        :aria-activedescendant="showResults && activeIndex >= 0 ? optionId(activeIndex) : undefined"
        @focus="focused = true"
        @input="focused = true"
        @keydown="handleInputKeydown"
      />
      <button
        v-if="query"
        type="button"
        class="btn btn-circle btn-ghost btn-xs"
        :aria-label="$t('clear')"
        @click="query = ''"
      >
        <XMarkIcon class="h-3.5 w-3.5" />
      </button>
    </label>

    <div
      v-if="showResults"
      :id="listboxId"
      role="listbox"
      class="border-base-border bg-base-100 absolute top-[calc(100%+0.375rem)] right-0 left-0 z-50 max-h-[min(26rem,60dvh)] overflow-y-auto rounded-xl border p-1 shadow-xl"
    >
      <template
        v-for="(result, index) in visibleResults"
        :key="result.anchorKey"
      >
        <div
          v-if="index === 0 || visibleResults[index - 1]?.category.key !== result.category.key"
          class="text-base-content/45 px-3 pt-2 pb-1 text-xs font-medium"
        >
          {{ $t(SETTINGS_MENU_LABELS[result.category.key]) }}
        </div>
        <button
          :id="optionId(index)"
          type="button"
          role="option"
          class="hover:bg-base-200 focus-visible:bg-base-200 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left outline-none"
          :class="activeIndex === index && 'bg-base-200'"
          :aria-selected="activeIndex === index"
          @pointermove="activeIndex = index"
          @click="select(result.category.key, result.anchorKey)"
        >
          <component
            :is="result.category.icon"
            class="h-4 w-4 shrink-0 opacity-55"
          />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium">{{ $t(result.label) }}</span>
            <span class="text-base-content/50 block truncate text-xs">
              {{ $t(result.item.section) }}
            </span>
          </span>
          <ChevronRightIcon class="h-4 w-4 shrink-0 opacity-30" />
        </button>
      </template>

      <button
        v-if="hiddenResults.length"
        type="button"
        class="hover:bg-base-200 text-base-content/65 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm"
        @click="openCustomization"
      >
        <EyeSlashIcon class="h-4 w-4 shrink-0" />
        <span class="flex-1">{{ $t('hiddenSearchResults', { count: hiddenResults.length }) }}</span>
        <ChevronRightIcon class="h-4 w-4 shrink-0 opacity-30" />
      </button>

      <div
        v-if="!visibleResults.length && !hiddenResults.length"
        class="text-base-content/45 px-3 py-6 text-center text-sm"
      >
        {{ $t('noSettingsFound') }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { isSettingHidden, isSettingRendered } from '@/composables/settings'
import {
  SETTINGS_CATEGORIES,
  SETTINGS_MENU_LABELS,
  type SettingsCategory,
  type SettingsCategoryItem,
} from '@/config/settingsItems'
import { SETTINGS_MENU_KEY } from '@/constant'
import {
  ChevronRightIcon,
  EyeSlashIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline'
import { computed, nextTick, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'

type SearchResult = {
  category: SettingsCategory
  item: SettingsCategoryItem
  anchorKey: string
  label: string
}

const emit = defineEmits<{
  (event: 'select', category: SETTINGS_MENU_KEY, settingKey: string): void
  (event: 'customize'): void
}>()

const { t } = useI18n()
const query = ref('')
const focused = ref(false)
const activeIndex = ref(-1)
const listboxId = `settings-search-${useId().replace(/[^\w-]/g, '')}`

const matches = computed<SearchResult[]>(() => {
  const needle = query.value.trim().toLocaleLowerCase()
  if (!needle) return []

  return SETTINGS_CATEGORIES.flatMap((category) =>
    category.items.flatMap((item) =>
      (item.searchEntries ?? [{ anchorKey: item.key, label: item.label }]).flatMap((entry) => {
        const haystack = [
          t(entry.label),
          t(item.label),
          t(item.section),
          t(SETTINGS_MENU_LABELS[category.key]),
          ...(item.keywords ?? []),
        ]
          .join(' ')
          .toLocaleLowerCase()
        return haystack.includes(needle) ? [{ category, item, ...entry }] : []
      }),
    ),
  )
})

const hiddenResults = computed(() =>
  matches.value.filter(
    ({ category, item }) => isSettingHidden(category.key) || isSettingHidden(item.key),
  ),
)
const visibleResults = computed(() =>
  matches.value.filter(
    ({ category, item, anchorKey }) =>
      !isSettingHidden(category.key) && !isSettingHidden(item.key) && isSettingRendered(anchorKey),
  ),
)
const showResults = computed(() => focused.value && !!query.value.trim())

const optionId = (index: number) => `${listboxId}-option-${index}`
const close = () => {
  focused.value = false
  activeIndex.value = -1
}
const select = (category: SETTINGS_MENU_KEY, settingKey: string) => {
  emit('select', category, settingKey)
  query.value = ''
  close()
}
const openCustomization = () => {
  emit('customize')
  close()
}
const handleFocusOut = (event: FocusEvent) => {
  const current = event.currentTarget as HTMLElement
  if (event.relatedTarget instanceof Node && current.contains(event.relatedTarget)) return
  close()
}

const scrollActiveIntoView = () => {
  nextTick(() =>
    document.getElementById(optionId(activeIndex.value))?.scrollIntoView({ block: 'nearest' }),
  )
}
const moveActive = (direction: 1 | -1) => {
  const length = visibleResults.value.length
  if (!length) return
  activeIndex.value = (activeIndex.value + direction + length) % length
  scrollActiveIntoView()
}
const handleInputKeydown = (event: KeyboardEvent) => {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      moveActive(1)
      break
    case 'ArrowUp':
      event.preventDefault()
      moveActive(-1)
      break
    case 'Enter': {
      const result = visibleResults.value[activeIndex.value]
      if (!result) return
      event.preventDefault()
      select(result.category.key, result.anchorKey)
      break
    }
    case 'Escape':
      event.preventDefault()
      close()
  }
}

watch(visibleResults, (results) => {
  activeIndex.value = results.length ? 0 : -1
})
</script>
