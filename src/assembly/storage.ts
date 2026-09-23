import { can } from './backend'
import { driver } from './driver'
import { coreReady } from './version'

export const getSyncedSettings = async () => {
  await coreReady()

  if (!can('syncSettings')) return Promise.reject<Record<string, unknown>>('unsupported')

  return driver().system.getStorage()
}

export const setSyncedSettings = async (value: Record<string, string>) => {
  await coreReady()

  return can('syncSettings') ? driver().system.setStorage(value) : undefined
}

export const deleteSyncedSettings = async () => {
  await coreReady()

  return can('syncSettings') ? driver().system.deleteStorage() : undefined
}
