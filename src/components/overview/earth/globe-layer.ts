import backgroundTextureURL from '@/assets/images/earth/background.jpg'
import dayTextureURL from '@/assets/images/earth/earth-day.webp'
import nightTextureURL from '@/assets/images/earth/earth-night.webp'
import surfaceTextureURL from '@/assets/images/earth/earth-surface.webp'
import {
  bumpMap,
  cameraPosition,
  color,
  max,
  mix,
  normalize,
  normalLocal,
  normalWorldGeometry,
  output,
  positionLocal,
  positionWorld,
  step,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl'
import * as THREE from 'three/webgpu'
import { EARTH_RADIUS } from './earth-math'
import { PLANE_EDGE_EXTENSION, PLANE_HALF_HEIGHT, PLANE_HALF_WIDTH } from './projection'
import type { EarthColorScheme, EarthVisualMode } from './renderer-types'

const FLAT_GLOBE_PALETTES = {
  light: {
    ocean: '#dce6f0',
    land: '#65788d',
  },
  dark: {
    ocean: '#243241',
    land: '#8ca2b8',
  },
} as const

interface GlobeLayerOptions {
  scene: THREE.Scene
  earthGroup: THREE.Group
  renderer: THREE.WebGPURenderer
  visualMode: EarthVisualMode
  colorScheme: EarthColorScheme
  sunDirection: THREE.Vector3
}

export interface GlobeLayer {
  setMorph: (morph: number) => void
  setCenterLongitude: (longitude: number) => void
  setVisualMode: (mode: EarthVisualMode) => void
  setColorScheme: (scheme: EarthColorScheme) => void
  setSunDirection: (direction: THREE.Vector3) => void
  syncSunLight: () => void
  dispose: () => void
}

const loadEarthTextures = async () => {
  const loader = new THREE.TextureLoader()
  const results = await Promise.allSettled([
    loader.loadAsync(backgroundTextureURL),
    loader.loadAsync(dayTextureURL),
    loader.loadAsync(nightTextureURL),
    loader.loadAsync(surfaceTextureURL),
  ])
  const textures: THREE.Texture[] = []
  let failed = false
  let failure: unknown

  for (const result of results) {
    if (result.status === 'fulfilled') {
      textures.push(result.value)
    } else {
      if (!failed) failure = result.reason
      failed = true
    }
  }

  if (failed) {
    textures.forEach((texture) => texture.dispose())
    throw failure
  }

  return textures as [THREE.Texture, THREE.Texture, THREE.Texture, THREE.Texture]
}

export const createGlobeLayer = async (options: GlobeLayerOptions): Promise<GlobeLayer> => {
  const { scene, earthGroup, renderer } = options
  const textures = await loadEarthTextures()
  const [backgroundTexture, dayTexture, nightTexture, surfaceTexture] = textures

  backgroundTexture.mapping = THREE.EquirectangularReflectionMapping
  backgroundTexture.colorSpace = THREE.SRGBColorSpace
  dayTexture.colorSpace = THREE.SRGBColorSpace
  nightTexture.colorSpace = THREE.SRGBColorSpace
  dayTexture.anisotropy = 8
  nightTexture.anisotropy = 8
  surfaceTexture.anisotropy = 8
  dayTexture.wrapS = THREE.RepeatWrapping
  nightTexture.wrapS = THREE.RepeatWrapping
  surfaceTexture.wrapS = THREE.RepeatWrapping

  const sun = new THREE.DirectionalLight('#ffffff', 2)
  sun.position.set(0, 0.25, 3)
  scene.add(sun)

  const atmosphereDayColor = uniform(color('#4db2ff'))
  const atmosphereTwilightColor = uniform(color('#bc490b'))
  const roughnessLow = uniform(0.25)
  const roughnessHigh = uniform(0.38)
  const sunDirection = uniform(options.sunDirection.clone())
  const viewDirection = positionWorld.sub(cameraPosition).normalize()
  const fresnel = viewDirection.dot(normalWorldGeometry).abs().oneMinus().toVar()
  const sunOrientation = normalLocal.dot(normalize(sunDirection)).toVar()
  const atmosphereColor = mix(
    atmosphereTwilightColor,
    atmosphereDayColor,
    sunOrientation.smoothstep(-0.25, 0.75),
  )
  const centerOffset = uniform(0)
  const geoUV = vec2(uv().x.add(centerOffset), uv().y)
  const cloudsStrength = texture(surfaceTexture, geoUV).b.smoothstep(0.2, 1)
  const globeMaterial = new THREE.MeshStandardNodeMaterial()

  globeMaterial.colorNode = mix(texture(dayTexture, geoUV), vec3(1), cloudsStrength.mul(2))
  globeMaterial.roughnessNode = max(
    texture(surfaceTexture, geoUV).g,
    step(0.01, cloudsStrength),
  ).remap(0, 1, roughnessLow, roughnessHigh)

  const night = texture(nightTexture, geoUV)
  const dayStrength = sunOrientation.smoothstep(-0.25, 0.5)
  const atmosphereDayStrength = sunOrientation.smoothstep(-0.5, 1)
  const atmosphereMix = atmosphereDayStrength.mul(fresnel.pow(2)).clamp(0, 1)
  let finalOutput = mix(night.rgb, output.rgb, dayStrength)
  finalOutput = mix(finalOutput, atmosphereColor, atmosphereMix)
  globeMaterial.outputNode = vec4(finalOutput, output.a)
  globeMaterial.normalNode = bumpMap(max(texture(surfaceTexture, geoUV).r, cloudsStrength))

  const flatOceanColor = uniform(new THREE.Color())
  const flatLandColor = uniform(new THREE.Color())
  const flatSurface = texture(surfaceTexture, geoUV)
  const flatLandMask = flatSurface.g.sub(flatSurface.b).smoothstep(0.02, 0.16)
  const flatGlobeMaterial = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide })

  flatGlobeMaterial.colorNode = mix(flatOceanColor, flatLandColor, flatLandMask)
  flatGlobeMaterial.toneMapped = false

  const globeMorph = uniform(0)
  const globePlanePosition = vec3(
    uv()
      .x.sub(0.5)
      .mul(2 * PLANE_HALF_WIDTH),
    uv()
      .y.sub(0.5)
      .mul(2 * PLANE_HALF_HEIGHT),
    0,
  )

  flatGlobeMaterial.positionNode = mix(positionLocal, globePlanePosition, globeMorph)

  const sphereGeometry = new THREE.SphereGeometry(EARTH_RADIUS, 128, 128)
  const globe = new THREE.Mesh<THREE.SphereGeometry, THREE.Material>(sphereGeometry, globeMaterial)
  earthGroup.add(globe)

  const mapHalfWidth = PLANE_HALF_WIDTH + PLANE_EDGE_EXTENSION
  const mapWorlds = mapHalfWidth / PLANE_HALF_WIDTH
  const mapGeometry = new THREE.PlaneGeometry(mapHalfWidth * 2, PLANE_HALF_HEIGHT * 2)
  const mapMaterial = new THREE.MeshBasicNodeMaterial()
  const mapUV = vec2(
    uv()
      .x.mul(mapWorlds)
      .add(0.5 - mapWorlds / 2)
      .add(centerOffset),
    uv().y,
  )
  const mapSurface = texture(surfaceTexture, mapUV)

  mapMaterial.colorNode = mix(
    flatOceanColor,
    flatLandColor,
    mapSurface.g.sub(mapSurface.b).smoothstep(0.02, 0.16),
  )
  mapMaterial.toneMapped = false

  const map = new THREE.Mesh(mapGeometry, mapMaterial)
  map.visible = false
  earthGroup.add(map)

  const atmosphereMaterial = new THREE.MeshBasicNodeMaterial({
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
  })
  let atmosphereAlpha = fresnel.remap(0.73, 1, 1, 0).pow(3)
  atmosphereAlpha = atmosphereAlpha.mul(sunOrientation.smoothstep(-0.5, 1))
  atmosphereMaterial.outputNode = vec4(atmosphereColor, atmosphereAlpha)
  const atmosphere = new THREE.Mesh(sphereGeometry, atmosphereMaterial)
  atmosphere.scale.setScalar(1.045)
  earthGroup.add(atmosphere)

  let visualMode = options.visualMode
  let colorScheme = options.colorScheme
  let morph = 0
  let disposed = false

  const applyColorScheme = () => {
    const palette = FLAT_GLOBE_PALETTES[colorScheme]

    flatOceanColor.value.set(palette.ocean)
    flatLandColor.value.set(palette.land)
  }

  const applyVisualMode = () => {
    const flat = visualMode === 'flat' || morph > 0
    const flattened = morph >= 1

    scene.background = flat ? null : backgroundTexture
    renderer.toneMapping = flat ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping
    globe.material = flat ? flatGlobeMaterial : globeMaterial
    globe.visible = !flattened
    map.visible = flattened
    sun.visible = !flat
    atmosphere.visible = !flat
  }

  const syncSunLight = () => {
    if (disposed) return
    sun.position.copy(sunDirection.value).applyQuaternion(earthGroup.quaternion).multiplyScalar(3)
  }

  applyColorScheme()
  applyVisualMode()
  syncSunLight()

  return {
    setMorph(value) {
      if (disposed || morph === value) return

      const wasFlat = morph > 0
      const wasFlattened = morph >= 1
      morph = value
      globeMorph.value = value
      if (wasFlat !== value > 0 || wasFlattened !== value >= 1) applyVisualMode()
    },
    setCenterLongitude(longitude) {
      if (disposed) return
      centerOffset.value = longitude / 360
    },
    setVisualMode(mode) {
      if (disposed || visualMode === mode) return
      visualMode = mode
      applyVisualMode()
    },
    setColorScheme(scheme) {
      if (disposed || colorScheme === scheme) return
      colorScheme = scheme
      applyColorScheme()
    },
    setSunDirection(direction) {
      if (disposed) return
      sunDirection.value.copy(direction)
      syncSunLight()
    },
    syncSunLight,
    dispose() {
      if (disposed) return
      disposed = true
      if (scene.background === backgroundTexture) scene.background = null
      scene.remove(sun)
      earthGroup.remove(globe, atmosphere, map)
      sphereGeometry.dispose()
      mapGeometry.dispose()
      globeMaterial.dispose()
      flatGlobeMaterial.dispose()
      mapMaterial.dispose()
      atmosphereMaterial.dispose()
      textures.forEach((texture) => texture.dispose())
    },
  }
}
