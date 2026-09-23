import {
  createDaeNodeAPI,
  createDaeProviderAPI,
  deleteDaeNodeAPI,
  deleteDaeProviderAPI,
  fetchDaeRuntimeAPI,
  patchDaeGroupAPI,
  resumeDaeAPI,
  suspendDaeAPI,
} from '@/api/dae'
import type { DaeJsonPatchOperation } from '@/types'
import {
  acquireRuntime,
  daeGroupDetails,
  daeNodeList,
  daeProviderList,
  runtimeSample,
} from './driver/dae'
import { fetchProxies } from './proxies'

export {
  deleteDaeDnsCacheEntryAPI as deleteDaeDnsCacheEntry,
  deleteDaeDnsCacheNameAPI as deleteDaeDnsCacheName,
  fetchDaeConfigAPI as fetchDaeConfig,
  fetchDaeConfigSourceAPI as fetchDaeConfigSource,
  fetchDaeDatapathAPI as fetchDaeDatapath,
  fetchDaeDnsCacheAPI as fetchDaeDnsCache,
  fetchDaeDnsLogAPI as fetchDaeDnsLog,
  fetchDaeFlowAPI as fetchDaeFlow,
  fetchDaeRuntimeSettingsAPI as fetchDaeRuntimeSettings,
  patchDaeRuntimeSettingsAPI as patchDaeRuntimeSettings,
  saveDaeConfigSourceAPI as saveDaeConfigSource,
  traceDaeRoutingAPI as traceDaeRouting,
  validateDaeConfigAPI as validateDaeConfig,
} from '@/api/dae'

export { daeGroupDetails, daeNodeList, daeProviderList }

export const daeRuntime = runtimeSample

export const subscribeDaeRuntime = acquireRuntime

export const fetchDaeRuntime = async () => {
  daeRuntime.value = await fetchDaeRuntimeAPI()

  return daeRuntime.value
}

const withProxiesRefresh = async <T>(request: Promise<T>) => {
  const result = await request

  await fetchProxies()

  return result
}

export const createDaeNode = (name: string, link: string) =>
  withProxiesRefresh(createDaeNodeAPI(name, link))

export const deleteDaeNode = (nodeId: string) => withProxiesRefresh(deleteDaeNodeAPI(nodeId))

export const createDaeProvider = (name: string, url: string) =>
  withProxiesRefresh(createDaeProviderAPI(name, url))

export const deleteDaeProvider = (providerId: string) =>
  withProxiesRefresh(deleteDaeProviderAPI(providerId))

export const patchDaeGroup = async (
  groupId: string,
  revision: string,
  operations: DaeJsonPatchOperation[],
) => {
  await withProxiesRefresh(patchDaeGroupAPI(groupId, revision, operations))
}

export const suspendDae = async () => {
  await suspendDaeAPI()
  await fetchDaeRuntime()
}

export const resumeDae = async () => {
  await resumeDaeAPI()
  await fetchDaeRuntime()
  await fetchProxies()
}
