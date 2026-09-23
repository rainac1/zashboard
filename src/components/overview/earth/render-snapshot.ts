import * as THREE from 'three/webgpu'
import type { EarthRenderEndpoint, EarthRenderSnapshot } from './renderer-types'
import type { EarthHostTraffic, EarthRoute } from './types'

const mergeTopHosts = (...groups: readonly EarthHostTraffic[][]) =>
  groups
    .flat()
    .sort((left, right) => right.downloaded - left.downloaded)
    .slice(0, 5)

const cloneRoute = (route: EarthRoute): EarthRoute => ({
  ...route,
  path: route.path.map((point) => ({ ...point })),
  topHosts: route.topHosts.map((host) => ({ ...host })),
})

export const createEarthRenderSnapshot = (incomingRoutes: readonly EarthRoute[]) => {
  const routes = incomingRoutes
    .map(cloneRoute)
    .sort((left, right) => left.key.localeCompare(right.key))
  const signature = routes
    .map(({ direct, key }) => `${key}:${direct ? 'direct' : 'proxy'}`)
    .sort()
    .join('|')
  const endpoints = new Map<string, EarthRenderEndpoint>()

  for (const route of routes) {
    for (const point of route.path) {
      const key = `${point.role}:${point.latitude.toFixed(4)},${point.longitude.toFixed(4)}`
      const existing = endpoints.get(key)

      if (existing) {
        existing.direct &&= route.direct
        existing.connections += route.connections
        if (point.role === 'destination') {
          existing.topHosts = mergeTopHosts(existing.topHosts, route.topHosts)
        }
      } else {
        endpoints.set(key, {
          key,
          direct: route.direct,
          city: point.city,
          country: point.country,
          role: point.role,
          connections: route.connections,
          topHosts: point.role === 'destination' ? [...route.topHosts] : [],
          latitude: point.latitude,
          longitude: point.longitude,
          position: new THREE.Vector3(),
        })
      }
    }
  }

  return {
    signature,
    routes,
    endpoints: [...endpoints.values()],
  } satisfies EarthRenderSnapshot
}
