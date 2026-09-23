import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import * as THREE from 'three/webgpu'
import { createCityLabelLayer } from './city-label-layer'
import { getRealtimeSunDirection, toEarthVector } from './earth-math'
import { createEndpointLayer } from './endpoint-layer'
import { createGlobeLayer } from './globe-layer'
import {
  easeMorph,
  PLANE_HALF_HEIGHT,
  PLANE_HALF_WIDTH,
  projectionMorph,
  toLocalSample,
  type EarthProjection,
  type EarthView,
} from './projection'
import { createEarthRenderSnapshot } from './render-snapshot'
import type { EarthRenderer as EarthRendererContract, EarthRendererOptions } from './renderer-types'
import { createRouteLayer } from './route-layer'
import type { EarthLocation } from './types'

export type { EarthRenderer } from './renderer-types'

const MAX_INITIAL_LATITUDE = 15
const ORBIT_MIN_DISTANCE = 2.65
const ORBIT_MAX_DISTANCE = 7.5
const MORPH_DURATION = 0.8
const MAP_FIT_MARGIN = 1.05
const MAP_DEFAULT_ZOOM = 1.2

type Cleanup = () => void

const runCleanups = (cleanups: Cleanup[]) => {
  let firstError: unknown

  while (cleanups.length > 0) {
    try {
      cleanups.pop()!()
    } catch (error) {
      firstError ??= error
    }
  }

  if (firstError) throw firstError
}

