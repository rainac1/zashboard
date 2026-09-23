import { probeBackend } from '@/assembly/probe'
import { describeProbeFailure } from '@/helper/connectivity'
import { getBackendProbeUrl } from '@/helper/utils'
import type { Backend } from '@/types'
import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'

export type ReachabilityStatus = 'idle' | 'checking' | 'online' | 'offline'

const DEBOUNCE_DELAY = 400
const PROBE_TIMEOUT = 8000

type ReachabilityTarget = Omit<Backend, 'uuid'> | null | undefined

export const useBackendReachability = (form: Ref<ReachabilityTarget>) => {
  const status = ref<ReachabilityStatus>('idle')
  const latency = ref(0)
  const message = ref('')

  const target = computed(() => {
    const value = form.value
    if (!value?.protocol || !value.host || !value.port) return null
    return value
  })

  const identity = computed(() => {
    const backend = target.value
    if (!backend) return ''
    return [
      backend.type,
      backend.protocol,
      backend.host,
      backend.port,
      backend.secondaryPath || '',
      backend.password || '',
    ].join('|')
  })

  let controller: AbortController | null = null
  let debounceTimer = -1
  let generation = 0

  const cancel = () => {
    clearTimeout(debounceTimer)
    controller?.abort()
    controller = null
  }

  const run = async () => {
    const backend = target.value
    if (!backend) return

    const current = ++generation
    controller = new AbortController()
    const signal = controller.signal

    const result = await probeBackend({ uuid: '', ...backend }, PROBE_TIMEOUT, signal)

    if (current !== generation) return

    if (result.ok) {
      status.value = 'online'
      latency.value = result.latency
      message.value = ''
      return
    }

    const detail = await describeProbeFailure(result, getBackendProbeUrl(backend), signal)

    if (current !== generation) return

    status.value = 'offline'
    latency.value = 0
    message.value = detail
  }

  const schedule = (immediate = false) => {
    cancel()

    if (!target.value) {
      generation++
      status.value = 'idle'
      latency.value = 0
      message.value = ''
      return
    }

    status.value = 'checking'
    message.value = ''
    debounceTimer = setTimeout(run, immediate ? 0 : DEBOUNCE_DELAY)
  }

  watch(identity, () => schedule(), { immediate: false })
  schedule(true)

  onScopeDispose(cancel)

  return {
    status,
    latency,
    message,
    retry: () => schedule(true),
  }
}
