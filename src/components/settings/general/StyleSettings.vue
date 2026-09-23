<template>
  <template v-if="hasVisibleStyleItems">
    <div class="settings-section-label">
      {{ $t('appearance') }}
    </div>
    <div class="settings-grid">
      <SettingItem :setting-key="k.autoSwitchTheme">
        <div class="setting-item-label">
          {{ $t('autoSwitchTheme') }}
        </div>
        <input
          type="checkbox"
          v-model="autoTheme"
          class="toggle"
        />
      </SettingItem>
      <SettingItem :setting-key="k.defaultTheme">
        <div class="setting-item-label">
          {{ $t('defaultTheme') }}
        </div>
        <div class="join">
          <ThemeSelector
            class="join-item w-38!"
            v-model:value="defaultTheme"
          />
          <button
            class="btn btn-sm join-item"
            @click="customThemeModal = !customThemeModal"
          >
            <PlusIcon class="h-4 w-4" />
          </button>
        </div>
        <CustomTheme v-model:value="customThemeModal" />
      </SettingItem>
      <SettingItem
        :setting-key="k.darkTheme"
        :when="autoTheme"
      >
        <div class="setting-item-label">
          {{ $t('darkTheme') }}
        </div>
        <ThemeSelector v-model:value="darkTheme" />
      </SettingItem>
      <BackgroundSettings />
      <SettingItem :setting-key="k.fonts">
        <div class="setting-item-label">
          {{ $t('fonts') }}
        </div>
        <SelectInput
          class="select select-sm w-48"
          v-model="font"
          :options="fontOptions.map((value) => ({ value, label: value }))"
        />
      </SettingItem>
      <SettingItem :setting-key="k.emoji">
        <div class="setting-item-label">Emoji</div>
        <SelectInput
          class="select select-sm w-48"
          v-model="emoji"
          :options="Object.values(EMOJIS).map((value) => ({ value, label: value }))"
        />
      </SettingItem>
      <SettingItem :setting-key="k.customCSS">
        <div class="setting-item-label">
          {{ $t('customCSS') }}
        </div>
        <button
          class="btn btn-sm"
          :class="customCSS && 'btn-primary'"
          @click="customCSSModal = !customCSSModal"
        >
          <PencilSquareIcon class="h-4 w-4" />
        </button>
        <CustomCSS v-model:value="customCSSModal" />
      </SettingItem>
    </div>
  </template>
</template>

<script setup lang="ts">
import SettingItem from '@/components/settings/SettingItem.vue'
import SelectInput from '@/components/common/SelectInput.vue'
import { useIsSettingVisible } from '@/composables/use-setting-visibility'
import { GENERAL_ITEM_KEYS } from '@/config/settings-items'
import { EMOJIS, FONTS } from '@/constant'
import { autoTheme, customCSS, darkTheme, defaultTheme, emoji, font } from '@/store/settings'
import { PencilSquareIcon, PlusIcon } from '@heroicons/vue/24/outline'
import { computed, ref } from 'vue'
import BackgroundSettings from './BackgroundSettings.vue'
import CustomCSS from './CustomCSS.vue'
import CustomTheme from './CustomTheme.vue'
import ThemeSelector from './ThemeSelector.vue'

const customThemeModal = ref(false)
const customCSSModal = ref(false)

const k = GENERAL_ITEM_KEYS
const isVisibleFonts = useIsSettingVisible(k.fonts)
const isVisibleEmoji = useIsSettingVisible(k.emoji)
const isVisibleCustomCSS = useIsSettingVisible(k.customCSS)
const isVisibleCustomBackgroundURL = useIsSettingVisible(k.customBackgroundURL)
const isVisibleDefaultTheme = useIsSettingVisible(k.defaultTheme)
const isVisibleDarkTheme = useIsSettingVisible(k.darkTheme)
const isVisibleAutoSwitchTheme = useIsSettingVisible(k.autoSwitchTheme)

const hasVisibleStyleItems = computed(() => {
  return (
    isVisibleDefaultTheme.value ||
    isVisibleAutoSwitchTheme.value ||
    (autoTheme.value && isVisibleDarkTheme.value) ||
    isVisibleCustomBackgroundURL.value ||
    isVisibleFonts.value ||
    isVisibleEmoji.value ||
    isVisibleCustomCSS.value
  )
})

const fontOptions = computed(() => {
  const mode = import.meta.env.MODE

  if (Object.values(FONTS).includes(mode as FONTS)) {
    return [mode]
  }

  return Object.values(FONTS)
})
</script>
