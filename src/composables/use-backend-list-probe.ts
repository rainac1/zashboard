import { probeBackend } from '@/assembly/probe'
import { backendProbe } from '@/assembly/version'
import type { ReachabilityStatus } from '@/composables/use-backend-reachability'
import { backendList } from '@/store/setup'
import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'

const PROBE_TIMEOUT = 8000

export type BackendProbeState = {
  status: ReachabilityStatus
  latency: number
}

export const useBackendListProbe = (enabled: Ref<boolean>) => {
  const results = ref<Record<string, BackendProbeState>>({})

  let controller: AbortController | null = null
  let generation = 0

  const cancel = () => {
    controller?.abort()
    controller = null
  }

  const run = () => {
    cancel()

    const current = ++generation
    controller = new AbortController()
    const signal = controller.signal
    const targets = backendList.value

    results.value = Object.fromEntries(
      targets.map((backend) => [backend.uuid, { status: 'checking' as const, latency: 0 }]),
    )

    targets.forEach(async (backend) => {
      const result = await probeBackend(backend, PROBE_TIMEOUT, signal)

      if (current !== generation) return

      results.value[backend.uuid] = result.ok
        ? { status: 'online', latency: result.latency }
        : { status: 'offline', latency: 0 }
    })
  }

  watch(
    enabled,
    (isEnabled) => {
      if (isEnabled) {
        run()
      } else {
        cancel()
        generation++
      }
    },
    { immediate: true },
  )

  onScopeDispose(cancel)

  const stateOf = computed(() => (uuid: string): BackendProbeState => {
    const probe = backendProbe.value

    if (probe?.uuid === uuid) {
      if (probe.status === 'connected') return { status: 'online', latency: probe.latency }
      if (probe.status === 'failed') return { status: 'offline', latency: 0 }
      return { status: 'checking', latency: 0 }
    }

    return results.value[uuid] ?? { status: 'idle', latency: 0 }
  })

  return { stateOf, refresh: run }
}
