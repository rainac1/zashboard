<template>
  <DialogWrapper
    v-if="isReady"
    v-model="modalValue"
    :title="$t('upgradeCore')"
  >
    <div class="flex flex-col gap-2 p-2">
      <button
        class="btn btn-primary"
        :disabled="isCoreUpgrading && upgradingType !== 'auto'"
        @click="handlerClickUpgradeCore('auto')"
      >
        <span
          v-if="isCoreUpgrading && upgradingType === 'auto'"
          class="loading loading-spinner loading-md"
        ></span>
        {{ $t('upgradeCore') }}
      </button>
      <button
        class="btn"
        :disabled="isCoreUpgrading && upgradingType !== 'release'"
        @click="handlerClickUpgradeCore('release')"
      >
        <span
          v-if="isCoreUpgrading && upgradingType === 'release'"
          class="loading loading-spinner loading-md"
        ></span>

        {{ $t('upgradeToRelease') }}
      </button>
      <button
        class="btn"
        :disabled="isCoreUpgrading && upgradingType !== 'alpha'"
        @click="handlerClickUpgradeCore('alpha')"
      >
        <span
          v-if="isCoreUpgrading && upgradingType === 'alpha'"
          class="loading loading-spinner loading-md"
        ></span>
        {{ $t('upgradeToAlpha') }}
      </button>
    </div>
  </DialogWrapper>
</template>

<script setup lang="ts">
import { upgradeCore } from '@/assembly/version'
import { handlerUpgradeSuccess } from '@/helper'
import { showConfirmDialog } from '@/helper/confirm-dialog'
import { notifyActionPending } from '@/helper/notification'
import { notifyRequestError } from '@/helper/request-error'
import { fetchConfigs } from '@/assembly/config'
import { fetchProxies } from '@/assembly/proxies'
import { fetchRules } from '@/assembly/rules'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import DialogWrapper from '../../common/DialogWrapper.vue'

const { t } = useI18n()

const reloadAll = () => {
  fetchConfigs()
  fetchRules()
  fetchProxies()
}

const upgradingType = ref<'release' | 'alpha' | 'auto'>('auto')
const modalValue = defineModel<boolean>()

const isReady = ref(false)
onMounted(() => {
  isReady.value = true
})

const UPGRADE_LABELS: Record<'release' | 'alpha' | 'auto', string> = {
  auto: 'upgradeCore',
  release: 'upgradeToRelease',
  alpha: 'upgradeToAlpha',
}

const isCoreUpgrading = ref(false)
const handlerClickUpgradeCore = async (type: 'release' | 'alpha' | 'auto') => {
  if (isCoreUpgrading.value) return

  const { confirmed } = await showConfirmDialog({
    title: t(UPGRADE_LABELS[type]),
    message: t('upgradeCoreConfirm'),
  })

  if (!confirmed || isCoreUpgrading.value) return

  upgradingType.value = type
  isCoreUpgrading.value = true
  const notifyKey = notifyActionPending(UPGRADE_LABELS[type])
  try {
    await upgradeCore(type)
    reloadAll()
    modalValue.value = false
    handlerUpgradeSuccess(notifyKey)
  } catch (e) {
    notifyRequestError(e, notifyKey)
  } finally {
    isCoreUpgrading.value = false
  }
}
</script>
