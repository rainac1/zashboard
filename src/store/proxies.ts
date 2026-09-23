import { useStorage } from '@/composables/use-storage'
import { PROXY_TAB_TYPE } from '@/constant'
import { ref, watch } from 'vue'
import { activeBackend } from './setup'

export const proxiesFilter = ref('')
export const proxiesTabShow = ref(PROXY_TAB_TYPE.PROXIES)
export const hiddenGroupMap = useStorage<Record<string, boolean>>('config/hidden-group-map', {})

watch(activeBackend, (backend) => {
  if (backend) proxiesTabShow.value = PROXY_TAB_TYPE.PROXIES
})
