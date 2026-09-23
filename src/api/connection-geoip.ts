import type { IPInfo } from '@/api/geoip'
import { ref, shallowRef } from 'vue'

type GeoIPLookup = (ip: string) => IPInfo

const EMPTY_GEOIP_INFO: IPInfo = {
  ip: '',
  country: '',
  region: '',
  city: '',
  asn: '',
  organization: '',
  latitude: null,
  longitude: null,
}

const enabled = ref(false)
const lookup = shallowRef<GeoIPLookup>()
let loadPromise: Promise<void> | undefined

const loadLookup = () => {
  if (lookup.value || loadPromise) {
    return
  }

  const currentLoad = import('./connection-geoip-database')
    .then((module) => {
      lookup.value = module.getConnectionGeoIPInfoSync
    })
    .catch(() => {
      if (loadPromise === currentLoad) {
        loadPromise = undefined
      }
    })

  loadPromise = currentLoad
}

export const setConnectionGeoIPEnabled = (value: boolean) => {
  enabled.value = value

  if (value) {
    loadLookup()
  }
}

export const getConnectionGeoIPInfoSync = (ip: string): IPInfo => {
  if (!enabled.value || !lookup.value) {
    return EMPTY_GEOIP_INFO
  }

  return lookup.value(ip)
}
