<template>
  <DialogWrapper
    v-if="isReady"
    v-model="model"
    :title="$t('daeConfigSources')"
    box-class="max-w-4xl"
  >
    <div class="p-2">
      <DaeConfigPanel v-if="model" />
    </div>
  </DialogWrapper>
</template>

<script lang="ts" setup>
import DialogWrapper from '@/components/common/DialogWrapper.vue'
import DaeConfigPanel from '@/components/dae/DaeConfigPanel.vue'
import { onMounted, ref } from 'vue'

const model = defineModel<boolean>()

const isReady = ref(false)

onMounted(() => {
  isReady.value = true
})
</script>
