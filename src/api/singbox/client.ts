import { StartedService } from '@/gen/daemon/started_service_pb'
import type { ProbeResult } from '@/helper/connectivity'
import { getSingboxSecret, getSingboxUrlFromBackend } from '@/helper/utils'
import { activeBackend } from '@/store/setup'
import type { Backend } from '@/types'
import {
  Code,
  ConnectError,
  createClient,
  type Client,
  type Interceptor,
} from '@connectrpc/connect'
import { createGrpcWebTransport } from '@connectrpc/connect-web'

const authInterceptor = (secret: string): Interceptor => {
  return (next) => (request) => {
    if (secret) request.header.set('Authorization', `Bearer ${secret}`)
    return next(request)
  }
}

export class SingboxClient {
  readonly client: Client<typeof StartedService>

  constructor(baseUrl: string, secret: string) {
    this.client = createClient(
      StartedService,
      createGrpcWebTransport({
        baseUrl,
        interceptors: secret ? [authInterceptor(secret)] : [],
      }),
    )
  }
}

// --- Singleton manager keyed to the active backend's sing-box channel ---

let current: { key: string; client: SingboxClient } | null = null

const backendKey = (backend: Backend) =>
  `${backend.uuid}|${getSingboxUrlFromBackend(backend)}|${getSingboxSecret(backend)}`

export const getSingboxClient = (): SingboxClient | null => {
  const backend = activeBackend.value
  const baseUrl = backend ? getSingboxUrlFromBackend(backend) : ''
  if (!backend || !baseUrl) {
    current = null
    return null
  }
  const key = backendKey(backend)
  if (current?.key === key) return current.client
  current = { key, client: new SingboxClient(baseUrl, getSingboxSecret(backend)) }
  return current.client
}

// 连通性探测。与 Clash 通道同形(见 api/clash.ts 的 probeClashChannel):
// 打的是面板实际在用的 gRPC getVersion,失败时把能确知的分类挑出来。
export const probeSingboxChannel = async (
  backend: Backend,
  timeout = 10000,
  signal?: AbortSignal,
): Promise<ProbeResult> => {
  const startAt = Date.now()
  const latency = () => Date.now() - startAt
  const baseUrl = getSingboxUrlFromBackend(backend)

  if (!baseUrl) {
    return { ok: false, latency: 0, kind: 'http', message: 'Invalid sing-box API address' }
  }

  const secret = getSingboxSecret(backend)
  const client = createClient(
    StartedService,
    createGrpcWebTransport({
      baseUrl,
      interceptors: secret ? [authInterceptor(secret)] : [],
    }),
  )
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  const onAbort = () => controller.abort()

  signal?.addEventListener('abort', onAbort, { once: true })

  try {
    await client.getVersion({}, { signal: controller.signal })
    return { ok: true, latency: latency() }
  } catch (e) {
    const code = e instanceof ConnectError ? e.code : undefined

    if (code === Code.Unauthenticated || code === Code.PermissionDenied) {
      return { ok: false, latency: latency(), kind: 'unauthorized', message: 'Unauthenticated' }
    }

    if (controller.signal.aborted || code === Code.DeadlineExceeded) {
      return { ok: false, latency: latency(), kind: 'timeout', message: 'Timeout' }
    }

    // Unimplemented 意味着地址连得上、但对面不是 sing-box API(或路径不对)。
    return {
      ok: false,
      latency: latency(),
      kind: code === Code.Unimplemented ? 'http' : 'network',
      message: e instanceof Error ? e.message : String(e),
    }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}
