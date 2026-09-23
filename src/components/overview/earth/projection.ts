import * as THREE from 'three/webgpu'
import { ARC_SEGMENTS, createGreatCircle, EARTH_RADIUS, toEarthVector } from './earth-math'
import type { EarthLocation, EarthSample } from './types'

export type EarthProjection = '3d' | '2d'

export interface EarthView {
  projection: EarthProjection
  centerLongitude: number
}

export const wrapLongitude = (degrees: number) => ((((degrees + 180) % 360) + 360) % 360) - 180

export const PLANE_HALF_WIDTH = 2
export const PLANE_HALF_HEIGHT = 1
export const PLANE_EDGE_EXTENSION = PLANE_HALF_WIDTH
export const PLANE_ALTITUDE_SCALE = 2.5

const PLANE_ARC_BULGE = 0.14
const PLANE_ARC_MAX_BULGE = 0.45
const PLANE_ARC_BASE_LIFT = 0.006
const PLANE_ARC_PEAK_LIFT = 0.02

const spherePosition = new THREE.Vector3()
const planePosition = new THREE.Vector3()

export const projectEarthSample = (
  sample: EarthSample,
  morph: number,
  target = new THREE.Vector3(),
) => {
  spherePosition.copy(toEarthVector(sample)).multiplyScalar(sample.altitude)

  if (morph <= 0) return target.copy(spherePosition)

  planePosition.set(
    (sample.longitude / 180) * PLANE_HALF_WIDTH,
    (sample.latitude / 90) * PLANE_HALF_HEIGHT,
    (sample.altitude - EARTH_RADIUS) * PLANE_ALTITUDE_SCALE,
  )

  if (morph >= 1) return target.copy(planePosition)

  return target.lerpVectors(spherePosition, planePosition, morph)
}

export const projectionMorph = (projection: EarthProjection) => (projection === '2d' ? 1 : 0)

type ArcEnd = Pick<EarthLocation, 'latitude' | 'longitude'>

export const toLocalSample = (
  location: ArcEnd,
  altitude: number,
  view: EarthView,
): EarthSample => ({
  latitude: location.latitude,
  longitude: wrapLongitude(location.longitude - view.centerLongitude),
  altitude,
})

const createPlaneArc = (from: EarthSample, to: EarthSample) => {
  const start = projectEarthSample(from, 1)
  const end = projectEarthSample(to, 1)
  const chordX = end.x - start.x
  const chordY = end.y - start.y
  const chordLength = Math.hypot(chordX, chordY)
  const bulge = Math.min(PLANE_ARC_MAX_BULGE, chordLength * PLANE_ARC_BULGE)
  const scale = chordLength || 1
  const normalX = -chordY / scale
  const normalY = chordX / scale
  const flip = normalY < 0 ? -1 : 1
  const controlX = (start.x + end.x) / 2 + normalX * flip * bulge
  const controlY = (start.y + end.y) / 2 + normalY * flip * bulge
  const points: THREE.Vector3[] = []

  for (let index = 0; index <= ARC_SEGMENTS; index += 1) {
    const progress = index / ARC_SEGMENTS
    const inverse = 1 - progress
    const startWeight = inverse * inverse
    const controlWeight = 2 * inverse * progress
    const endWeight = progress * progress

    points.push(
      new THREE.Vector3(
        startWeight * start.x + controlWeight * controlX + endWeight * end.x,
        startWeight * start.y + controlWeight * controlY + endWeight * end.y,
        PLANE_ARC_BASE_LIFT + Math.sin(Math.PI * progress) * PLANE_ARC_PEAK_LIFT,
      ),
    )
  }

  return points
}

export const createRouteArc = (from: ArcEnd, to: ArcEnd, view: EarthView) => {
  const localFrom = toLocalSample(from, EARTH_RADIUS, view)
  const localTo = toLocalSample(to, EARTH_RADIUS, view)

  return view.projection === '2d'
    ? createPlaneArc(localFrom, localTo)
    : createGreatCircle(localFrom, localTo)
}

export const easeMorph = (progress: number) => {
  const clamped = THREE.MathUtils.clamp(progress, 0, 1)

  return clamped < 0.5 ? 4 * clamped * clamped * clamped : 1 - Math.pow(-2 * clamped + 2, 3) / 2
}
