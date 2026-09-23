<template>
  <DialogWrapper
    v-if="isReady"
    :model-value="!!confirmDialogState"
    :title="confirmDialogState?.title"
    box-class="max-w-lg"
    @update:model-value="handleModelValue"
    @enter="handleConfirm"
  >
    <div
      v-if="confirmDialogState"
      class="flex max-h-[65dvh] min-h-0 flex-col gap-4 p-2 max-md:max-h-[50dvh]"
    >
      <div class="min-h-0 overflow-y-auto overscroll-contain pr-1">
        <p class="text-sm break-all whitespace-pre-wrap">
          {{ confirmDialogState.message }}
        </p>
        <a
          v-if="confirmDialogState.link"
          class="link link-primary mt-2 inline-block text-sm"
          :href="confirmDialogState.link.url"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ confirmDialogState.link.text }}
        </a>
      </div>
      <div class="flex shrink-0 items-center justify-end gap-2">
        <label
          v-if="confirmDialogState.checkboxText"
          class="mr-auto flex cursor-pointer items-center gap-2 text-sm"
        >
          <input
            v-model="checked"
            type="checkbox"
            class="checkbox checkbox-sm"
          />
          {{ confirmDialogState.checkboxText }}
        </label>
        <button
          class="btn btn-sm"
          @click="handleCancel"
        >
          {{ confirmDialogState.cancelText || $t('cancel') }}
        </button>
        <button
          :class="['btn btn-sm', confirmDialogState.confirmButtonClass || 'btn-primary']"
          @click="handleConfirm"
        >
          {{ confirmDialogState.confirmText || $t('confirm') }}
        </button>
      </div>
    </div>
  </DialogWrapper>
</template>

<script setup lang="ts">
import { confirmDialogState, resolveConfirmDialog } from '@/helper/confirm-dialog'
import { onMounted, ref, watch } from 'vue'
import DialogWrapper from './DialogWrapper.vue'

const isReady = ref(false)
const checked = ref(false)

onMounted(() => {
  isReady.value = true
})

watch(confirmDialogState, () => {
  checked.value = false
})

const handleModelValue = (value: boolean | undefined) => {
  if (value) return

  resolveConfirmDialog('dismiss', checked.value)
}

const handleCancel = () => {
  resolveConfirmDialog('cancel', checked.value)
}

const handleConfirm = () => {
  resolveConfirmDialog('confirm', checked.value)
}
</script>
