<template>
  <DialogWrapper
    v-model="isOpen"
    :title="$t('terminalSettings')"
  >
    <div class="flex flex-col gap-3">
      <label class="flex flex-col gap-1 text-sm">
        <span>{{ $t('terminalThemeLight') }}</span>
        <SelectInput
          class="select select-sm select-bordered"
          v-model="terminalConfig.lightThemeName"
          :options="lightThemes.map(({ name }) => ({ value: name, label: name }))"
        />
      </label>

      <label class="flex flex-col gap-1 text-sm">
        <span>{{ $t('terminalThemeDark') }}</span>
        <SelectInput
          class="select select-sm select-bordered"
          v-model="terminalConfig.darkThemeName"
          :options="darkThemes.map(({ name }) => ({ value: name, label: name }))"
        />
      </label>

      <label class="flex flex-col gap-1 text-sm">
        <span>{{ $t('fontFamily') }}</span>
        <SelectInput
          class="select select-sm select-bordered"
          v-model="terminalConfig.fontFamily"
          :options="[
            { value: '', label: $t('defaultFont') },
            ...FONT_FAMILIES.map((value) => ({ value, label: value })),
          ]"
        />
      </label>

      <label class="flex flex-col gap-1 text-sm">
        <span>{{ $t('fontSize') }}</span>
        <SelectInput
          class="select select-sm select-bordered"
          v-model="terminalConfig.fontSize"
          :options="FONT_SIZES.map((value) => ({ value, label: String(value) }))"
        />
      </label>
    </div>
  </DialogWrapper>
</template>

<script setup lang="ts">
import DialogWrapper from '@/components/common/DialogWrapper.vue'
import SelectInput from '@/components/common/SelectInput.vue'
import { FONT_FAMILIES, FONT_SIZES, terminalConfig } from '@/composables/terminalConfig'
import { themesForScheme } from '@/composables/terminalThemes'

const isOpen = defineModel<boolean>()

const lightThemes = themesForScheme(false)
const darkThemes = themesForScheme(true)
</script>
