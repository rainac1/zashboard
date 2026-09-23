<template>
  <DialogWrapper
    v-model="model"
    :title="$t('customCSS')"
  >
    <div class="flex flex-col gap-2 p-2 pb-14">
      <div class="text-base-content/60 text-xs">
        {{ $t('customCSSTip') }}
      </div>
      <textarea
        class="textarea textarea-bordered h-64 w-full font-mono text-xs"
        spellcheck="false"
        v-model="draft"
        :placeholder="placeholder"
      ></textarea>
    </div>
    <div
      class="bg-base-100 border-base-200 overlay-glass absolute right-0 bottom-0 left-0 flex gap-2 border-t p-2 pt-2"
    >
      <button
        class="btn btn-sm"
        @click="handlerReset"
      >
        {{ $t('reset') }}
      </button>
      <div class="flex-1"></div>
      <button
        class="btn btn-sm btn-primary"
        @click="handlerSave"
      >
        {{ $t('save') }}
      </button>
    </div>
  </DialogWrapper>
</template>

<script setup lang="ts">
import { applyCustomCSS } from '@/helper'
import { customCSS } from '@/store/settings'
import { ref, watch } from 'vue'
import DialogWrapper from '../../common/DialogWrapper.vue'

const model = defineModel<boolean>('value', {
  default: false,
})

const placeholder = `#app {\n  font-size: 14px;\n}`
const draft = ref(customCSS.value)

watch(model, (isOpen) => {
  if (isOpen) {
    draft.value = customCSS.value
  }
})

const handlerSave = () => {
  customCSS.value = draft.value
  applyCustomCSS()
  model.value = false
}

const handlerReset = () => {
  draft.value = ''
  customCSS.value = ''
  applyCustomCSS()
}
</script>
