import { useStorage } from '@/composables/use-storage'
import { stripAnsi } from '@/helper/ansi'
import { ref } from 'vue'

export const logFilter = ref('')
export const logTypeFilter = ref('')
export const logFilterRegex = useStorage<string>('config/log-filter-regex', '')
export const logFilterEnabled = useStorage<boolean>('config/log-filter-enabled', false)

// sing-box 日志以连接 id 开头,如 [3829292130 5ms] router: match[0]
export const getLogConnectionID = (payload: string) => {
  return stripAnsi(payload).match(/^\[(\d+)\s[^\]]*\]/)?.[1] ?? null
}
