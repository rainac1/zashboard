import type { ProbeResult } from '@/helper/connectivity'
import type { Backend } from '@/types'
import { driverFor } from './driver'

export const probeBackend = (
  backend: Backend,
  timeout: number = 10000,
  signal?: AbortSignal,
): Promise<ProbeResult> => driverFor(backend).system.probe(backend, timeout, signal)

export const isBackendAvailable = (backend: Backend, timeout: number = 10000) =>
  probeBackend(backend, timeout).then((result) => result.ok)
