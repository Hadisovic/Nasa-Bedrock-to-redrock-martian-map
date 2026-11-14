import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

const RADIUS = 1.65
const MARS_REAL_RADIUS_KM = 3389.5

// Equirectangular 2D flat map dimensions (2:1 aspect ratio matching 4096x2048 textures)
const FLAT_WIDTH = 10.0
const FLAT_HEIGHT = 5.0

export interface LandmarkInfo {
  id: string
  name: string
  subtitle: string
  lat: number
  lon: number
  distance: number
  polarAngle: number
}

export const LANDMARKS: Record<string, LandmarkInfo> = {
  'olympus-mons': {
    id: 'olympus-mons',
    name: 'Olympus Mons',
    subtitle: "Solar System's Tallest Peak",
    lat: 18.65,
    lon: 226.2, // 133.8 W
    distance: 2.38,
    polarAngle: 1.05,
  },
  'valles-marineris': {
    id: 'valles-marineris',
    name: 'Valles Marineris',
    subtitle: 'Grand Canyon of Mars',
    lat: -13.9,
    lon: 300.8, // 59.2 W
    distance: 2.45,
    polarAngle: 1.08,
  },
  'jezero-crater': {
    id: 'jezero-crater',
    name: 'Jezero Crater',
    subtitle: 'Perseverance Rover Delta',
    lat: 18.38,
    lon: 77.58,
    distance: 2.32,
    polarAngle: 1.02,
  },
  'gale-crater': {
    id: 'gale-crater',
    name: 'Gale Crater',
    subtitle: 'Curiosity Rover & Mt. Sharp',
    lat: -5.37,
    lon: 137.44,
    distance: 2.34,
    polarAngle: 1.04,
  },
  'north-pole': {
    id: 'north-pole',
    name: 'Planum Boreum',
    subtitle: 'North Polar Ice Cap',
    lat: 84.5,
    lon: 0.0,
    distance: 2.5,
    polarAngle: 0.45,
  },
}

/** Official NASA Space Apps Challenge Datasets */
export interface NasaDataset {
  id: string
  name: string
  sub: string
  url: string
  attribution: string
  bumpScale: number
}

export const NASA_DATASETS: Record<string, NasaDataset> = {
  viking: {
    id: 'viking',
    name: 'NASA Viking MDIM 2.1',
    sub: 'True Color Natural Surface Mosaic',
    url: '/textures/mars-surface.jpg',
    attribution: 'NASA / USGS / JPL · Viking Global Color Mosaic (MDIM 2.1)',
    bumpScale: 0.016,
  },
  mola: {
    id: 'mola',
    name: 'NASA MGS MOLA Topography',
    sub: 'Elevation Color Hillshade',
    url: '/textures/nasa-mola-topography.jpg',
    attribution: 'NASA / GSFC · MGS MOLA Elevation Hillshade (463 m/px)',
    bumpScale: 0.025,
  },
  themis: {
    id: 'themis',
    name: 'NASA THEMIS Infrared',
    sub: 'Day Infrared Controlled Mosaic',
    url: '/textures/nasa-themis-ir.png',
    attribution: 'NASA / ASU · Mars Odyssey THEMIS Day IR (100 m/px)',
    bumpScale: 0.018,
  },
}

export type TravelMode = 'rover' | 'hopper' | 'drone' | 'eva'

export interface RoutePoint {
  lat: number
  lon: number
  name?: string
}

export interface RouteOption {
  id: string
  name: string
  badge: 'RECOMMENDED' | 'ALTERNATIVE' | 'SCENIC'
  distanceKm: number
  durationMinutes: number
  durationFormatted: string
  elevationGainM: number
  slopeGradePct: number
  hazardSummary: string
  points3D: THREE.Vector3[]
  points2D: THREE.Vector2[]
}

export interface GlobeExperience {
  zoomIn: () => void
  zoomOut: () => void
  reset: () => void
  toggleTilt: () => boolean // Toggles between 2D flat looped map and 3D globe (returns is2D)
  resetNorth: () => void
  flyToLandmark: (id: string) => void
  setDataset: (id: string) => void
  setOverlayDataset: (id: string | null) => void
  setOverlayOpacity: (opacity: number) => void
  getBaseDataset: () => string
  getOverlayDataset: () => string | null
  getOverlayOpacity: () => number
  toggleLightingMode: () => boolean
  setLightingMode: (allLighted: boolean) => void
  isAllLighted: () => boolean
  is2D: () => boolean
  dispose: () => void

  // Google Maps Martian Route Planning API
  setOriginPoint: (point: RoutePoint | null) => void
  setDestinationPoint: (point: RoutePoint | null) => void
  getOriginPoint: () => RoutePoint | null
  getDestinationPoint: () => RoutePoint | null
  swapPoints: () => void
  clearRoute: () => void
  setTravelMode: (mode: TravelMode) => void
  getTravelMode: () => TravelMode
  getAvailableRoutes: () => RouteOption[]
  setSelectedRouteIndex: (index: number) => void
  getSelectedRouteIndex: () => number
  startRouteSimulation: () => void
  stopRouteSimulation: () => void
  isSimulatingRoute: () => boolean
  setPickingTarget: (target: 'origin' | 'dest' | 'auto' | 'none') => void
  getPickingTarget: () => 'origin' | 'dest' | 'auto' | 'none'
  onRouteUpdated: (callback: (routes: RouteOption[], selectedIdx: number, origin: RoutePoint | null, dest: RoutePoint | null) => void) => void
  onSimulationProgress: (callback: (progress: number, stats: { kmRemaining: number; speedKmH: number; routeName: string }) => void) => void
}

/** Convert Martian Lat/Lon (degrees) to 3D Cartesian coordinates on sphere */
export function latLonToVector3(lat: number, lon: number, radius = RADIUS): THREE.Vector3 {
  const phi = THREE.MathUtils.degToRad(90 - lat)
  const theta = THREE.MathUtils.degToRad(lon + 180)
  const x = -radius * Math.sin(phi) * Math.cos(theta)
  const z = radius * Math.sin(phi) * Math.sin(theta)
  const y = radius * Math.cos(phi)
  return new THREE.Vector3(x, y, z)
}

/** Convert 3D point on globe back to Lat/Lon degrees */
export function vector3ToLatLon(vec: THREE.Vector3): { lat: number; lon: number } {
  const norm = vec.clone().normalize()
  const lat = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(norm.y, -1, 1)))
  let lon = THREE.MathUtils.radToDeg(Math.atan2(norm.z, -norm.x)) - 180
  lon = THREE.MathUtils.euclideanModulo(lon + 180, 360) - 180
  if (lon < 0) lon += 360
  return { lat, lon }
}

/** Convert Martian Lat/Lon to 2D equirectangular flat plane coordinates (panel local) */
export function latLonToFlat(lat: number, lon: number, width = FLAT_WIDTH, height = FLAT_HEIGHT): THREE.Vector2 {
  const u = (lon % 360) / 360
  const x = (u - 0.5) * width
  const y = (lat / 180) * height
  return new THREE.Vector2(x, y)
}

/** Format latitude/longitude to clean Google Earth degrees/minutes string */
export function formatLatLon(lat: number, lon: number): string {
  const latAbs = Math.abs(lat)
  const latDeg = Math.floor(latAbs)
  const latMin = Math.round((latAbs - latDeg) * 60)
  const latHemi = lat >= 0 ? 'N' : 'S'

  const lonAbs = Math.abs(lon)
  const lonDeg = Math.floor(lonAbs)
  const lonMin = Math.round((lonAbs - lonDeg) * 60)
  const lonHemi = lon <= 180 ? 'E' : 'W'
  const displayLon = lon <= 180 ? lonDeg : 360 - lonDeg

  return `${latDeg}° ${latMin.toString().padStart(2, '0')}' ${latHemi}   ${displayLon}° ${lonMin.toString().padStart(2, '0')}' ${lonHemi}`
}

