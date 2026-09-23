import { activeBackend } from '@/store/setup'
import type { Backend, BackendType } from '@/types'
import { clashDriver } from './clash'
import { daeDriver } from './dae'
import { singboxDriver } from './singbox'
import type { Driver } from './types'

const drivers: Record<BackendType, Driver> = {
  clash: clashDriver,
  dae: daeDriver,
  singbox: singboxDriver,
}

export const driverFor = (backend?: Backend | null) =>
  drivers[backend?.type as BackendType] ?? clashDriver

export const driver = () => driverFor(activeBackend.value)

export * from './types'
