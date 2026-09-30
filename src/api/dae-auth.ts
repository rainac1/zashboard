import { useStorage } from '@/composables/use-storage'
import { getUrlFromBackend } from '@/helper/utils'
import type { Backend, DaeAuthSession, DaeDiscovery } from '@/types'

type Endpoint = Omit<Backend, 'uuid'>

const V1 = '/api/v1'
const EXPIRY_MARGIN = 30000

const sessions = useStorage<Record<string, DaeAuthSession>>('setup/dae-sessions', {})
const pending = new Map<string, Promise<string>>()

export class DaeAuthError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export const isDaePasswordMode = (backend: Endpoint) => backend.type === 'dae' && !!backend.username

const sessionKey = (backend: Endpoint) => `${getUrlFromBackend(backend)}|${backend.username}`

const liveToken = (backend: Endpoint) => {
  const session = sessions.value[sessionKey(backend)]

  if (!session || Date.parse(session.expires_at) - EXPIRY_MARGIN <= Date.now()) return ''

  return session.token
}

export const daeBearer = (backend: Endpoint) =>
  isDaePasswordMode(backend) ? liveToken(backend) : backend.password

const readError = async (res: Response) => {
  const data = await res.json().catch(() => null)

  return new DaeAuthError(
    data?.error?.code ?? 'http',
    res.status,
    data?.error?.message ?? `HTTP ${res.status}`,
  )
}

export const fetchDaeDiscovery = async (backend: Endpoint, signal?: AbortSignal) => {
  const res = await fetch(`${getUrlFromBackend(backend)}/api`, { signal })

  if (!res.ok) throw await readError(res)

  return (await res.json()) as DaeDiscovery
}

const openSession = async (backend: Endpoint, allowSetup: boolean) => {
  const discovery = await fetchDaeDiscovery(backend)

  if (discovery.auth.mode !== 'password') {
    throw new DaeAuthError('token_mode', 0, 'dae: backend is not in password mode')
  }

  if (discovery.auth.setup_required && !allowSetup) {
    throw new DaeAuthError('setup_required', 409, 'dae: administrator setup is required')
  }

  const action = discovery.auth.setup_required ? 'setup' : 'login'
  const res = await fetch(`${getUrlFromBackend(backend)}${V1}/auth/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: backend.username, password: backend.password }),
  })

  if (!res.ok) throw await readError(res)

  const session = (await res.json()) as DaeAuthSession

  sessions.value = { ...sessions.value, [sessionKey(backend)]: session }

  return session.token
}

export const ensureDaeSession = (
  backend: Endpoint,
  force = false,
  allowSetup = false,
): Promise<string> => {
  if (!isDaePasswordMode(backend)) return Promise.resolve(backend.password)

  const key = sessionKey(backend)
  const running = pending.get(key)

  if (running) return running

  const token = force ? '' : liveToken(backend)

  if (token) return Promise.resolve(token)

  const task = openSession(backend, allowSetup).finally(() => pending.delete(key))

  pending.set(key, task)

  return task
}

export const dropDaeSession = (backend: Endpoint) => {
  const key = sessionKey(backend)

  if (!(key in sessions.value)) return

  const next = { ...sessions.value }

  delete next[key]
  sessions.value = next
}

export const daeAuthHeaders = async (backend: Endpoint): Promise<Record<string, string>> => {
  const token = await ensureDaeSession(backend)

  return token ? { Authorization: `Bearer ${token}` } : {}
}

export const logoutDae = async (backend: Endpoint) => {
  if (!isDaePasswordMode(backend)) return

  const token = liveToken(backend)

  dropDaeSession(backend)

  if (!token) return

  await fetch(`${getUrlFromBackend(backend)}${V1}/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => undefined)
}
