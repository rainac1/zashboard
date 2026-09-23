<template>
  <DialogWrapper
    v-if="isReady"
    v-model="model"
    :title="$t('daeEntries')"
    box-class="max-w-3xl"
  >
    <div class="p-2">
      <DaeEntryPanel v-if="model" />
    </div>
  </DialogWrapper>
</template>

<script lang="ts" setup>
import DialogWrapper from '@/components/common/DialogWrapper.vue'
import DaeEntryPanel from '@/components/dae/DaeEntryPanel.vue'
import { onMounted, ref } from 'vue'

const model = defineModel<boolean>()

const isReady = ref(false)

onMounted(() => {
  isReady.value = true
})
</script>
