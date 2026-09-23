import type { IPInfo } from '@/api/geoip'
import type { IP_INFO_API } from '@/constant'
import { ref } from 'vue'

export type IPCheckResult = {
  api: IP_INFO_API | null
  ip: string[]
  ipWithPrivacy: string[]
  info: IPInfo | null
}

export const ipCheckPrimaryResult = ref<IPCheckResult>({
  api: null,
  ip: [],
  ipWithPrivacy: [],
  info: null,
})
export const ipCheckSecondaryResult = ref<IPCheckResult>({
  api: null,
  ip: [],
  ipWithPrivacy: [],
  info: null,
})

export const getCachedPublicIPInfo = (api: IP_INFO_API) =>
  [ipCheckPrimaryResult.value, ipCheckSecondaryResult.value].find(
    (result) => result.api === api && result.info,
  )?.info ?? null

export const baiduLatency = ref<number[]>([])
export const githubLatency = ref<number[]>([])
export const youtubeLatency = ref<number[]>([])
export const cloudflareLatency = ref<number[]>([])