/** Format travel duration cleanly like Google Maps (hours, minutes, sols) */
function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${Math.max(1, Math.round(minutes))} min`
  }
  const hours = Math.floor(minutes / 60)
  const mins = Math.round(minutes % 60)
  if (hours < 48) {
    return mins > 0 ? `${hours} hr ${mins} min` : `${hours} hr`
  }
  const sols = (hours / 24.6).toFixed(1)
  return `${sols} sols (${hours} hr)`
}

export function createGlobeExperience(
  container: HTMLElement,
  onTextureReady: () => void,
  coordinateReadout: HTMLElement,
  altitudeReadout: HTMLElement,
  compassNeedle: HTMLElement,
  tiltLabel: HTMLElement,
  attributionElement?: HTMLElement,
): GlobeExperience {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#020306')

  const camera = new THREE.PerspectiveCamera(38, container.clientWidth / container.clientHeight, 0.005, 160)
  const default3DPosition = new THREE.Vector3(0.08, 0.12, 5.45)
  const startFlyInPosition = new THREE.Vector3(0.12, 0.15, 8.4)
  camera.position.copy(startFlyInPosition)

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.14
  renderer.domElement.className = 'globe-canvas'
  renderer.domElement.setAttribute('aria-hidden', 'true')
  container.replaceChildren(renderer.domElement)

  // -------------------------------------------------------------
  // Planetary Solar Lighting
  // -------------------------------------------------------------
  const sunPosition = new THREE.Vector3(-6.2, 3.2, 5.8)
  const sunDirection = sunPosition.clone().normalize()

  const sunLight = new THREE.DirectionalLight(0xfff6eb, 2.7)
  sunLight.position.copy(sunPosition)
  scene.add(sunLight)

  const nightFillDirection = sunPosition.clone().negate().add(new THREE.Vector3(1.2, -0.6, 0.4)).normalize()
  const nightFill = new THREE.DirectionalLight(0x5a75a5, 1.25)
  nightFill.position.copy(nightFillDirection.clone().multiplyScalar(8.0))
  scene.add(nightFill)

  const ambientLight = new THREE.HemisphereLight(0x60463b, 0x24324f, 1.45)
  scene.add(ambientLight)

  const cameraLight = new THREE.DirectionalLight(0xfff6eb, 0.0)
  cameraLight.position.copy(camera.position)
  scene.add(cameraLight)

  const allLightFill = new THREE.DirectionalLight(0xffedd8, 0.0)
  allLightFill.position.copy(sunPosition.clone().negate().multiplyScalar(6.0))
  scene.add(allLightFill)

  const flatLight = new THREE.DirectionalLight(0xffffff, 0.0)
  flatLight.position.set(0, 0, 10)
  scene.add(flatLight)

  let allLightedMode = false
  let currentLightingMix = 0.0

  const stars = makeStarfield()
  scene.add(stars)

  // -------------------------------------------------------------
  // Multi-Texture Layer & Overlay Uniforms
  // -------------------------------------------------------------
  const dummyOverlayTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat)
  dummyOverlayTex.needsUpdate = true

  const overlayUniforms: {
    uOverlayMap: { value: THREE.Texture }
    uOverlayOpacity: { value: number }
    uHasOverlay: { value: number }
  } = {
    uOverlayMap: { value: dummyOverlayTex },
    uOverlayOpacity: { value: 0.5 },
    uHasOverlay: { value: 0.0 },
  }

  let activeBaseDatasetId = 'viking'
  let activeOverlayDatasetId: string | null = null
  let currentOverlayOpacity = 0.5

  function injectOverlayShader(shader: THREE.WebGLProgramParametersWithUniforms): void {
    shader.uniforms.uOverlayMap = overlayUniforms.uOverlayMap
    shader.uniforms.uOverlayOpacity = overlayUniforms.uOverlayOpacity
    shader.uniforms.uHasOverlay = overlayUniforms.uHasOverlay

    shader.fragmentShader = `
      uniform sampler2D uOverlayMap;
      uniform float uOverlayOpacity;
      uniform float uHasOverlay;
    ` + shader.fragmentShader

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `
      #include <map_fragment>
      if (uHasOverlay > 0.5) {
        vec4 overlayTexel = texture2D(uOverlayMap, vMapUv);
        diffuseColor.rgb = mix(diffuseColor.rgb, overlayTexel.rgb, clamp(uOverlayOpacity, 0.0, 1.0));
      }
      `
    )
  }

  // -------------------------------------------------------------
  // Mars 3D Sphere Group
  // -------------------------------------------------------------
  const marsGroup = new THREE.Group()
  marsGroup.rotation.set(0.03, -0.85, 0.08)
  scene.add(marsGroup)

  const sphereMaterial = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.95,
    metalness: 0.0,
  })
  sphereMaterial.onBeforeCompile = injectOverlayShader

  const marsGeometry = new THREE.SphereGeometry(RADIUS, 128, 96)
  const marsSphere = new THREE.Mesh(marsGeometry, sphereMaterial)
  marsSphere.name = 'mars-surface'
  marsGroup.add(marsSphere)

  // -------------------------------------------------------------
  // Mars 2D Flat Looped Paper Map Group
  // -------------------------------------------------------------
  const flatGroup = new THREE.Group()
  flatGroup.visible = false
  scene.add(flatGroup)

  const flatMaterial = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.92,
    metalness: 0.0,
  })
  flatMaterial.onBeforeCompile = injectOverlayShader

  const planeGeo = new THREE.PlaneGeometry(FLAT_WIDTH, FLAT_HEIGHT, 128, 64)

  const panelCenter = new THREE.Mesh(planeGeo, flatMaterial)
  const panelLeft = new THREE.Mesh(planeGeo, flatMaterial)
  const panelRight = new THREE.Mesh(planeGeo, flatMaterial)

  flatGroup.add(panelCenter)
  flatGroup.add(panelLeft)
  flatGroup.add(panelRight)

  const paperBackingGeo = new THREE.PlaneGeometry(FLAT_WIDTH * 3 + 4, FLAT_HEIGHT + 0.16)
  const paperBackingMat = new THREE.MeshBasicMaterial({
    color: '#070b14',
    side: THREE.DoubleSide,
  })
  const paperBacking = new THREE.Mesh(paperBackingGeo, paperBackingMat)
  paperBacking.position.z = -0.015
  flatGroup.add(paperBacking)

  const borderGeo = new THREE.PlaneGeometry(FLAT_WIDTH * 3 + 4, 0.04)
  const borderMat = new THREE.MeshBasicMaterial({
    color: '#2d3b55',
    transparent: true,
    opacity: 0.85,
  })
  const topBorder = new THREE.Mesh(borderGeo, borderMat)
  topBorder.position.set(0, FLAT_HEIGHT / 2 + 0.02, 0.002)
  flatGroup.add(topBorder)

  const bottomBorder = new THREE.Mesh(borderGeo, borderMat)
  bottomBorder.position.set(0, -FLAT_HEIGHT / 2 - 0.02, 0.002)
  flatGroup.add(bottomBorder)

  // -------------------------------------------------------------
  // Texture Management & Caching
  // -------------------------------------------------------------
  const textureLoader = new THREE.TextureLoader()
  const textureCache: Record<string, THREE.Texture> = {}

  function updateAttributionText(): void {
    if (!attributionElement) return
    const baseDs = NASA_DATASETS[activeBaseDatasetId]
    if (!baseDs) return

    if (activeOverlayDatasetId && NASA_DATASETS[activeOverlayDatasetId]) {
      const overDs = NASA_DATASETS[activeOverlayDatasetId]
      const pct = Math.round(currentOverlayOpacity * 100)
      attributionElement.textContent = `${baseDs.attribution} + ${overDs.name} Overlay (${pct}%)`
    } else {
      attributionElement.textContent = baseDs.attribution
    }
  }

  function applyBaseTexture(tex: THREE.Texture, bumpScale: number): void {
    sphereMaterial.map = tex
    sphereMaterial.bumpMap = tex
    sphereMaterial.bumpScale = bumpScale
    sphereMaterial.needsUpdate = true

    flatMaterial.map = tex
    flatMaterial.bumpMap = tex
    flatMaterial.bumpScale = bumpScale
    flatMaterial.needsUpdate = true
  }

  function applyBaseDataset(datasetId: string): void {
    const ds = NASA_DATASETS[datasetId]
    if (!ds) return
    activeBaseDatasetId = datasetId
    updateAttributionText()

    if (textureCache[datasetId]) {
      applyBaseTexture(textureCache[datasetId], ds.bumpScale)
    } else {
      textureLoader.load(
        ds.url,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace
          tex.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8)
          textureCache[datasetId] = tex
          if (activeBaseDatasetId === datasetId) {
            applyBaseTexture(tex, ds.bumpScale)
            onTextureReady()
          }
        },
        undefined,
        () => onTextureReady(),
      )
    }
  }

  function applyOverlayDataset(datasetId: string | null): void {
    if (!datasetId || datasetId === 'none') {
      activeOverlayDatasetId = null
      overlayUniforms.uHasOverlay.value = 0.0
      updateAttributionText()
      return
    }

    const ds = NASA_DATASETS[datasetId]
    if (!ds) return
    activeOverlayDatasetId = datasetId

    if (textureCache[datasetId]) {
      overlayUniforms.uOverlayMap.value = textureCache[datasetId]
      overlayUniforms.uHasOverlay.value = 1.0
      updateAttributionText()
    } else {
      textureLoader.load(
        ds.url,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace
          tex.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8)
          textureCache[datasetId] = tex
          if (activeOverlayDatasetId === datasetId) {
            overlayUniforms.uOverlayMap.value = tex
            overlayUniforms.uHasOverlay.value = 1.0
            updateAttributionText()
          }
        },
      )
    }
  }

  applyBaseDataset('viking')

  // -------------------------------------------------------------
  // Google Earth Atmosphere
  // -------------------------------------------------------------
  const outerAtmosphereGeometry = new THREE.SphereGeometry(RADIUS * 1.022, 96, 96)
  const outerAtmosphereMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uSunDirection: { value: sunDirection },
      uAtmosphereColor: { value: new THREE.Color('#f09265') },
      uTwilightColor: { value: new THREE.Color('#6c608f') },
      uAllLighted: { value: 0.0 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      varying vec3 vViewPosition;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDirection;
      uniform vec3 uAtmosphereColor;
      uniform vec3 uTwilightColor;
      uniform float uAllLighted;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      varying vec3 vViewPosition;

      void main() {
        vec3 viewDir = normalize(vViewPosition);
        vec3 norm = normalize(vNormal);

        float rim = 1.0 - max(dot(viewDir, norm), 0.0);
        float haloGlow = pow(rim, 4.2) * 1.15;

        vec3 worldNorm = normalize(vWorldPosition);
        float sunDot = dot(worldNorm, normalize(uSunDirection));
        float sunIntensity = smoothstep(-0.25, 0.40, sunDot);
        float forwardScatter = pow(max(dot(viewDir, -normalize(uSunDirection)), 0.0), 3.8) * 0.35;

        float twilightMix = smoothstep(0.28, -0.2, sunDot);
        vec3 dayColor = mix(uAtmosphereColor, uTwilightColor, twilightMix);
        vec3 nightStarlightColor = vec3(0.35, 0.46, 0.72);

        vec3 realisticColor = mix(nightStarlightColor, dayColor * (1.1 + forwardScatter * 0.6), sunIntensity);
        float nightRim = pow(rim, 3.2) * 0.35;
        float realisticAlpha = clamp(haloGlow * (sunIntensity * 0.75 + 0.25) + forwardScatter * sunIntensity + nightRim, 0.0, 1.0);

        vec3 allLightedColor = uAtmosphereColor * 1.08;
        float allLightedAlpha = clamp(haloGlow * 1.15 + pow(rim, 3.0) * 0.3, 0.0, 1.0);

        vec3 color = mix(realisticColor, allLightedColor, uAllLighted);
        float alpha = mix(realisticAlpha, allLightedAlpha, uAllLighted);

        gl_FragColor = vec4(color, alpha * 0.82);
      }
    `,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  })
  const outerAtmosphere = new THREE.Mesh(outerAtmosphereGeometry, outerAtmosphereMaterial)
  marsGroup.add(outerAtmosphere)

  const innerHazeGeometry = new THREE.SphereGeometry(RADIUS * 1.003, 96, 96)
  const innerHazeMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uSunDirection: { value: sunDirection },
      uHazeColor: { value: new THREE.Color('#d47754') },
      uAllLighted: { value: 0.0 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      varying vec3 vViewPosition;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDirection;
      uniform vec3 uHazeColor;
      uniform float uAllLighted;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      varying vec3 vViewPosition;

      void main() {
        vec3 viewDir = normalize(vViewPosition);
        vec3 norm = normalize(vNormal);

        float fresnel = pow(1.0 - max(dot(viewDir, norm), 0.0), 4.2);
        vec3 worldNorm = normalize(vWorldPosition);
        float sunDot = dot(worldNorm, normalize(uSunDirection));
        float sunFactor = smoothstep(-0.25, 0.35, sunDot);
        float effSunFactor = mix(sunFactor, 1.0, uAllLighted);

        float alpha = fresnel * (effSunFactor * 0.42 + 0.12);
        gl_FragColor = vec4(uHazeColor, alpha);
      }
    `,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  })
  const innerHaze = new THREE.Mesh(innerHazeGeometry, innerHazeMaterial)
  marsGroup.add(innerHaze)

  // -------------------------------------------------------------
  // Landmark Beacon Pins
  // -------------------------------------------------------------
  const landmarkGroup = new THREE.Group()
  marsGroup.add(landmarkGroup)

  const flatLandmarkGroup = new THREE.Group()
  panelCenter.add(flatLandmarkGroup)

  const landmarkBeacons: { mesh: THREE.Mesh; id: string }[] = []
  const beaconGeometry = new THREE.RingGeometry(0.015, 0.022, 32)
  const beaconDotGeometry = new THREE.CircleGeometry(0.008, 24)

  const flatBeaconGeo = new THREE.RingGeometry(0.045, 0.065, 32)
  const flatDotGeo = new THREE.CircleGeometry(0.024, 24)

  Object.values(LANDMARKS).forEach((lm) => {
    const pos = latLonToVector3(lm.lat, lm.lon, RADIUS * 1.002)
    const normal = pos.clone().normalize()

    const beaconMaterial = new THREE.MeshBasicMaterial({
      color: 0x6bd6ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthTest: true,
    })

    const ringMesh = new THREE.Mesh(beaconGeometry, beaconMaterial)
    const dotMesh = new THREE.Mesh(beaconDotGeometry, new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
    }))

    const markerAnchor = new THREE.Group()
    markerAnchor.position.copy(pos)
    markerAnchor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal)
    markerAnchor.add(ringMesh)
    markerAnchor.add(dotMesh)
    landmarkGroup.add(markerAnchor)
    landmarkBeacons.push({ mesh: dotMesh, id: lm.id })

    const flatPos = latLonToFlat(lm.lat, lm.lon, FLAT_WIDTH, FLAT_HEIGHT)
    const flatAnchor = new THREE.Group()
    flatAnchor.position.set(flatPos.x, flatPos.y, 0.01)

    const flatRing = new THREE.Mesh(flatBeaconGeo, beaconMaterial)
    const flatDot = new THREE.Mesh(flatDotGeo, new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
    }))
    flatAnchor.add(flatRing)
    flatAnchor.add(flatDot)
    flatLandmarkGroup.add(flatAnchor)
    landmarkBeacons.push({ mesh: flatDot, id: lm.id + '-flat' })
  })

  const flatLandmarkGroupLeft = flatLandmarkGroup.clone(true)
  panelLeft.add(flatLandmarkGroupLeft)
  const flatLandmarkGroupRight = flatLandmarkGroup.clone(true)
  panelRight.add(flatLandmarkGroupRight)

  // -------------------------------------------------------------
  // GOOGLE MAPS ROUTING OBJECTS (3D ROCKET & 3D DESTINATION PIN)
  // -------------------------------------------------------------
  interface ActiveMarker3D {
    group: THREE.Group
    flameMesh?: THREE.Mesh
    thrusterLight?: THREE.PointLight
    shockwaveMesh?: THREE.Mesh
    pulseRing?: THREE.Mesh
    beaconBeam?: THREE.Mesh
    flatCopies: THREE.Group[]
    type: 'rocket' | 'pin'
    lat: number
    lon: number
    isAnimating: boolean
    animStartTime: number
    animDuration: number
    basePos: THREE.Vector3
    normal: THREE.Vector3
  }

  const routeMarkersGroup = new THREE.Group()
  marsGroup.add(routeMarkersGroup)

  const flatRouteMarkersCenter = new THREE.Group()
  const flatRouteMarkersLeft = new THREE.Group()
  const flatRouteMarkersRight = new THREE.Group()
  panelCenter.add(flatRouteMarkersCenter)
  panelLeft.add(flatRouteMarkersLeft)
  panelRight.add(flatRouteMarkersRight)

  let activeRocketMarker: ActiveMarker3D | null = null
  let activePinMarker: ActiveMarker3D | null = null

  // Route Lines Groups
  const routeLines3DGroup = new THREE.Group()
  marsGroup.add(routeLines3DGroup)

  const flatRouteLinesCenter = new THREE.Group()
  const flatRouteLinesLeft = new THREE.Group()
  const flatRouteLinesRight = new THREE.Group()
  panelCenter.add(flatRouteLinesCenter)
  panelLeft.add(flatRouteLinesLeft)
  panelRight.add(flatRouteLinesRight)

  // Traveling Simulation Rover / Beacon
  const simRoverGroup = new THREE.Group()
  simRoverGroup.visible = false
  marsGroup.add(simRoverGroup)

  // Build sleek Rover mesh for simulation
  const simRoverBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.024, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x8ab4f8, roughness: 0.3, metalness: 0.7 })
  )
  simRoverBody.position.y = 0.015
  simRoverGroup.add(simRoverBody)

  const simRoverAntenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0015, 0.0015, 0.04, 8),
    new THREE.MeshBasicMaterial({ color: 0x34a853 })
  )
  simRoverAntenna.position.set(0.012, 0.04, -0.012)
  simRoverGroup.add(simRoverAntenna)

  const simRoverGlow = new THREE.Mesh(
    new THREE.SphereGeometry(0.014, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0x8ab4f8, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending })
  )
  simRoverGlow.position.y = 0.02
  simRoverGroup.add(simRoverGlow)

  const simRoverLight = new THREE.PointLight(0x8ab4f8, 1.8, 0.5)
  simRoverLight.position.y = 0.03
  simRoverGroup.add(simRoverLight)

  // 2D Sim Rover Markers
  const flatSimRoverCenter = new THREE.Mesh(
    new THREE.CircleGeometry(0.04, 24),
    new THREE.MeshBasicMaterial({ color: 0x8ab4f8, transparent: true, opacity: 0.9 })
  )
  flatSimRoverCenter.visible = false
  flatRouteMarkersCenter.add(flatSimRoverCenter)

  const flatSimRoverLeft = flatSimRoverCenter.clone()
  flatRouteMarkersLeft.add(flatSimRoverLeft)
  const flatSimRoverRight = flatSimRoverCenter.clone()
  flatRouteMarkersRight.add(flatSimRoverRight)

  /** Build Detailed 3D Rocket Model */
  function createRocketModel(): {
    group: THREE.Group
    flame: THREE.Mesh
    light: THREE.PointLight
    shockwave: THREE.Mesh
  } {
    const group = new THREE.Group()

    // 1. Aerodynamic Fuselage
    const fuselage = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.022, 0.12, 24),
      new THREE.MeshStandardMaterial({
        color: 0xf5f7fb,
        roughness: 0.28,
        metalness: 0.55,
      })
    )
    fuselage.position.y = 0.075
    group.add(fuselage)

    // 2. Conical Nosecone
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.016, 0.044, 24),
      new THREE.MeshStandardMaterial({
        color: 0xebedf2,
        roughness: 0.22,
        metalness: 0.45,
      })
    )
    nose.position.y = 0.157
    group.add(nose)

    // 3. Cockpit Glass Visor
    const visor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0163, 0.0167, 0.013, 24, 1, false, -Math.PI / 2.5, (2 * Math.PI) / 2.5),
      new THREE.MeshStandardMaterial({
        color: 0x1a2638,
        roughness: 0.1,
        metalness: 0.95,
      })
    )
    visor.position.y = 0.132
    group.add(visor)

    // 4. Red NASA Stripes
    const stripe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0175, 0.0185, 0.012, 24),
      new THREE.MeshStandardMaterial({
        color: 0xe02e24,
        roughness: 0.4,
      })
    )
    stripe.position.y = 0.09
    group.add(stripe)

    // 5. 4 Aerodynamic Landing Legs / Fins
    const finGeo = new THREE.BoxGeometry(0.003, 0.038, 0.022)
    const finMat = new THREE.MeshStandardMaterial({
      color: 0xd93829,
      roughness: 0.45,
    })
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2
      const fin = new THREE.Mesh(finGeo, finMat)
      fin.position.set(Math.cos(angle) * 0.018, 0.022, Math.sin(angle) * 0.018)
      fin.rotation.y = -angle
      fin.rotation.z = 0.15
      group.add(fin)
    }

    // 6. Rocket Engine Bell
    const bell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.007, 0.014, 0.018, 16),
      new THREE.MeshStandardMaterial({
        color: 0x22262e,
        roughness: 0.2,
        metalness: 0.85,
      })
    )
    bell.position.y = 0.009
    group.add(bell)

    // 7. Dynamic Retro-Thruster Flame Cone
    const flameGeo = new THREE.ConeGeometry(0.013, 0.075, 16)
    flameGeo.rotateX(Math.PI)
    const flame = new THREE.Mesh(
      flameGeo,
      new THREE.MeshBasicMaterial({
        color: 0x5be5ff,
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
      })
    )
    flame.position.y = -0.032
    group.add(flame)

    const innerFlameGeo = new THREE.ConeGeometry(0.007, 0.045, 12)
    innerFlameGeo.rotateX(Math.PI)
    const innerFlame = new THREE.Mesh(
      innerFlameGeo,
      new THREE.MeshBasicMaterial({
        color: 0xffedd8,
        transparent: true,
        opacity: 0.98,
        blending: THREE.AdditiveBlending,
      })
    )
    flame.add(innerFlame)

    // 8. Thruster Ground Illumination Light
    const light = new THREE.PointLight(0xff8833, 2.5, 0.85)
    light.position.y = -0.02
    group.add(light)

    // 9. Touchdown Shockwave Regolith Ring
    const shockwave = new THREE.Mesh(
      new THREE.RingGeometry(0.005, 0.015, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffa040,
        transparent: true,
        opacity: 0.0,
        side: THREE.DoubleSide,
      })
    )
    shockwave.rotation.x = -Math.PI / 2
    shockwave.position.y = 0.002
    group.add(shockwave)

    return { group, flame, light, shockwave }
  }

  /** Build Detailed 3D Google Maps Pin Model */
  function createPinModel(): {
    group: THREE.Group
    beam: THREE.Mesh
    pulse: THREE.Mesh
  } {
    const group = new THREE.Group()

    // 1. Google Maps Crimson Teardrop Pin
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.022, 24, 24),
      new THREE.MeshStandardMaterial({
        color: 0xea4335,
        roughness: 0.25,
        metalness: 0.2,
      })
    )
    head.position.y = 0.054
    group.add(head)

    const pointer = new THREE.Mesh(
      new THREE.ConeGeometry(0.022, 0.05, 24),
      new THREE.MeshStandardMaterial({
        color: 0xea4335,
        roughness: 0.25,
        metalness: 0.2,
      })
    )
    pointer.rotation.x = Math.PI
    pointer.position.y = 0.025
    group.add(pointer)

    // 2. Center White Dot
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.009, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    )
    dot.position.y = 0.054
    group.add(dot)

    // 3. Holographic Sky Beacon Beam
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.002, 0.008, 0.45, 16),
      new THREE.MeshBasicMaterial({
        color: 0x00e5ff,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
      })
    )
    beam.position.y = 0.28
    group.add(beam)

    // 4. Ground Pulse Ring
    const pulse = new THREE.Mesh(
      new THREE.RingGeometry(0.015, 0.025, 32),
      new THREE.MeshBasicMaterial({
        color: 0xea4335,
        transparent: true,
        opacity: 0.75,
        side: THREE.DoubleSide,
      })
    )
    pulse.rotation.x = -Math.PI / 2
    pulse.position.y = 0.002
    group.add(pulse)

    return { group, beam, pulse }
  }

  /** Spawn/Place Rocket at Lat/Lon */
  function placeRocketMarker(lat: number, lon: number): void {
    if (activeRocketMarker) {
      routeMarkersGroup.remove(activeRocketMarker.group)
      activeRocketMarker.flatCopies.forEach((c) => c.parent?.remove(c))
      activeRocketMarker = null
    }

    const { group, flame, light, shockwave } = createRocketModel()
    const pos = latLonToVector3(lat, lon, RADIUS)
    const normal = pos.clone().normalize()

    group.position.copy(pos)
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal)
    routeMarkersGroup.add(group)

    // Flat Map Copies on Center, Left, and Right Panels
    const flatPos = latLonToFlat(lat, lon, FLAT_WIDTH, FLAT_HEIGHT)
    const flatCopyCenter = group.clone(true)
    flatCopyCenter.position.set(flatPos.x, flatPos.y, 0.02)
    flatCopyCenter.rotation.set(-Math.PI / 5, 0, 0)
    flatCopyCenter.scale.set(1.4, 1.4, 1.4)

    // Glowing blue landing target pad ring on flat map
    const padGeo = new THREE.RingGeometry(0.04, 0.065, 32)
    const padMat = new THREE.MeshBasicMaterial({
      color: 0x1a73e8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    })
    const padCenter = new THREE.Mesh(padGeo, padMat)
    padCenter.position.set(0, 0, 0.005)
    flatCopyCenter.add(padCenter)

    const padDot = new THREE.Mesh(
      new THREE.CircleGeometry(0.02, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    )
    padDot.position.set(0, 0, 0.006)
    flatCopyCenter.add(padDot)

    flatRouteMarkersCenter.add(flatCopyCenter)

    const flatCopyLeft = flatCopyCenter.clone(true)
    flatCopyLeft.position.set(flatPos.x, flatPos.y, 0.02)
    flatRouteMarkersLeft.add(flatCopyLeft)

    const flatCopyRight = flatCopyCenter.clone(true)
    flatCopyRight.position.set(flatPos.x, flatPos.y, 0.02)
    flatRouteMarkersRight.add(flatCopyRight)

    activeRocketMarker = {
      group,
      flameMesh: flame,
      thrusterLight: light,
      shockwaveMesh: shockwave,
      flatCopies: [flatCopyCenter, flatCopyLeft, flatCopyRight],
      type: 'rocket',
      lat,
      lon,
      isAnimating: true,
      animStartTime: performance.now(),
      animDuration: 2100,
      basePos: pos,
      normal,
    }
  }

  /** Spawn/Place Destination Pin at Lat/Lon */
  function placePinMarker(lat: number, lon: number): void {
    if (activePinMarker) {
      routeMarkersGroup.remove(activePinMarker.group)
      activePinMarker.flatCopies.forEach((c) => c.parent?.remove(c))
      activePinMarker = null
    }

    const { group, beam, pulse } = createPinModel()
    const pos = latLonToVector3(lat, lon, RADIUS)
    const normal = pos.clone().normalize()

    group.position.copy(pos)
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal)
    routeMarkersGroup.add(group)

    const flatPos = latLonToFlat(lat, lon, FLAT_WIDTH, FLAT_HEIGHT)
    const flatCopyCenter = group.clone(true)
    flatCopyCenter.position.set(flatPos.x, flatPos.y, 0.02)
    flatCopyCenter.rotation.set(-Math.PI / 5, 0, 0)
    flatCopyCenter.scale.set(1.4, 1.4, 1.4)

    // Glowing red destination target pad ring on flat map
    const destPadGeo = new THREE.RingGeometry(0.04, 0.065, 32)
    const destPadMat = new THREE.MeshBasicMaterial({
      color: 0xea4335,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    })
    const destPadCenter = new THREE.Mesh(destPadGeo, destPadMat)
    destPadCenter.position.set(0, 0, 0.005)
    flatCopyCenter.add(destPadCenter)

    const destPadDot = new THREE.Mesh(
      new THREE.CircleGeometry(0.02, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    )
    destPadDot.position.set(0, 0, 0.006)
    flatCopyCenter.add(destPadDot)

    flatRouteMarkersCenter.add(flatCopyCenter)

    const flatCopyLeft = flatCopyCenter.clone(true)
    flatCopyLeft.position.set(flatPos.x, flatPos.y, 0.02)
    flatRouteMarkersLeft.add(flatCopyLeft)

    const flatCopyRight = flatCopyCenter.clone(true)
    flatCopyRight.position.set(flatPos.x, flatPos.y, 0.02)
    flatRouteMarkersRight.add(flatCopyRight)

    activePinMarker = {
      group,
      beaconBeam: beam,
      pulseRing: pulse,
      flatCopies: [flatCopyCenter, flatCopyLeft, flatCopyRight],
      type: 'pin',
      lat,
      lon,
      isAnimating: true,
      animStartTime: performance.now(),
      animDuration: 1600,
      basePos: pos,
      normal,
    }
  }

  // -------------------------------------------------------------
  // Martian Multi-Route Generator & Geodesic Polylines
  // -------------------------------------------------------------
  let currentOrigin: RoutePoint | null = null
  let currentDest: RoutePoint | null = null
  let currentTravelMode: TravelMode = 'rover'
  let availableRoutes: RouteOption[] = []
  let selectedRouteIndex = 0

  let pickingTarget: 'origin' | 'dest' | 'auto' | 'none' = 'auto'
  let onRouteUpdatedCallback: ((routes: RouteOption[], selectedIdx: number, origin: RoutePoint | null, dest: RoutePoint | null) => void) | null = null
  let onSimulationProgressCallback: ((progress: number, stats: { kmRemaining: number; speedKmH: number; routeName: string }) => void) | null = null

  // Simulation State
  let isSimulating = false
  let simStartTime = 0
  let simDuration = 14000
  let simRoutePoints: THREE.Vector3[] = []

  function slerpGreatCircle(
    v1: THREE.Vector3,
    v2: THREE.Vector3,
    numPoints = 64,
    lateralFactor = 0
  ): THREE.Vector3[] {
    const points: THREE.Vector3[] = []
    const normalAxis = new THREE.Vector3().crossVectors(v1, v2).normalize()
    const totalAngle = v1.angleTo(v2)

    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints
      const slerped = v1.clone().applyAxisAngle(normalAxis, totalAngle * t).normalize()

      if (lateralFactor !== 0) {
        const lateralNormal = new THREE.Vector3().crossVectors(slerped, normalAxis).normalize()
        const lateralDeflection = Math.sin(t * Math.PI) * lateralFactor * (RADIUS * 0.28)
        slerped.addScaledVector(lateralNormal, lateralDeflection).normalize()
      }

      slerped.multiplyScalar(RADIUS + 0.012)
      points.push(slerped)
    }
    return points
  }

  function computeRoutes(): void {
    if (!currentOrigin || !currentDest) {
      availableRoutes = []
      clearRouteVisuals()
      if (onRouteUpdatedCallback) {
        onRouteUpdatedCallback([], 0, currentOrigin, currentDest)
      }
      return
    }

    const vOrigin = latLonToVector3(currentOrigin.lat, currentOrigin.lon, RADIUS).normalize()
    const vDest = latLonToVector3(currentDest.lat, currentDest.lon, RADIUS).normalize()

    const angularDistance = vOrigin.angleTo(vDest)
    const baseDistanceKm = Math.max(12, Math.round(angularDistance * MARS_REAL_RADIUS_KM))

    // Speed by travel mode (km/h)
    const speeds: Record<TravelMode, number> = {
      rover: 24,
      hopper: 1150,
      drone: 58,
      eva: 4.2,
    }
    const currentSpeed = speeds[currentTravelMode] || 24

    // 1. Recommended Route (Direct Geodesic Great Circle Arc)
    const pts1_3d = slerpGreatCircle(vOrigin, vDest, 64, 0.0)
    const pts1_2d = pts1_3d.map((p) => {
      const { lat, lon } = vector3ToLatLon(p)
      return latLonToFlat(lat, lon)
    })
    const dist1 = baseDistanceKm
    const dur1 = (dist1 / currentSpeed) * 60

    // 2. Alternative Route A (Valley / Basin Bypass)
    const pts2_3d = slerpGreatCircle(vOrigin, vDest, 64, 0.22)
    const pts2_2d = pts2_3d.map((p) => {
      const { lat, lon } = vector3ToLatLon(p)
      return latLonToFlat(lat, lon)
    })
    const dist2 = Math.round(baseDistanceKm * 1.18)
    const dur2 = (dist2 / currentSpeed) * 60

    // 3. Alternative Route B (Highlands / Ridge Route)
    const pts3_3d = slerpGreatCircle(vOrigin, vDest, 64, -0.26)
    const pts3_2d = pts3_3d.map((p) => {
      const { lat, lon } = vector3ToLatLon(p)
      return latLonToFlat(lat, lon)
    })
    const dist3 = Math.round(baseDistanceKm * 1.32)
    const dur3 = (dist3 / currentSpeed) * 60

    availableRoutes = [
      {
        id: 'route-recommended',
        name: 'via Chryse Planitia Basin Expressway',
        badge: 'RECOMMENDED',
        distanceKm: dist1,
        durationMinutes: dur1,
        durationFormatted: formatDuration(dur1),
        elevationGainM: 420,
        slopeGradePct: 2.8,
        hazardSummary: 'Smooth basalt plain • Low radiation index (0.11 mSv) • Optimal slope (< 3°)',
        points3D: pts1_3d,
        points2D: pts1_2d,
      },
      {
        id: 'route-canyon',
        name: 'via Valles Marineris Canyon Floor',
        badge: 'ALTERNATIVE',
        distanceKm: dist2,
        durationMinutes: dur2,
        durationFormatted: formatDuration(dur2),
        elevationGainM: 1450,
        slopeGradePct: 6.4,
        hazardSummary: 'Sheltered canyon microclimate • Moderate sand dunes • Grade: 6.4%',
        points3D: pts2_3d,
        points2D: pts2_2d,
      },
      {
        id: 'route-ridge',
        name: 'via Tharsis Ridge Overlook',
        badge: 'SCENIC',
        distanceKm: dist3,
        durationMinutes: dur3,
        durationFormatted: formatDuration(dur3),
        elevationGainM: 2890,
        slopeGradePct: 9.2,
        hazardSummary: 'Panoramic Martian horizon • High crater density • Elevated solar exposure',
        points3D: pts3_3d,
        points2D: pts3_2d,
      },
    ]

    selectedRouteIndex = 0
    renderRoutePolylines()
    frameRouteView()

    if (onRouteUpdatedCallback) {
      onRouteUpdatedCallback(availableRoutes, selectedRouteIndex, currentOrigin, currentDest)
    }
  }

  function clearRouteVisuals(): void {
    while (routeLines3DGroup.children.length > 0) {
      const obj = routeLines3DGroup.children[0]
      routeLines3DGroup.remove(obj)
    }
    while (flatRouteLinesCenter.children.length > 0) {
      const obj = flatRouteLinesCenter.children[0]
      flatRouteLinesCenter.remove(obj)
    }
    while (flatRouteLinesLeft.children.length > 0) {
      const obj = flatRouteLinesLeft.children[0]
      flatRouteLinesLeft.remove(obj)
    }
    while (flatRouteLinesRight.children.length > 0) {
      const obj = flatRouteLinesRight.children[0]
      flatRouteLinesRight.remove(obj)
    }
  }

  /** Construct solid 2D ribbon mesh quad strip for bold, high-visibility route rendering */
  function createRibbonGeometry(points: THREE.Vector3[], width: number): THREE.BufferGeometry {
    const numPts = points.length
    const vertices: number[] = []
    const indices: number[] = []

    for (let i = 0; i < numPts; i++) {
      const p = points[i]
      let tangent: THREE.Vector3
      if (i === 0) {
        tangent = points[1].clone().sub(p).normalize()
      } else if (i === numPts - 1) {
        tangent = p.clone().sub(points[i - 1]).normalize()
      } else {
        tangent = points[i + 1].clone().sub(points[i - 1]).normalize()
      }

      const normal = new THREE.Vector3(-tangent.y, tangent.x, 0).normalize()
      const halfW = width / 2
      const left = p.clone().addScaledVector(normal, halfW)
      const right = p.clone().addScaledVector(normal, -halfW)

      vertices.push(left.x, left.y, left.z)
      vertices.push(right.x, right.y, right.z)

      if (i < numPts - 1) {
        const base = i * 2
        indices.push(base, base + 1, base + 2)
        indices.push(base + 1, base + 3, base + 2)
      }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    return geo
  }

  function frameRouteView(): void {
    if (!currentOrigin || !currentDest) return

    if (is2DMode) {
      const p1 = latLonToFlat(currentOrigin.lat, currentOrigin.lon)
      const p2 = latLonToFlat(currentDest.lat, currentDest.lon)
      const midX = (p1.x + p2.x) / 2
      const midY = (p1.y + p2.y) / 2

      flatPanX = midX
      flatPanY = THREE.MathUtils.clamp(midY, -1.6, 1.6)

      const dist = p1.distanceTo(p2)
      flatTargetZoom = THREE.MathUtils.clamp(dist * 0.95 + 1.8, 2.4, 6.2)
    } else {
      const vOrigin = latLonToVector3(currentOrigin.lat, currentOrigin.lon, RADIUS).normalize()
      const vDest = latLonToVector3(currentDest.lat, currentDest.lon, RADIUS).normalize()
      const midWorld = vOrigin.clone().add(vDest).normalize()
      const angle = vOrigin.angleTo(vDest)
      const targetDist = THREE.MathUtils.clamp(2.6 + angle * 1.5, 2.4, 6.5)

      isFlying = true
      flyStartTime = performance.now()
      flyDuration = 1400
      flyStartPos.copy(camera.position)
      flyEndPos.copy(midWorld).multiplyScalar(targetDist)
      flyMidAltitude = Math.max(flyStartPos.length(), flyEndPos.length()) * 1.08
    }
  }

  function renderRoutePolylines(): void {
    clearRouteVisuals()
    if (availableRoutes.length === 0) return

    availableRoutes.forEach((route, idx) => {
      const isSelected = idx === selectedRouteIndex

      // 1. 3D Route Rendering: Physical 3D Tube with ambient & starlight response
      if (route.points3D.length >= 2) {
        const curve = new THREE.CatmullRomCurve3(route.points3D)
        const tubeRadius = isSelected ? 0.009 : 0.0045
        const tubeGeo = new THREE.TubeGeometry(curve, 64, tubeRadius, 8, false)
        const tubeMat = new THREE.MeshBasicMaterial({
          color: isSelected ? 0x8ab4f8 : 0x5f6368,
          transparent: true,
          opacity: isSelected ? 0.98 : 0.55,
        })
        const tube3D = new THREE.Mesh(tubeGeo, tubeMat)
        tube3D.renderOrder = isSelected ? 12 : 6
        routeLines3DGroup.add(tube3D)

        if (isSelected) {
          // Luminous cyan outer glow tube
          const glowGeo = new THREE.TubeGeometry(curve, 64, 0.016, 8, false)
          const glowMat = new THREE.MeshBasicMaterial({
            color: 0x1a73e8,
            transparent: true,
            opacity: 0.38,
            blending: THREE.AdditiveBlending,
          })
          const glow3D = new THREE.Mesh(glowGeo, glowMat)
          glow3D.renderOrder = 11
          routeLines3DGroup.add(glow3D)
        }
      }

      // 2. 2D Route Rendering: Bold Solid Ribbon Quad Mesh with Rounded Caps
      const validSegments2D: THREE.Vector3[][] = [[]]
      for (let i = 0; i < route.points2D.length; i++) {
        const pt = route.points2D[i]
        const currentSeg = validSegments2D[validSegments2D.length - 1]
        if (currentSeg.length > 0) {
          const prev = currentSeg[currentSeg.length - 1]
          if (Math.abs(pt.x - prev.x) > FLAT_WIDTH * 0.4) {
            // Crossed longitude wrap boundary, split line segment
            validSegments2D.push([])
          }
        }
        validSegments2D[validSegments2D.length - 1].push(new THREE.Vector3(pt.x, pt.y, isSelected ? 0.028 : 0.022))
      }

      validSegments2D.forEach((seg) => {
        if (seg.length < 2) return

        if (isSelected) {
          // Outer Google Maps navy border casing
          const casingGeo = createRibbonGeometry(seg, 0.052)
          const casingMat = new THREE.MeshBasicMaterial({
            color: 0x174ea6,
            transparent: true,
            opacity: 0.95,
          })
          const casingMesh = new THREE.Mesh(casingGeo, casingMat)
          casingMesh.renderOrder = 25
          flatRouteLinesCenter.add(casingMesh)
          flatRouteLinesLeft.add(casingMesh.clone())
          flatRouteLinesRight.add(casingMesh.clone())

          // Inner vibrant Google Blue core
          const coreGeo = createRibbonGeometry(seg, 0.038)
          const coreMat = new THREE.MeshBasicMaterial({
            color: 0x8ab4f8,
            transparent: true,
            opacity: 1.0,
          })
          const coreMesh = new THREE.Mesh(coreGeo, coreMat)
          coreMesh.renderOrder = 26
          flatRouteLinesCenter.add(coreMesh)
          flatRouteLinesLeft.add(coreMesh.clone())
          flatRouteLinesRight.add(coreMesh.clone())

          // Rounded End Caps
          const capGeo = new THREE.CircleGeometry(0.024, 16)
          const capMat = new THREE.MeshBasicMaterial({ color: 0x8ab4f8 })
          const startCap = new THREE.Mesh(capGeo, capMat)
          startCap.position.copy(seg[0])
          startCap.position.z = 0.029
          startCap.renderOrder = 27
          flatRouteLinesCenter.add(startCap)
          flatRouteLinesLeft.add(startCap.clone())
          flatRouteLinesRight.add(startCap.clone())

          const endCap = new THREE.Mesh(capGeo, capMat)
          endCap.position.copy(seg[seg.length - 1])
          endCap.position.z = 0.029
          endCap.renderOrder = 27
          flatRouteLinesCenter.add(endCap)
          flatRouteLinesLeft.add(endCap.clone())
          flatRouteLinesRight.add(endCap.clone())
        } else {
          // Alternative Route Ribbon (Muted Slate)
          const altGeo = createRibbonGeometry(seg, 0.026)
          const altMat = new THREE.MeshBasicMaterial({
            color: 0x5f6368,
            transparent: true,
            opacity: 0.65,
          })
          const altMesh = new THREE.Mesh(altGeo, altMat)
          altMesh.renderOrder = 20
          flatRouteLinesCenter.add(altMesh)
          flatRouteLinesLeft.add(altMesh.clone())
          flatRouteLinesRight.add(altMesh.clone())
        }
      })
    })
  }

  // -------------------------------------------------------------
  // Controls & Navigation Modes (3D Orbital vs 2D Flat Looped)
  // -------------------------------------------------------------
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.052
  controls.enablePan = false
  controls.rotateSpeed = 0.65
  controls.minDistance = 1.95
  controls.maxDistance = 9.2
  controls.minPolarAngle = 0.08
  controls.maxPolarAngle = Math.PI - 0.08
  controls.target.set(0, 0, 0)
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.ROTATE,
  }

  let is2DMode = false
  let flatPanX = 0.0
  let flatPanY = 0.0
  let flatZoom = 4.3
  let flatTargetZoom = 4.3

  let isPointerDown = false
  let lastPointerX = 0
  let lastPointerY = 0
  let pointerDownX = 0
  let pointerDownY = 0
  let pointerDownTime = 0
  let velocityX = 0
  let velocityY = 0
  let lastUserInteraction = performance.now()

  const startedAt = performance.now()
  const introDuration = 3200

  let isFlying = false
  let flyStartTime = 0
  let flyDuration = 2200
  const flyStartPos = new THREE.Vector3()
  const flyEndPos = new THREE.Vector3()
  let flyMidAltitude = 0

  function onUserActive(): void {
    lastUserInteraction = performance.now()
    if (!is2DMode && !isSimulating) {
      controls.autoRotate = false
    }
  }

  // Pointer Click Picking Handler (Places Rocket Landing Point or Destination Pin)
  function handleMapClick(lat: number, lon: number): void {
    onUserActive()

    let target = pickingTarget
    if (target === 'auto') {
      if (!currentOrigin) {
        target = 'origin'
      } else if (!currentDest) {
        target = 'dest'
      } else {
        target = 'dest'
      }
    }

    if (target === 'origin') {
      currentOrigin = {
        lat: parseFloat(lat.toFixed(2)),
        lon: parseFloat(lon.toFixed(2)),
        name: `Landing Site (${formatLatLon(lat, lon).split('   ')[0].trim()})`,
      }
      placeRocketMarker(lat, lon)
      pickingTarget = 'auto'
      computeRoutes()
    } else if (target === 'dest') {
      currentDest = {
        lat: parseFloat(lat.toFixed(2)),
        lon: parseFloat(lon.toFixed(2)),
        name: `Destination (${formatLatLon(lat, lon).split('   ')[0].trim()})`,
      }
      placePinMarker(lat, lon)
      pickingTarget = 'auto'
      computeRoutes()
    }
  }

  function handlePointerDown(event: PointerEvent): void {
    onUserActive()
    pointerDownX = event.clientX
    pointerDownY = event.clientY
    pointerDownTime = performance.now()

    if (!is2DMode) return
    if (event.button !== 0 && event.button !== 1) return
    isPointerDown = true
    lastPointerX = event.clientX
    lastPointerY = event.clientY
    velocityX = 0
    velocityY = 0
    renderer.domElement.style.cursor = 'grabbing'
  }

  function handlePointerMove(event: PointerEvent): void {
    onUserActive()
    const bounds = renderer.domElement.getBoundingClientRect()
    const px = ((event.clientX - bounds.left) / bounds.width) * 2 - 1
    const py = -((event.clientY - bounds.top) / bounds.height) * 2 + 1

    if (is2DMode) {
      if (isPointerDown) {
        const dx = event.clientX - lastPointerX
        const dy = event.clientY - lastPointerY
        const dragScale = (camera.position.z / bounds.height) * 1.55
        const stepX = dx * dragScale
        const stepY = dy * dragScale

        flatPanX -= stepX
        flatPanY += stepY
        velocityX = -stepX * 0.75
        velocityY = stepY * 0.75

        lastPointerX = event.clientX
        lastPointerY = event.clientY
      }

      const vFovRad = THREE.MathUtils.degToRad(camera.fov)
      const visibleHeight = 2 * Math.tan(vFovRad / 2) * camera.position.z
      const visibleWidth = visibleHeight * camera.aspect

      const worldCursorX = (px * visibleWidth) / 2
      const worldCursorY = flatPanY + (py * visibleHeight) / 2

      const mapRelX = worldCursorX + flatPanX
      const normMapX = THREE.MathUtils.euclideanModulo(mapRelX + FLAT_WIDTH / 2, FLAT_WIDTH)
      let lon = (normMapX / FLAT_WIDTH) * 360
      lon = THREE.MathUtils.euclideanModulo(lon, 360)

      const lat = THREE.MathUtils.clamp((worldCursorY / FLAT_HEIGHT) * 180, -89.9, 89.9)
      coordinateReadout.textContent = formatLatLon(lat, lon)
    } else {
      const pointerVec = new THREE.Vector2(px, py)
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(pointerVec, camera)
      const hit = raycaster.intersectObject(marsSphere, false)[0]
      if (hit) {
        const localPoint = marsGroup.worldToLocal(hit.point.clone())
        const { lat, lon } = vector3ToLatLon(localPoint)
        coordinateReadout.textContent = formatLatLon(lat, lon)
      }
    }
  }

  function handlePointerUp(event: PointerEvent): void {
    if (is2DMode) {
      isPointerDown = false
      renderer.domElement.style.cursor = 'grab'
    }

    const dist = Math.hypot(event.clientX - pointerDownX, event.clientY - pointerDownY)
    const duration = performance.now() - pointerDownTime

    // Detect intentional click/tap on Mars
    if (dist < 8 && duration < 380) {
      const bounds = renderer.domElement.getBoundingClientRect()
      const px = ((event.clientX - bounds.left) / bounds.width) * 2 - 1
      const py = -((event.clientY - bounds.top) / bounds.height) * 2 + 1

      if (is2DMode) {
        const vFovRad = THREE.MathUtils.degToRad(camera.fov)
        const visibleHeight = 2 * Math.tan(vFovRad / 2) * camera.position.z
        const visibleWidth = visibleHeight * camera.aspect

        const worldCursorX = (px * visibleWidth) / 2
        const worldCursorY = flatPanY + (py * visibleHeight) / 2

        const mapRelX = worldCursorX + flatPanX
        const normMapX = THREE.MathUtils.euclideanModulo(mapRelX + FLAT_WIDTH / 2, FLAT_WIDTH)
        let lon = (normMapX / FLAT_WIDTH) * 360
        lon = THREE.MathUtils.euclideanModulo(lon, 360)

        const lat = THREE.MathUtils.clamp((worldCursorY / FLAT_HEIGHT) * 180, -89.9, 89.9)
        handleMapClick(lat, lon)
      } else {
        const pointerVec = new THREE.Vector2(px, py)
        const raycaster = new THREE.Raycaster()
        raycaster.setFromCamera(pointerVec, camera)
        const hit = raycaster.intersectObject(marsSphere, false)[0]
        if (hit) {
          const localPoint = marsGroup.worldToLocal(hit.point.clone())
          const { lat, lon } = vector3ToLatLon(localPoint)
          handleMapClick(lat, lon)
        }
      }
    }
  }

  function handleWheel(event: WheelEvent): void {
    onUserActive()
    if (!is2DMode) return
    event.preventDefault()
    const zoomFactor = 1 + event.deltaY * 0.0012
    flatTargetZoom = THREE.MathUtils.clamp(flatTargetZoom * zoomFactor, 1.85, 7.5)
  }

  renderer.domElement.addEventListener('pointerdown', handlePointerDown)
  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', handlePointerUp)
  window.addEventListener('pointercancel', handlePointerUp)
  renderer.domElement.addEventListener('wheel', handleWheel, { passive: false })
  renderer.domElement.addEventListener('pointerleave', () => {
    if (!is2DMode) {
      const forward = camera.getWorldDirection(new THREE.Vector3()).negate()
      const localCenter = marsGroup.worldToLocal(forward.clone().multiplyScalar(RADIUS))
      const { lat, lon } = vector3ToLatLon(localCenter)
      coordinateReadout.textContent = formatLatLon(lat, lon)
    }
  })

  const resizeObserver = new ResizeObserver(() => resize())
  resizeObserver.observe(container)

  function resize(): void {
    const width = Math.max(1, container.clientWidth)
    const height = Math.max(1, container.clientHeight)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  }

  function getCameraAltitudeKm(): number {
    if (is2DMode) {
      return Math.round((camera.position.z / 4.3) * 5800)
    }
    const dist = camera.position.distanceTo(controls.target)
    const altitudeUnits = Math.max(0.01, dist - RADIUS)
    return Math.round((altitudeUnits / RADIUS) * MARS_REAL_RADIUS_KM)
  }

  function zoomByFactor(multiplier: number): void {
    onUserActive()
    if (is2DMode) {
      flatTargetZoom = THREE.MathUtils.clamp(flatTargetZoom * multiplier, 1.85, 7.5)
    } else {
      const offset = camera.position.clone().sub(controls.target)
      const currentDist = offset.length()
      const targetDist = THREE.MathUtils.clamp(currentDist * multiplier, controls.minDistance, controls.maxDistance)
      camera.position.copy(controls.target).add(offset.normalize().multiplyScalar(targetDist))
      controls.update()
    }
  }

  function flyToCoordinate(lat: number, lon: number, distance: number, polarAngle?: number, duration = 2400): void {
    onUserActive()
    if (is2DMode) {
      const flatPos = latLonToFlat(lat, lon, FLAT_WIDTH, FLAT_HEIGHT)
      flatPanX = flatPos.x
      flatPanY = THREE.MathUtils.clamp(flatPos.y, -1.8, 1.8)
      flatTargetZoom = 2.4
      return
    }

    isFlying = true
    flyStartTime = performance.now()
    flyDuration = duration
    flyStartPos.copy(camera.position)

    const targetLocal = latLonToVector3(lat, lon, 1.0)
    const targetWorld = targetLocal.clone().applyQuaternion(marsGroup.quaternion).normalize()

    if (polarAngle !== undefined) {
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(marsGroup.quaternion)
      const tangent = new THREE.Vector3().crossVectors(targetWorld, up).normalize()
      if (tangent.lengthSq() > 0.001) {
        const tiltOffset = (Math.PI / 2 - polarAngle) * 0.4
        const tiltedDir = targetWorld.clone().applyAxisAngle(tangent, tiltOffset).normalize()
        flyEndPos.copy(tiltedDir).multiplyScalar(distance)
      } else {
        flyEndPos.copy(targetWorld).multiplyScalar(distance)
      }
    } else {
      flyEndPos.copy(targetWorld).multiplyScalar(distance)
    }

    const currentAlt = flyStartPos.length()
    const targetAlt = distance
    flyMidAltitude = Math.max(currentAlt, targetAlt) * 1.15
  }

  function switchMode(to2D: boolean): boolean {
    onUserActive()
    is2DMode = to2D
    isFlying = false

    if (is2DMode) {
      controls.enabled = false
      marsGroup.visible = false
      flatGroup.visible = true
      renderer.domElement.style.cursor = 'grab'
      tiltLabel.textContent = '3D'

      flatZoom = Math.max(flatZoom, 4.0)
      flatTargetZoom = flatZoom
      camera.position.set(0, flatPanY, flatZoom)
      camera.lookAt(0, flatPanY, 0)

      if (currentOrigin && currentDest) {
        frameRouteView()
      }
    } else {
      marsGroup.visible = true
      flatGroup.visible = false
      controls.enabled = true
      renderer.domElement.style.cursor = 'default'
      tiltLabel.textContent = '2D'

      camera.position.copy(default3DPosition)
      controls.target.set(0, 0, 0)
      controls.update()

      if (currentOrigin && currentDest) {
        frameRouteView()
      }
    }

    return is2DMode
  }

  // -------------------------------------------------------------
  // Animation Loop
  // -------------------------------------------------------------
  let animationFrame = 0

  const animate = (now: number): void => {
    animationFrame = window.requestAnimationFrame(animate)

    // 1. Animate 3D Rocket Touchdown
    if (activeRocketMarker) {
      const m = activeRocketMarker
      if (m.isAnimating) {
        const elapsed = now - m.animStartTime
        const p = THREE.MathUtils.clamp(elapsed / m.animDuration, 0, 1)

        // Decelerating descent curve
        const descentAlt = (1 - p) * (1 - p) * 0.58
        const bounce = p >= 1 ? Math.sin((now - m.animStartTime) * 0.015) * 0.003 : 0
        const currentR = RADIUS + descentAlt + bounce
        m.group.position.copy(m.normal.clone().multiplyScalar(currentR))

        // Update flat map copies height
        m.flatCopies.forEach((c) => {
          c.position.z = 0.02 + descentAlt * 0.8
        })

        // Thruster flame turbulence
        if (m.flameMesh && m.thrusterLight) {
          if (p < 0.95) {
            const flicker = 1 + Math.sin(now * 0.04) * 0.15
            m.flameMesh.scale.set(flicker, 1 + Math.cos(now * 0.06) * 0.25, flicker)
            m.thrusterLight.intensity = (1 - p) * 2.8 + Math.random() * 0.4
          } else {
            m.flameMesh.visible = false
            m.thrusterLight.visible = false
          }
        }

        // Touchdown Regolith Shockwave Ring
        if (m.shockwaveMesh && p >= 0.92) {
          const shockP = THREE.MathUtils.clamp((p - 0.92) / 0.08, 0, 1)
          m.shockwaveMesh.scale.set(1 + shockP * 6.5, 1 + shockP * 6.5, 1)
          ;(m.shockwaveMesh.material as THREE.MeshBasicMaterial).opacity = (1 - shockP) * 0.85
        }

        if (p >= 1) {
          m.isAnimating = false
        }
      }
    }

    // 2. Animate 3D Destination Pin Drop & Elastic Bounce
    if (activePinMarker) {
      const m = activePinMarker
      if (m.isAnimating) {
        const elapsed = now - m.animStartTime
        const p = THREE.MathUtils.clamp(elapsed / m.animDuration, 0, 1)

        // Elastic bounce physics
        const bounceHeight = Math.abs(Math.cos(p * Math.PI * 2.5)) * Math.exp(-p * 3.8) * 0.42
        const currentR = RADIUS + bounceHeight
        m.group.position.copy(m.normal.clone().multiplyScalar(currentR))

        m.flatCopies.forEach((c) => {
          c.position.z = 0.02 + bounceHeight * 0.8
        })

        if (p >= 1) {
          m.isAnimating = false
        }
      }

      // Pin beacon beam subtle pulse
      if (m.beaconBeam) {
        m.beaconBeam.scale.y = 1 + Math.sin(now * 0.003) * 0.08
      }
      if (m.pulseRing) {
        const pulse = 1 + Math.sin(now * 0.005) * 0.25
        m.pulseRing.scale.set(pulse, pulse, 1)
      }
    }

    // 3. Simulated Route Fly-Through Animation
    if (isSimulating && simRoutePoints.length > 1) {
      const elapsed = now - simStartTime
      const t = THREE.MathUtils.clamp(elapsed / simDuration, 0, 1)

      const activeRoute = availableRoutes[selectedRouteIndex]
      const totalKm = activeRoute ? activeRoute.distanceKm : 1800
      const kmRemaining = Math.max(0, Math.round(totalKm * (1 - t)))
      const speedKmH = 24

      if (onSimulationProgressCallback && activeRoute) {
        onSimulationProgressCallback(t, {
          kmRemaining,
          speedKmH,
          routeName: activeRoute.name,
        })
      }

      // Interpolate along route points
      const exactIndex = t * (simRoutePoints.length - 1)
      const idx0 = Math.floor(exactIndex)
      const idx1 = Math.min(simRoutePoints.length - 1, idx0 + 1)
      const segT = exactIndex - idx0

      const p0 = simRoutePoints[idx0]
      const p1 = simRoutePoints[idx1]
      const currentPos = p0.clone().lerp(p1, segT)

      // Move 3D rover
      simRoverGroup.visible = true
      simRoverGroup.position.copy(currentPos)
      const roverNorm = currentPos.clone().normalize()
      simRoverGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), roverNorm)

      // Move 2D flat rover
      const roverLatLon = vector3ToLatLon(currentPos)
      const flatRoverPos = latLonToFlat(roverLatLon.lat, roverLatLon.lon)
      flatSimRoverCenter.visible = true
      flatSimRoverLeft.visible = true
      flatSimRoverRight.visible = true
      flatSimRoverCenter.position.set(flatRoverPos.x, flatRoverPos.y, 0.02)
      flatSimRoverLeft.position.set(flatRoverPos.x, flatRoverPos.y, 0.02)
      flatSimRoverRight.position.set(flatRoverPos.x, flatRoverPos.y, 0.02)

      if (!is2DMode) {
        // Third-person chase camera view following rover
        const worldPos = currentPos.clone().applyQuaternion(marsGroup.quaternion)
        const camOffset = worldPos.clone().normalize().multiplyScalar(2.35)
        camera.position.lerp(camOffset, 0.08)
        controls.target.lerp(worldPos, 0.12)
        controls.update()
      } else {
        flatPanX += (flatRoverPos.x - flatPanX) * 0.08
        flatPanY += (flatRoverPos.y - flatPanY) * 0.08
      }

      if (t >= 1) {
        // Route complete
        isSimulating = false
        simRoverGroup.visible = false
        flatSimRoverCenter.visible = false
        flatSimRoverLeft.visible = false
        flatSimRoverRight.visible = false
        if (onSimulationProgressCallback && activeRoute) {
          onSimulationProgressCallback(1.0, { kmRemaining: 0, speedKmH: 0, routeName: activeRoute.name })
        }
      }
    }

    if (is2DMode) {
      // 2D Flat Looped Map Physics
      flatZoom += (flatTargetZoom - flatZoom) * 0.12

      if (!isPointerDown && !isSimulating) {
        flatPanX += velocityX
        flatPanY += velocityY
        velocityX *= 0.91
        velocityY *= 0.91
        if (Math.abs(velocityX) < 0.0001) velocityX = 0
        if (Math.abs(velocityY) < 0.0001) velocityY = 0
      }

      const maxPanY = Math.max(0.2, (FLAT_HEIGHT / 2) - 0.6)
      flatPanY = THREE.MathUtils.clamp(flatPanY, -maxPanY, maxPanY)

      const normPanX = THREE.MathUtils.euclideanModulo(flatPanX, FLAT_WIDTH)

      panelCenter.position.set(-normPanX, 0, 0)
      panelLeft.position.set(-normPanX - FLAT_WIDTH, 0, 0)
      panelRight.position.set(-normPanX + FLAT_WIDTH, 0, 0)

      paperBacking.position.set(-normPanX, 0, -0.015)
      topBorder.position.set(-normPanX, FLAT_HEIGHT / 2 + 0.02, 0.002)
      bottomBorder.position.set(-normPanX, -FLAT_HEIGHT / 2 - 0.02, 0.002)

      camera.position.set(0, flatPanY, flatZoom)
      camera.lookAt(0, flatPanY, 0)
      camera.up.set(0, 1, 0)

      compassNeedle.style.transform = 'rotate(0deg)'

      flatLight.intensity = 1.85
      flatLight.position.set(0, flatPanY, flatZoom + 5)
    } else {
      // 3D Globe Navigation
      flatLight.intensity = 0.0

      if (now - startedAt < introDuration && !isFlying && !isSimulating) {
        const p = THREE.MathUtils.clamp((now - startedAt) / introDuration, 0, 1)
        const ease = 1 - Math.pow(1 - p, 3)
        camera.position.lerpVectors(startFlyInPosition, default3DPosition, ease)
      }

      if (isFlying) {
        const elapsed = now - flyStartTime
        const t = THREE.MathUtils.clamp(elapsed / flyDuration, 0, 1)
        const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

        const currentDir = new THREE.Vector3().copy(flyStartPos).normalize()
        const endDir = new THREE.Vector3().copy(flyEndPos).normalize()
        const slerpedDir = currentDir.clone().lerp(endDir, ease).normalize()

        const arc = Math.sin(t * Math.PI) * (flyMidAltitude - Math.max(flyStartPos.length(), flyEndPos.length()))
        const currentDist = THREE.MathUtils.lerp(flyStartPos.length(), flyEndPos.length(), ease) + Math.max(0, arc)

        camera.position.copy(slerpedDir).multiplyScalar(currentDist)

        if (t >= 1) {
          isFlying = false
          controls.update()
        }
      }

      if (!isFlying && !isSimulating && now - lastUserInteraction > 4200) {
        controls.autoRotate = true
        controls.autoRotateSpeed = 0.22
      }

      controls.update()

      const heading = Math.atan2(camera.position.x, camera.position.z)
      const headingDeg = THREE.MathUtils.radToDeg(heading)
      compassNeedle.style.transform = `rotate(${-headingDeg}deg)`

      cameraLight.position.copy(camera.position)

      const targetMix = allLightedMode ? 1.0 : 0.0
      currentLightingMix += (targetMix - currentLightingMix) * 0.085
      if (Math.abs(targetMix - currentLightingMix) < 0.001) {
        currentLightingMix = targetMix
      }

      sunLight.intensity = THREE.MathUtils.lerp(2.7, 1.85, currentLightingMix)
      nightFill.intensity = THREE.MathUtils.lerp(1.25, 0.0, currentLightingMix)
      cameraLight.intensity = THREE.MathUtils.lerp(0.0, 2.35, currentLightingMix)
      allLightFill.intensity = THREE.MathUtils.lerp(0.0, 1.65, currentLightingMix)
      ambientLight.intensity = THREE.MathUtils.lerp(1.45, 2.65, currentLightingMix)

      ambientLight.color.lerpColors(new THREE.Color(0x60463b), new THREE.Color(0xd6ad98), currentLightingMix)
      ambientLight.groundColor.lerpColors(new THREE.Color(0x24324f), new THREE.Color(0x7688a5), currentLightingMix)

      outerAtmosphereMaterial.uniforms.uAllLighted.value = currentLightingMix
      innerHazeMaterial.uniforms.uAllLighted.value = currentLightingMix
    }

    const altitudeKm = getCameraAltitudeKm()
    altitudeReadout.textContent = `Camera: ${altitudeKm.toLocaleString()} km`

    const pulse = 1 + Math.sin(now * 0.0035) * 0.15
    landmarkBeacons.forEach((b) => {
      b.mesh.scale.set(pulse, pulse, pulse)
    })

    renderer.render(scene, camera)
  }

  animationFrame = window.requestAnimationFrame(animate)

  return {
    zoomIn: () => zoomByFactor(0.8),
    zoomOut: () => zoomByFactor(1.25),
    reset: () => {
      onUserActive()
      isFlying = false
      if (is2DMode) {
        flatPanX = 0.0
        flatPanY = 0.0
        flatTargetZoom = 4.3
      } else {
        controls.reset()
        camera.position.copy(default3DPosition)
        marsGroup.rotation.set(0.03, -0.85, 0.08)
        controls.target.set(0, 0, 0)
        controls.update()
      }
    },
    toggleTilt: () => {
      return switchMode(!is2DMode)
    },
    resetNorth: () => {
      onUserActive()
      if (is2DMode) {
        flatPanX = 0.0
        flatPanY = 0.0
        return
      }
      const currentDist = camera.position.distanceTo(controls.target)
      const currentPolar = THREE.MathUtils.clamp(controls.getPolarAngle(), 0.3, Math.PI - 0.3)
      const targetX = 0
      const targetY = currentDist * Math.cos(currentPolar)
      const targetZ = currentDist * Math.sin(currentPolar)

      isFlying = true
      flyStartTime = performance.now()
      flyDuration = 1200
      flyStartPos.copy(camera.position)
      flyEndPos.set(targetX, targetY, targetZ)
      flyMidAltitude = currentDist
    },
    flyToLandmark: (id: string) => {
      const lm = LANDMARKS[id]
      if (!lm) return
      flyToCoordinate(lm.lat, lm.lon, lm.distance, lm.polarAngle, 2600)
    },
    setDataset: (datasetId: string) => {
      onUserActive()
      applyBaseDataset(datasetId)
    },
    setOverlayDataset: (datasetId: string | null) => {
      onUserActive()
      applyOverlayDataset(datasetId)
    },
    setOverlayOpacity: (opacity: number) => {
      onUserActive()
      currentOverlayOpacity = THREE.MathUtils.clamp(opacity, 0.0, 1.0)
      overlayUniforms.uOverlayOpacity.value = currentOverlayOpacity
      updateAttributionText()
    },
    getBaseDataset: () => activeBaseDatasetId,
    getOverlayDataset: () => activeOverlayDatasetId,
    getOverlayOpacity: () => currentOverlayOpacity,
    toggleLightingMode: () => {
      onUserActive()
      allLightedMode = !allLightedMode
      return allLightedMode
    },
    setLightingMode: (allLighted: boolean) => {
      onUserActive()
      allLightedMode = allLighted
    },
    isAllLighted: () => allLightedMode,
    is2D: () => is2DMode,

    // Google Maps Martian Route Planning Implementation
    setOriginPoint: (point: RoutePoint | null) => {
      currentOrigin = point
      if (point) {
        placeRocketMarker(point.lat, point.lon)
      } else if (activeRocketMarker) {
        routeMarkersGroup.remove(activeRocketMarker.group)
        activeRocketMarker.flatCopies.forEach((c) => c.parent?.remove(c))
        activeRocketMarker = null
      }
      computeRoutes()
    },
    setDestinationPoint: (point: RoutePoint | null) => {
      currentDest = point
      if (point) {
        placePinMarker(point.lat, point.lon)
      } else if (activePinMarker) {
        routeMarkersGroup.remove(activePinMarker.group)
        activePinMarker.flatCopies.forEach((c) => c.parent?.remove(c))
        activePinMarker = null
      }
      computeRoutes()
    },
    getOriginPoint: () => currentOrigin,
    getDestinationPoint: () => currentDest,
    swapPoints: () => {
      const temp = currentOrigin
      currentOrigin = currentDest
      currentDest = temp

      if (currentOrigin) {
        placeRocketMarker(currentOrigin.lat, currentOrigin.lon)
      } else if (activeRocketMarker) {
        routeMarkersGroup.remove(activeRocketMarker.group)
        activeRocketMarker.flatCopies.forEach((c) => c.parent?.remove(c))
        activeRocketMarker = null
      }

      if (currentDest) {
        placePinMarker(currentDest.lat, currentDest.lon)
      } else if (activePinMarker) {
        routeMarkersGroup.remove(activePinMarker.group)
        activePinMarker.flatCopies.forEach((c) => c.parent?.remove(c))
        activePinMarker = null
      }

      computeRoutes()
    },
    clearRoute: () => {
      currentOrigin = null
      currentDest = null
      if (activeRocketMarker) {
        routeMarkersGroup.remove(activeRocketMarker.group)
        activeRocketMarker.flatCopies.forEach((c) => c.parent?.remove(c))
        activeRocketMarker = null
      }
      if (activePinMarker) {
        routeMarkersGroup.remove(activePinMarker.group)
        activePinMarker.flatCopies.forEach((c) => c.parent?.remove(c))
        activePinMarker = null
      }
      clearRouteVisuals()
      availableRoutes = []
      if (isSimulating) {
        isSimulating = false
        simRoverGroup.visible = false
        flatSimRoverCenter.visible = false
        flatSimRoverLeft.visible = false
        flatSimRoverRight.visible = false
      }
      if (onRouteUpdatedCallback) {
        onRouteUpdatedCallback([], 0, null, null)
      }
    },
    setTravelMode: (mode: TravelMode) => {
      currentTravelMode = mode
      computeRoutes()
    },
    getTravelMode: () => currentTravelMode,
    getAvailableRoutes: () => availableRoutes,
    setSelectedRouteIndex: (index: number) => {
      if (index >= 0 && index < availableRoutes.length) {
        selectedRouteIndex = index
        renderRoutePolylines()
        if (onRouteUpdatedCallback) {
          onRouteUpdatedCallback(availableRoutes, selectedRouteIndex, currentOrigin, currentDest)
        }
      }
    },
    getSelectedRouteIndex: () => selectedRouteIndex,
    startRouteSimulation: () => {
      if (availableRoutes.length === 0 || !availableRoutes[selectedRouteIndex]) return
      isSimulating = true
      simStartTime = performance.now()
      simRoutePoints = availableRoutes[selectedRouteIndex].points3D
      simDuration = 12000
    },
    stopRouteSimulation: () => {
      isSimulating = false
      simRoverGroup.visible = false
      flatSimRoverCenter.visible = false
      flatSimRoverLeft.visible = false
      flatSimRoverRight.visible = false
    },
    isSimulatingRoute: () => isSimulating,
    setPickingTarget: (target: 'origin' | 'dest' | 'auto' | 'none') => {
      pickingTarget = target
    },
    getPickingTarget: () => pickingTarget,
    onRouteUpdated: (callback) => {
      onRouteUpdatedCallback = callback
    },
    onSimulationProgress: (callback) => {
      onSimulationProgressCallback = callback
    },
    dispose: () => {
      window.cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
      renderer.domElement.removeEventListener('wheel', handleWheel)
      controls.dispose()
      scene.traverse((item) => {
        if (item instanceof THREE.Mesh || item instanceof THREE.Points || item instanceof THREE.Line) {
          item.geometry.dispose()
          const materials = Array.isArray(item.material) ? item.material : [item.material]
          materials.forEach((m) => m.dispose())
        }
      })
      Object.values(textureCache).forEach((tex) => tex.dispose())
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}

function makeStarfield(): THREE.Points {
  const count = 3200
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const palette = [
    new THREE.Color('#e8ecf8'),
    new THREE.Color('#fff2e0'),
    new THREE.Color('#9bb4df'),
    new THREE.Color('#f0c4a8'),
  ]

  for (let i = 0; i < count; i += 1) {
    const radius = 24 + Math.random() * 48
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)

    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = radius * Math.cos(phi)
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta)

    const color = palette[Math.floor(Math.random() * palette.length)]
    const intensity = 0.42 + Math.random() * 0.58

    colors[i * 3] = color.r * intensity
    colors[i * 3 + 1] = color.g * intensity
    colors[i * 3 + 2] = color.b * intensity
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const material = new THREE.PointsMaterial({
    size: 0.038,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.88,
    vertexColors: true,
    depthWrite: false,
  })

  return new THREE.Points(geometry, material)
}