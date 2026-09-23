import { i18n } from '@/i18n'

export type ProbeFailureKind = 'unauthorized' | 'http' | 'timeout' | 'network'

export type ProbeResult =
  | { ok: true; latency: number }
  | { ok: false; latency: number; kind: ProbeFailureKind; message: string }

export type ConnectionDiagnosis =
  'offline' | 'corsBlocked' | 'mixedContent' | 'mixedContentOrUnreachable' | 'unreachable'

const DIAGNOSIS_MESSAGE_KEY: Record<ConnectionDiagnosis, string> = {
  offline: 'diagnosisOffline',
  corsBlocked: 'diagnosisCorsBlocked',
  mixedContent: 'diagnosisMixedContent',
  mixedContentOrUnreachable: 'diagnosisMixedContentOrUnreachable',
  unreachable: 'diagnosisUnreachable',
}

export const isOpaqueNetworkError = (message: string) =>
  message.includes('Failed to fetch') ||
  message.includes('Load failed') ||
  message.includes('NetworkError') ||
  message.includes('Network Error')

export const isLoopbackHost = (hostname: string) =>
  hostname === 'localhost' ||
  hostname.endsWith('.localhost') ||
  hostname === '[::1]' ||
  hostname === '::1' ||
  /^127(\.\d{1,3}){3}$/.test(hostname)

const DIAGNOSE_TIMEOUT = 5000

export const diagnoseConnection = async (
  url: string,
  signal?: AbortSignal,
): Promise<ConnectionDiagnosis> => {
  if (!navigator.onLine) return 'offline'

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DIAGNOSE_TIMEOUT)
  const onAbort = () => controller.abort()

  signal?.addEventListener('abort', onAbort, { once: true })

  try {
    await fetch(url, { mode: 'no-cors', cache: 'no-store', signal: controller.signal })
    return 'corsBlocked'
  } catch {
    if (location.protocol === 'https:' && url.startsWith('http:')) {
      try {
        return isLoopbackHost(new URL(url).hostname) ? 'mixedContentOrUnreachable' : 'mixedContent'
      } catch {
        return 'mixedContent'
      }
    }
    return 'unreachable'
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

export const describeProbeFailure = async (
  failure: { kind: ProbeFailureKind; message: string },
  url: string,
  signal?: AbortSignal,
): Promise<string> => {
  const t = i18n.global.t

  switch (failure.kind) {
    case 'unauthorized':
      return t('diagnosisUnauthorized')
    case 'http':
      return `${failure.message} — ${t('diagnosisBadEndpoint')}`
    case 'timeout':
      return t('diagnosisTimeout')
    default: {
      const diagnosis = await diagnoseConnection(url, signal)
      return t(DIAGNOSIS_MESSAGE_KEY[diagnosis])
    }
  }
}

export const describeConnectionError = async (
  message: string,
  url: string,
  signal?: AbortSignal,
): Promise<string> => {
  if (!isOpaqueNetworkError(message)) return message

  const diagnosis = await diagnoseConnection(url, signal)
  return i18n.global.t(DIAGNOSIS_MESSAGE_KEY[diagnosis])
}