export const createEarthRenderer = async (
  container: HTMLElement,
  options: EarthRendererOptions,
): Promise<EarthRendererContract> => {
  const cleanups: Cleanup[] = []
  let disposed = false
  const registerCleanup = (cleanup: Cleanup) => cleanups.push(cleanup)
  const disposeResources = () => {
    if (disposed) return
    disposed = true
    runCleanups(cleanups)
  }

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100)
  camera.position.set(3.7, 1.55, 3.2)

  const renderer = new THREE.WebGPURenderer({ alpha: true, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.domElement.className = 'h-full w-full cursor-grab active:cursor-grabbing'
  renderer.domElement.style.display = 'block'

  try {
    container.appendChild(renderer.domElement)
    registerCleanup(() => {
      renderer.setAnimationLoop(null)
      try {
        renderer.dispose()
      } finally {
        renderer.domElement.remove()
      }
    })
    await renderer.init()

    const labelRenderer = new CSS2DRenderer()
    labelRenderer.sortObjects = false
    labelRenderer.domElement.className = 'pointer-events-none absolute inset-0 overflow-hidden'
    labelRenderer.domElement.setAttribute('aria-hidden', 'true')
    container.appendChild(labelRenderer.domElement)
    registerCleanup(() => labelRenderer.domElement.remove())

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.rotateSpeed = 0.55
    controls.zoomSpeed = 0.75
    renderer.domElement.style.touchAction = 'none'
    registerCleanup(() => controls.dispose())

    const earthGroup = new THREE.Group()
    scene.add(earthGroup)
    registerCleanup(() => scene.remove(earthGroup))

    const overlayGroup = new THREE.Group()
    earthGroup.add(overlayGroup)
    registerCleanup(() => earthGroup.remove(overlayGroup))

    let reducedMotion = options.reducedMotion
    let projection = options.projection
    let view: EarthView = { projection, centerLongitude: 0 }
    let visualMode = options.visualMode
    let colorScheme = options.colorScheme
    let autoRotation = true
    let initialLocationSet = false
    let pendingInitialLocation: EarthLocation | null = null
    let visible = !document.hidden
    let intersecting = true
    let pinnedEndpoint = false
    let currentSignature = ''
    let morph = projectionMorph(projection)
    let morphFrom = morph
    let morphTo = morph
    let morphElapsed = 0
    let morphing = false
    let rotationFrom = 0
    let rotationTo = 0
    let orbitRotation = 0
    const cameraFrom = new THREE.Vector3()
    const cameraTo = new THREE.Vector3()
    const targetFrom = new THREE.Vector3()
    const orbitCameraPosition = camera.position.clone()
    const clock = new THREE.Clock()
    const sunDirection = getRealtimeSunDirection()

    const globeLayer = await createGlobeLayer({
      scene,
      earthGroup,
      renderer,
      visualMode,
      colorScheme,
      sunDirection,
    })
    registerCleanup(() => globeLayer.dispose())

    const routeLayer = createRouteLayer({
      parent: overlayGroup,
      view,
      visualMode,
      colorScheme,
    })
    registerCleanup(() => routeLayer.dispose())

    const endpointLayer = createEndpointLayer({
      parent: overlayGroup,
      camera,
      view,
      visualMode,
      sunDirection,
    })
    registerCleanup(() => endpointLayer.dispose())

    const cityLabelLayer = createCityLabelLayer({
      parent: overlayGroup,
      camera,
      controls,
      labelRenderer,
      view,
    })
    registerCleanup(() => cityLabelLayer.dispose())

    const mapDistance = () => {
      const halfFov = THREE.MathUtils.degToRad(camera.fov) / 2
      const fitHeight = PLANE_HALF_HEIGHT / Math.tan(halfFov)
      const fitWidth = PLANE_HALF_WIDTH / (Math.tan(halfFov) * camera.aspect)

      return Math.max(fitHeight, fitWidth) * MAP_FIT_MARGIN
    }

    const mapViewDistance = () => mapDistance() / MAP_DEFAULT_ZOOM

    const applyControls = () => {
      if (projection === '2d') {
        const distance = mapDistance()

        controls.enableRotate = false
        controls.enablePan = true
        controls.screenSpacePanning = true
        controls.mouseButtons.LEFT = THREE.MOUSE.PAN
        controls.touches.ONE = THREE.TOUCH.PAN
        controls.touches.TWO = THREE.TOUCH.DOLLY_PAN
        controls.minDistance = distance * 0.35
        controls.maxDistance = distance * 1.15
      } else {
        controls.enableRotate = true
        controls.enablePan = false
        controls.screenSpacePanning = false
        controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE
        controls.touches.ONE = THREE.TOUCH.ROTATE
        controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE
        controls.minDistance = ORBIT_MIN_DISTANCE
        controls.maxDistance = ORBIT_MAX_DISTANCE
      }
    }

    const applyView = () => {
      routeLayer.setView(view)
      endpointLayer.setView(view)
      cityLabelLayer.setView(view)
    }

    const applyInitialLocation = (location: EarthLocation) => {
      const distance = camera.position.distanceTo(controls.target)
      const local = toLocalSample(location, 1, view)
      const direction = toEarthVector({
        latitude: THREE.MathUtils.clamp(
          local.latitude,
          -MAX_INITIAL_LATITUDE,
          MAX_INITIAL_LATITUDE,
        ),
        longitude: local.longitude,
      })
        .applyQuaternion(earthGroup.quaternion)
        .normalize()

      camera.position.copy(controls.target).addScaledVector(direction, distance)
      controls.update()
    }

    const render = () => {
      if (!disposed && visible && intersecting) {
        cityLabelLayer.updateVisibility()
        renderer.render(scene, camera)
        labelRenderer.render(scene, camera)
      }
    }

    const finishMorph = () => {
      morphing = false
      morph = morphTo
      morphElapsed = 0
      globeLayer.setMorph(morph)
      earthGroup.rotation.y = rotationTo

      applyView()

      controls.target.set(0, 0, 0)
      applyControls()
      camera.position.copy(cameraTo)
      camera.lookAt(controls.target)
      controls.enabled = true
      controls.update()
      overlayGroup.visible = true

      if (projection === '3d' && pendingInitialLocation) {
        const location = pendingInitialLocation
        pendingInitialLocation = null
        applyInitialLocation(location)
      }
    }

    const advanceMorph = (delta: number) => {
      morphElapsed += delta

      const progress = Math.min(1, morphElapsed / MORPH_DURATION)
      const eased = easeMorph(progress)

      morph = THREE.MathUtils.lerp(morphFrom, morphTo, eased)
      globeLayer.setMorph(morph)
      earthGroup.rotation.y = THREE.MathUtils.lerp(rotationFrom, rotationTo, eased)
      controls.target.copy(targetFrom).multiplyScalar(1 - eased)
      camera.position.lerpVectors(cameraFrom, cameraTo, eased)
      camera.lookAt(controls.target)

      if (progress >= 1) finishMorph()
    }

    const animate = () => {
      if (disposed) return

      const elapsed = clock.getDelta()
      const delta = Math.min(0.05, elapsed)

      if (morphing) {
        advanceMorph(delta)
      } else {
        if (autoRotation && projection === '3d') earthGroup.rotation.y += delta * 0.025
        controls.update(delta)
      }

      endpointLayer.update(delta)
      if (visualMode === 'space' && morph === 0) globeLayer.syncSunLight()
      routeLayer.update(elapsed)

      render()
    }

    const updateSunForTime = () => {
      getRealtimeSunDirection(new Date(), sunDirection, view.centerLongitude)
      globeLayer.setSunDirection(sunDirection)
      endpointLayer.setSunDirection(sunDirection)
    }

    const updateAnimationLoop = () => {
      if (disposed) return

      renderer.setAnimationLoop(null)
      clock.stop()

      if (morphing && (reducedMotion || !visible || !intersecting)) finishMorph()

      if (!visible || !intersecting) return

      if (visualMode === 'space' && morph === 0) updateSunForTime()

      if (reducedMotion) {
        controls.enableDamping = false
        render()
      } else {
        controls.enableDamping = true
        clock.start()
        renderer.setAnimationLoop(animate)
      }
    }

    const startMorph = (next: EarthProjection) => {
      if (projection === '3d' && !morphing) {
        orbitCameraPosition.copy(camera.position)
        orbitRotation = earthGroup.rotation.y
      }

      projection = next
      view = { ...view, projection: next }
      morphFrom = morph
      morphTo = projectionMorph(next)
      morphElapsed = 0
      morphing = true
      rotationFrom = earthGroup.rotation.y
      rotationTo = next === '2d' ? 0 : orbitRotation
      cameraFrom.copy(camera.position)
      targetFrom.copy(controls.target)

      if (next === '2d') cameraTo.set(0, 0, mapViewDistance())
      else cameraTo.copy(orbitCameraPosition)

      controls.enabled = false
      overlayGroup.visible = false
      updateAnimationLoop()
    }

    const showEndpoint = (event: PointerEvent, pin = false) => {
      const bounds = renderer.domElement.getBoundingClientRect()
      const endpoint = endpointLayer.hitTest(event.clientX, event.clientY, bounds)

      if (endpoint) {
        pinnedEndpoint = pin
        options.onEndpointHover(endpoint, event.clientX, event.clientY)
        renderer.domElement.style.cursor = 'pointer'
      } else if (!pinnedEndpoint || pin) {
        pinnedEndpoint = false
        options.onEndpointHover(null)
        renderer.domElement.style.cursor = ''
      }
    }
    const onPointerMove = (event: PointerEvent) => {
      if (!pinnedEndpoint && event.pointerType !== 'touch') showEndpoint(event)
    }
    const onClick = (event: PointerEvent) => showEndpoint(event, true)
    const onPointerLeave = () => {
      if (!pinnedEndpoint) options.onEndpointHover(null)
    }
    renderer.domElement.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('click', onClick)
    renderer.domElement.addEventListener('pointerleave', onPointerLeave)
    registerCleanup(() => {
      renderer.domElement.removeEventListener('pointermove', onPointerMove)
      renderer.domElement.removeEventListener('click', onClick)
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave)
    })

    const resizeObserver = new ResizeObserver(([entry]) => {
      const width = Math.max(1, entry.contentRect.width)
      const height = Math.max(1, entry.contentRect.height)

      const zoomRatio =
        projection === '2d' && !morphing
          ? camera.position.distanceTo(controls.target) / mapDistance()
          : 0

      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
      labelRenderer.setSize(width, height)

      if (projection === '2d') {
        applyControls()
        if (morphing) {
          cameraTo.set(0, 0, mapViewDistance())
        } else {
          camera.position.z = mapDistance() * zoomRatio
          controls.update()
        }
      }

      render()
    })
    resizeObserver.observe(container)
    registerCleanup(() => resizeObserver.disconnect())

    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        intersecting = entry.isIntersecting
        updateAnimationLoop()
      },
      { threshold: 0.01 },
    )
    intersectionObserver.observe(container)
    registerCleanup(() => intersectionObserver.disconnect())

    const onVisibilityChange = () => {
      visible = !document.hidden
      updateAnimationLoop()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    registerCleanup(() => document.removeEventListener('visibilitychange', onVisibilityChange))

    const sunTimer = window.setInterval(() => {
      if (visualMode === 'space' && morph === 0) updateSunForTime()
      if (reducedMotion) render()
    }, 60_000)
    registerCleanup(() => window.clearInterval(sunTimer))

    const onControlsChange = () => {
      if (reducedMotion) render()
    }
    controls.addEventListener('change', onControlsChange)
    registerCleanup(() => controls.removeEventListener('change', onControlsChange))

    globeLayer.setMorph(morph)
    applyControls()
    if (projection === '2d') {
      camera.position.set(0, 0, mapViewDistance())
      controls.update()
    }
    updateAnimationLoop()

    return {
      setRoutes(incomingRoutes) {
        if (disposed) return

        const snapshot = createEarthRenderSnapshot(incomingRoutes)
        const topologyChanged = snapshot.signature !== currentSignature
        currentSignature = snapshot.signature
        routeLayer.setSnapshot(snapshot, topologyChanged)
        const endpoints = endpointLayer.setSnapshot(snapshot, topologyChanged)
        cityLabelLayer.setEndpoints(endpoints)
        if (reducedMotion) render()
      },
      setInitialLocation(location) {
        if (
          disposed ||
          initialLocationSet ||
          !Number.isFinite(location.latitude) ||
          !Number.isFinite(location.longitude)
        ) {
          return
        }

        initialLocationSet = true
        view = { ...view, centerLongitude: location.longitude }
        globeLayer.setCenterLongitude(view.centerLongitude)
        updateSunForTime()
        applyView()

        if (projection === '2d' || morphing) pendingInitialLocation = location
        else applyInitialLocation(location)

        render()
      },
      setReducedMotion(value) {
        if (disposed) return
        reducedMotion = value
        updateAnimationLoop()
      },
      setAutoRotation(enabled) {
        if (disposed) return
        autoRotation = enabled
      },
      setCityLabelsVisible(nextVisible) {
        if (disposed) return
        cityLabelLayer.setVisible(nextVisible)
        render()
      },
      setProjection(next) {
        if (disposed || projection === next) return
        startMorph(next)
      },
      setVisualMode(mode) {
        if (disposed || visualMode === mode) return
        visualMode = mode
        globeLayer.setVisualMode(mode)
        routeLayer.setVisualMode(mode)
        endpointLayer.setVisualMode(mode)
        render()
      },
      setColorScheme(scheme) {
        if (disposed || colorScheme === scheme) return
        colorScheme = scheme
        globeLayer.setColorScheme(scheme)
        routeLayer.setColorScheme(scheme)
        if (visualMode === 'flat' || projection === '2d') render()
      },
      dispose: disposeResources,
    }
  } catch (error) {
    try {
      disposeResources()
    } catch {}
    throw error
  }
}
