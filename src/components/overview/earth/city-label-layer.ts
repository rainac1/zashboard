import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DObject, type CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import * as THREE from 'three/webgpu'
import type { EarthView } from './projection'
import type { EarthRenderEndpoint } from './renderer-types'

const CITY_LABEL_CLASS_NAME =
  'pointer-events-none whitespace-nowrap rounded-md bg-base-100/80 px-1.5 py-1 text-[10px] font-semibold leading-none text-base-content shadow-sm backdrop-blur-sm'
const CITY_LABEL_COLLISION_GAP = 4
const CITY_LABEL_MIN_BUDGET = 3
const CITY_LABEL_MAX_BUDGET = 64
const CITY_LABEL_AREA_PER_ITEM = 5_500
const CITY_LABEL_FALLBACK_HEIGHT = 18

interface ProjectedCityLabel {
  endpoint: EarthRenderEndpoint
  label: CSS2DObject
  left: number
  right: number
  top: number
  bottom: number
}

interface CityLabelLayerOptions {
  parent: THREE.Object3D
  camera: THREE.Camera
  controls: OrbitControls
  labelRenderer: CSS2DRenderer
  view: EarthView
}

export interface CityLabelLayer {
  setEndpoints: (endpoints: readonly EarthRenderEndpoint[]) => void
  setView: (view: EarthView) => void
  setVisible: (visible: boolean) => void
  updateVisibility: () => void
  dispose: () => void
}

export const createCityLabelLayer = (options: CityLabelLayerOptions): CityLabelLayer => {
  const { camera, controls, parent, labelRenderer } = options
  const labelGroup = new THREE.Group()
  parent.add(labelGroup)

  const labels = new Map<string, CSS2DObject>()
  let endpoints: readonly EarthRenderEndpoint[] = []
  let view = options.view
  let disposed = false
  const cameraWorldPosition = new THREE.Vector3()
  const earthWorldPosition = new THREE.Vector3()
  const labelWorldPosition = new THREE.Vector3()
  const labelSurfaceNormal = new THREE.Vector3()
  const labelToCamera = new THREE.Vector3()
  const projectedLabelPosition = new THREE.Vector3()

  const fallbackLabelWidth = (text: string) =>
    12 +
    Array.from(text).reduce(
      (width, character) => width + (character.codePointAt(0)! > 0xff ? 10 : 6),
      0,
    )

  const labelsOverlap = (left: ProjectedCityLabel, right: ProjectedCityLabel) =>
    left.left < right.right + CITY_LABEL_COLLISION_GAP &&
    left.right + CITY_LABEL_COLLISION_GAP > right.left &&
    left.top < right.bottom + CITY_LABEL_COLLISION_GAP &&
    left.bottom + CITY_LABEL_COLLISION_GAP > right.top

  const syncLabels = () => {
    const visibleKeys = new Set<string>()

    for (const endpoint of endpoints) {
      const city = endpoint.city.trim()

      if (!city) continue

      visibleKeys.add(endpoint.key)
      let label = labels.get(endpoint.key)

      if (!label) {
        const element = document.createElement('div')
        element.className = CITY_LABEL_CLASS_NAME
        label = new CSS2DObject(element)
        label.center.set(0.5, 1.5)
        label.renderOrder = 7
        labels.set(endpoint.key, label)
        labelGroup.add(label)
      }

      label.element.textContent = city
      label.position.copy(endpoint.position)
    }

    for (const [key, label] of labels) {
      if (visibleKeys.has(key)) continue
      labelGroup.remove(label)
      labels.delete(key)
    }
  }

  const updateVisibility = () => {
    if (disposed) return

    camera.updateWorldMatrix(true, false)
    parent.updateWorldMatrix(true, true)
    camera.getWorldPosition(cameraWorldPosition)
    parent.getWorldPosition(earthWorldPosition)

    const width = labelRenderer.domElement.clientWidth
    const height = labelRenderer.domElement.clientHeight
    const candidates: ProjectedCityLabel[] = []

    for (const endpoint of endpoints) {
      const label = labels.get(endpoint.key)

      if (!label) continue
      label.visible = false
      label.getWorldPosition(labelWorldPosition)

      if (view.projection === '3d') {
        labelSurfaceNormal.subVectors(labelWorldPosition, earthWorldPosition).normalize()
        labelToCamera.subVectors(cameraWorldPosition, labelWorldPosition)

        if (labelSurfaceNormal.dot(labelToCamera) <= 0) continue
      }

      projectedLabelPosition.copy(labelWorldPosition).project(camera)
      if (
        projectedLabelPosition.z < -1 ||
        projectedLabelPosition.z > 1 ||
        projectedLabelPosition.x < -1 ||
        projectedLabelPosition.x > 1 ||
        projectedLabelPosition.y < -1 ||
        projectedLabelPosition.y > 1
      ) {
        continue
      }

      const x = (projectedLabelPosition.x * 0.5 + 0.5) * width
      const y = (-projectedLabelPosition.y * 0.5 + 0.5) * height
      const elementBounds = label.element.getBoundingClientRect()
      const labelWidth = elementBounds.width || fallbackLabelWidth(endpoint.city)
      const labelHeight = elementBounds.height || CITY_LABEL_FALLBACK_HEIGHT

      candidates.push({
        endpoint,
        label,
        left: x - labelWidth * label.center.x,
        right: x + labelWidth * (1 - label.center.x),
        top: y - labelHeight * label.center.y,
        bottom: y + labelHeight * (1 - label.center.y),
      })
    }

    candidates.sort(
      (left, right) =>
        Number(right.endpoint.role === 'origin') - Number(left.endpoint.role === 'origin') ||
        right.endpoint.connections - left.endpoint.connections ||
        left.endpoint.key.localeCompare(right.endpoint.key),
    )

    const cameraDistance = camera.position.distanceTo(controls.target)
    const zoom =
      1 -
      THREE.MathUtils.clamp(
        (cameraDistance - controls.minDistance) / (controls.maxDistance - controls.minDistance),
        0,
        1,
      )
    const viewportBudget = THREE.MathUtils.clamp(
      Math.floor((width * height) / CITY_LABEL_AREA_PER_ITEM),
      CITY_LABEL_MIN_BUDGET,
      CITY_LABEL_MAX_BUDGET,
    )
    const labelBudget = Math.round(
      THREE.MathUtils.lerp(CITY_LABEL_MIN_BUDGET, viewportBudget, zoom * zoom),
    )
    const accepted: ProjectedCityLabel[] = []

    for (const candidate of candidates) {
      if (accepted.length >= labelBudget) break
      if (accepted.some((visibleLabel) => labelsOverlap(candidate, visibleLabel))) continue

      candidate.label.visible = true
      accepted.push(candidate)
    }
  }

  return {
    setEndpoints(nextEndpoints) {
      if (disposed) return
      endpoints = nextEndpoints
      syncLabels()
    },
    setView(nextView) {
      if (disposed) return
      view = nextView
      syncLabels()
    },
    setVisible(visible) {
      if (disposed) return
      labelGroup.visible = visible
    },
    updateVisibility,
    dispose() {
      if (disposed) return
      disposed = true
      parent.remove(labelGroup)
      labelGroup.clear()
      labels.clear()
      endpoints = []
    },
  }
}
