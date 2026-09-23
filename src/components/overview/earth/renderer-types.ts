import type * as THREE from 'three/webgpu'
import type { EarthProjection } from './projection'
import type { EarthEndpointInfo, EarthLocation, EarthRoute } from './types'

export type EarthColorScheme = 'dark' | 'light'
export type EarthVisualMode = 'flat' | 'space'

export interface EarthRendererOptions {
  reducedMotion: boolean
  projection: EarthProjection
  visualMode: EarthVisualMode
  colorScheme: EarthColorScheme
  onEndpointHover: (info: EarthEndpointInfo | null, x?: number, y?: number) => void
}

export interface EarthRenderer {
  setRoutes: (routes: EarthRoute[]) => void
  setInitialLocation: (location: EarthLocation) => void
  setReducedMotion: (reduced: boolean) => void
  setAutoRotation: (enabled: boolean) => void
  setCityLabelsVisible: (visible: boolean) => void
  setProjection: (projection: EarthProjection) => void
  setVisualMode: (mode: EarthVisualMode) => void
  setColorScheme: (scheme: EarthColorScheme) => void
  dispose: () => void
}

export interface EarthRenderEndpoint extends EarthEndpointInfo {
  key: string
  direct: boolean
  latitude: number
  longitude: number
  position: THREE.Vector3
}

export interface EarthRenderSnapshot {
  signature: string
  routes: readonly EarthRoute[]
  endpoints: readonly EarthRenderEndpoint[]
}
