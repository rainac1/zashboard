<template>
  <div class="bg-base-200/30 flex flex-col rounded-xl p-4">
    <div class="flex items-center justify-between">
      <div class="text-base-content/60 text-xs font-semibold tracking-wider uppercase">
        {{ $t('networkInfo') }}
      </div>
      <div class="flex gap-1">
        <button
          class="btn btn-ghost btn-xs btn-circle"
          @click="showPrivacy = !showPrivacy"
          @mouseenter="handlerShowPrivacyTip"
        >
          <EyeIcon
            v-if="showPrivacy"
            class="h-3.5 w-3.5"
          />
          <EyeSlashIcon
            v-else
            class="h-3.5 w-3.5"
          />
        </button>
        <button
          class="btn btn-ghost btn-xs btn-circle"
          @click="getIPs"
        >
          <BoltIcon class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>

    <div class="mt-3 flex flex-col gap-3">
      <div>
        <SelectInput
          v-model="ipCheckPrimaryAPI"
          class="select-ghost select-xs h-6 min-h-6 w-auto border-0"
          :aria-label="`${t('IPInfoAPI')} 1`"
          :options="apiOptions"
        />
        <div class="mt-1 text-sm">
          {{ showPrivacy ? ipCheckPrimaryResult.ipWithPrivacy[0] : ipCheckPrimaryResult.ip[0] }}
          <span
            v-if="ipCheckPrimaryResult.ip[1]"
            class="text-base-content/60 text-xs"
          >
            ({{ showPrivacy ? ipCheckPrimaryResult.ipWithPrivacy[1] : ipCheckPrimaryResult.ip[1] }})
          </span>
        </div>
      </div>

      <div class="border-base-content/5 border-t" />

      <div>
        <SelectInput
          v-model="ipCheckSecondaryAPI"
          class="select-ghost select-xs h-6 min-h-6 w-auto border-0"
          :aria-label="`${t('IPInfoAPI')} 2`"
          :options="apiOptions"
        />
        <div class="mt-1 text-sm">
          {{ showPrivacy ? ipCheckSecondaryResult.ipWithPrivacy[0] : ipCheckSecondaryResult.ip[0] }}
          <span
            v-if="ipCheckSecondaryResult.ip[1]"
            class="text-base-content/60 text-xs"
          >
            ({{
              showPrivacy ? ipCheckSecondaryResult.ipWithPrivacy[1] : ipCheckSecondaryResult.ip[1]
            }})
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import SelectInput from '@/components/common/SelectInput.vue'
import { getPublicIPInfo, type IPInfo } from '@/api/geoip'
import { ipCheckPrimaryResult, ipCheckSecondaryResult, type IPCheckResult } from '@/helper/overview'
import { IP_INFO_API } from '@/constant'
import { useTooltip } from '@/composables/use-tooltip'
import { autoIPCheck, ipCheckPrimaryAPI, ipCheckSecondaryAPI } from '@/store/settings'
import { BoltIcon, EyeIcon, EyeSlashIcon } from '@heroicons/vue/24/outline'
import * as ipaddr from 'ipaddr.js'
import type { Ref } from 'vue'
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const showPrivacy = ref(false)
const { showTip } = useTooltip()
const handlerShowPrivacyTip = (e: Event) => {
  showTip(e, t('ipScreenshotTip'))
}
const apiOptions = Object.values(IP_INFO_API).map((value) => ({ value, label: value }))

type Slot = 'primary' | 'secondary'
const requestIDs: Record<Slot, number> = { primary: 0, secondary: 0 }

const queryingResult = (api: IP_INFO_API): IPCheckResult => ({
  api,
  ip: [t('getting'), ''],
  ipWithPrivacy: [t('getting'), ''],
  info: null,
})

const failedResult = (api: IP_INFO_API): IPCheckResult => ({
  api,
  ip: [t('testFailed'), ''],
  ipWithPrivacy: [t('testFailed'), ''],
  info: null,
})

const maskIP = (value: string) => {
  if (!ipaddr.isValid(value)) return '***.***.***.***'

  const address = ipaddr.parse(value)

  if (address.kind() === 'ipv4') return '***.***.***.***'

  const parts = address.toNormalizedString().split(':')
  return `${parts[0]}:${parts[1]}:****:****`
}

const distinct = (values: string[]) => [
  ...new Set(values.map((value) => value.trim()).filter(Boolean)),
]

const displayLabel = (info: IPInfo, api: IP_INFO_API) => {
  if (api === IP_INFO_API.IPIP) {
    return distinct([info.country, info.region, info.city, info.organization]).join(' ')
  }

  return distinct([info.country, info.organization]).join(' ') || info.ip
}

const successResult = (info: IPInfo, api: IP_INFO_API): IPCheckResult => {
  const label = displayLabel(info, api)
  const privateLabel = api === IP_INFO_API.IPIP ? `${info.country || '**'} ** ** **` : label

  return {
    api,
    ipWithPrivacy: [label, info.ip],
    ip: [privateLabel, maskIP(info.ip)],
    info,
  }
}

const querySlot = async (slot: Slot, apiRef: Ref<IP_INFO_API>, resultRef: Ref<IPCheckResult>) => {
  const api = apiRef.value
  const requestID = ++requestIDs[slot]
  resultRef.value = queryingResult(api)

  try {
    const info = await getPublicIPInfo(api)

    if (requestID !== requestIDs[slot] || api !== apiRef.value) return
    resultRef.value = successResult(info, api)
  } catch {
    if (requestID !== requestIDs[slot] || api !== apiRef.value) return
    resultRef.value = failedResult(api)
  }
}

const getIPs = () => {
  void querySlot('primary', ipCheckPrimaryAPI, ipCheckPrimaryResult)
  void querySlot('secondary', ipCheckSecondaryAPI, ipCheckSecondaryResult)
}

watch(ipCheckPrimaryAPI, () => void querySlot('primary', ipCheckPrimaryAPI, ipCheckPrimaryResult))
watch(
  ipCheckSecondaryAPI,
  () => void querySlot('secondary', ipCheckSecondaryAPI, ipCheckSecondaryResult),
)

onMounted(() => {
  if (!autoIPCheck.value) return

  if (
    ipCheckPrimaryResult.value.ip.length === 0 ||
    ipCheckPrimaryResult.value.api !== ipCheckPrimaryAPI.value
  ) {
    void querySlot('primary', ipCheckPrimaryAPI, ipCheckPrimaryResult)
  }
  if (
    ipCheckSecondaryResult.value.ip.length === 0 ||
    ipCheckSecondaryResult.value.api !== ipCheckSecondaryAPI.value
  ) {
    void querySlot('secondary', ipCheckSecondaryAPI, ipCheckSecondaryResult)
  }
})
</script>
