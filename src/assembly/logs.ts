import { useStorage } from '@/composables/use-storage'
import { LOG_LEVEL } from '@/constant'
import { logRetentionLimit, sourceIPLabelList } from '@/store/settings'
import { activeBackend } from '@/store/setup'
import type { Log, LogWithSeq } from '@/types'
import dayjs from 'dayjs'
import { throttle } from 'lodash'
import { computed, ref, shallowRef, watch } from 'vue'
import { can, core, Core } from './backend'
import { driver } from './driver'

export const logs = shallowRef<LogWithSeq[]>([])
export const isPaused = ref(false)
export const logLevel = useStorage<string>('config/log-level', LOG_LEVEL.Info)

export const supportedLogLevels = computed(() => {
  const levels = [LOG_LEVEL.Debug, LOG_LEVEL.Info, LOG_LEVEL.Warning, LOG_LEVEL.Error]

  if (can('traceLogLevel')) levels.unshift(LOG_LEVEL.Trace)
  if (can('extraLogLevels')) levels.push(LOG_LEVEL.Fatal, LOG_LEVEL.Panic)
  if (can('silentLogLevel')) levels.push(LOG_LEVEL.Silent)

  return levels
})

watch(supportedLogLevels, (levels) => {
  if (!activeBackend.value || core.value === Core.Unknown) return
  if (levels.includes(logLevel.value as LOG_LEVEL)) return

  logLevel.value = LOG_LEVEL.Info
  if (cancel) initLogs()
})

const createSourceIPMatchers = () => {
  const matchers: [RegExp, string][] = []

  for (const { key, label, scope } of sourceIPLabelList.value) {
    if (scope && !scope.includes(activeBackend.value?.uuid as string)) continue
    if (key.startsWith('/')) continue

    if (key.includes(':')) {
      matchers.push([new RegExp(`${key}]:`, 'ig'), `${key}] (${label}) :`])
    } else {
      matchers.push([new RegExp(`${key}:`, 'ig'), `${key} (${label}) :`])
    }
  }

  return matchers
}

let cancel: (() => void) | undefined

export const initLogs = () => {
  stopLogs()

  let seq = 1
  let pending: LogWithSeq[] = []
  let matchers = createSourceIPMatchers()

  const flush = throttle(() => {
    logs.value = pending.concat(logs.value).slice(0, logRetentionLimit.value)
    pending = []
  }, 500)

  const stopWatch = watch(
    () => [sourceIPLabelList.value, activeBackend.value],
    () => (matchers = createSourceIPMatchers()),
    { deep: true },
  )

  const subscription = driver().logs.subscribe(logLevel.value, (batch: Log[]) => {
    for (const data of batch) {
      if (isPaused.value) {
        seq++
        continue
      }

      let payload = data.payload
      for (const [regex, label] of matchers) {
        payload = payload.replace(regex, label)
      }

      pending.unshift({
        ...data,
        payload,
        time: dayjs().format('HH:mm:ss'),
        seq: seq++,
      })
    }

    flush()
  })

  cancel = () => {
    stopWatch()
    flush.cancel()
    subscription.close()
  }
}

export const stopLogs = () => {
  cancel?.()
  cancel = undefined
  logs.value = []
}
