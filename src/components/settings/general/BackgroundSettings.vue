<template>
  <SettingItem
    :setting-key="k.customBackgroundURL"
    class="max-sm:flex-wrap max-sm:py-3"
  >
    <div class="setting-item-label max-sm:w-full max-sm:flex-none">
      {{ $t('customBackgroundURL') }}
    </div>
    <div class="join w-48 max-sm:w-full">
      <TextInput
        class="join-item min-w-0 flex-1"
        v-model="customBackgroundURL"
        :clearable="true"
        @update:modelValue="handlerBackgroundURLChange"
      />
      <button
        class="btn join-item btn-sm"
        @click="handlerClickUpload"
      >
        <ArrowUpTrayIcon class="h-4 w-4" />
      </button>
    </div>
    <input
      ref="inputFileRef"
      type="file"
      accept="image/*"
      class="hidden"
      @change="handlerFileChange"
    />
  </SettingItem>
  <SettingItem
    :setting-key="k.transparent"
    :when="!!customBackgroundURL"
    class="settings-dependent-item"
  >
    <div class="setting-item-label shrink-0">
      {{ $t('transparent') }}
    </div>
    <input
      type="range"
      min="0"
      max="100"
      v-model="dashboardTransparent"
      class="range w-48 max-w-full min-w-0"
    />
  </SettingItem>
  <SettingItem
    :setting-key="k.blurIntensity"
    :when="!!customBackgroundURL"
    class="settings-dependent-item"
  >
    <div class="setting-item-label shrink-0">
      {{ $t('blurIntensity') }}
    </div>
    <input
      type="range"
      min="0"
      max="40"
      v-model="blurIntensity"
      class="range w-48 max-w-full min-w-0"
    />
  </SettingItem>
</template>

<script setup lang="ts">
import SettingItem from '@/components/settings/SettingItem.vue'
import { GENERAL_ITEM_KEYS } from '@/config/settings-items'
import { deleteBase64FromIndexedDB, LOCAL_IMAGE, saveBase64ToIndexedDB } from '@/helper/indexeddb'
import {
  autoTheme,
  blurIntensity,
  customBackgroundURL,
  dashboardTransparent,
  defaultTheme,
  theme,
} from '@/store/settings'
import { ArrowUpTrayIcon } from '@heroicons/vue/24/outline'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import TextInput from '../../common/TextInput.vue'

type BackgroundToneTheme = 'light' | 'dark'

const { t } = useI18n()

const k = GENERAL_ITEM_KEYS

const inputFileRef = ref<HTMLInputElement>()

const handlerClickUpload = () => {
  inputFileRef.value?.click()
}

const applyThemeByBackgroundTone = (themeName: BackgroundToneTheme) => {
  autoTheme.value = false
  defaultTheme.value = themeName
}

const detectCurrentThemeTone = (): BackgroundToneTheme | null => {
  const themeElement = document.createElement('div')
  themeElement.dataset.theme = theme.value
  themeElement.style.display = 'none'
  document.body.appendChild(themeElement)

  const styles = getComputedStyle(themeElement)
  const colorScheme = styles.getPropertyValue('color-scheme').trim() || styles.colorScheme.trim()

  themeElement.remove()

  if (colorScheme === 'dark') {
    return 'dark'
  }

  return 'light'
}

const confirmApplyThemeByBackgroundTone = (themeName: BackgroundToneTheme) => {
  if (detectCurrentThemeTone() === themeName) {
    return
  }

  const toneLabel =
    themeName === 'dark' ? t('backgroundToneDarkThemeLabel') : t('backgroundToneLightThemeLabel')

  if (!window.confirm(t('backgroundToneSwitchConfirm', { theme: toneLabel }))) {
    return
  }

  applyThemeByBackgroundTone(themeName)
}

const detectBackgroundTone = (imageURL: string) => {
  return new Promise<BackgroundToneTheme>((resolve, reject) => {
    const image = new Image()

    image.onload = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d', { willReadFrequently: true })

      if (!ctx) {
        reject(new Error('Unable to create canvas context'))
        return
      }

      const sampleSize = 48
      canvas.width = sampleSize
      canvas.height = sampleSize
      ctx.drawImage(image, 0, 0, sampleSize, sampleSize)

      const { data } = ctx.getImageData(0, 0, sampleSize, sampleSize)
      let weightedBrightness = 0
      let visiblePixels = 0

      for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3] / 255
        if (alpha === 0) continue

        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]

        weightedBrightness += (0.299 * r + 0.587 * g + 0.114 * b) * alpha
        visiblePixels += alpha
      }

      if (visiblePixels === 0) {
        resolve('light')
        return
      }

      const averageBrightness = weightedBrightness / visiblePixels
      resolve(averageBrightness < 140 ? 'dark' : 'light')
    }

    image.onerror = () => reject(new Error('Failed to load background image'))
    image.src = imageURL
  })
}

const handlerBackgroundURLChange = () => {
  if (!customBackgroundURL.value.includes(LOCAL_IMAGE)) {
    deleteBase64FromIndexedDB()
  }
}

const handlerFileChange = (e: Event) => {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = async () => {
    const imageURL = reader.result as string

    try {
      confirmApplyThemeByBackgroundTone(await detectBackgroundTone(imageURL))
    } catch {}

    customBackgroundURL.value = LOCAL_IMAGE + '-' + Date.now()
    saveBase64ToIndexedDB(imageURL)
    target.value = ''
  }
  reader.readAsDataURL(file)
}
</script>
