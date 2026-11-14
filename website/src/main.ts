import './styles.css'
import type { GlobeExperience, RouteOption, RoutePoint, TravelMode } from './globe'
import { createGlobeExperience, LANDMARKS } from './globe'

const landing = document.querySelector<HTMLElement>('#landing')!
const universe = document.querySelector<HTMLElement>('#universe')!
const blackout = document.querySelector<HTMLElement>('#blackout')!
const loading = document.querySelector<HTMLElement>('#loading')!
const scene = document.querySelector<HTMLElement>('#globe-scene')!
const coordinateReadout = document.querySelector<HTMLElement>('#coordinates-live')!
const altitudeReadout = document.querySelector<HTMLElement>('#camera-altitude')!
const compassNeedle = document.querySelector<HTMLElement>('#ge-compass-needle')!
const tiltLabel = document.querySelector<HTMLElement>('#ge-tilt-label')!

const zoomInButton = document.querySelector<HTMLButtonElement>('#zoom-in')!
const zoomOutButton = document.querySelector<HTMLButtonElement>('#zoom-out')!
const resetButton = document.querySelector<HTMLButtonElement>('#reset-view')!
const compassButton = document.querySelector<HTMLButtonElement>('#ge-compass')!
const tiltButton = document.querySelector<HTMLButtonElement>('#ge-tilt-toggle')!
const fullscreenButton = document.querySelector<HTMLButtonElement>('#ge-fullscreen')!
const lightingNavToggle = document.querySelector<HTMLButtonElement>('#ge-lighting-toggle')!
const lightingPill = document.querySelector<HTMLButtonElement>('#ge-lighting-pill')!
const lightingPillText = document.querySelector<HTMLElement>('#ge-lighting-pill-text')!
const lightingStatusBtn = document.querySelector<HTMLButtonElement>('#ge-lighting-status')!

const landmarksToggle = document.querySelector<HTMLButtonElement>('#ge-landmarks-toggle')!
const landmarksMenu = document.querySelector<HTMLElement>('#ge-landmarks-menu')!
const searchPill = document.querySelector<HTMLElement>('#ge-search-pill')!
const landmarkChips = document.querySelectorAll<HTMLButtonElement>('.ge-landmark-chip')

const layersToggle = document.querySelector<HTMLButtonElement>('#ge-layers-toggle')!
const layersMenu = document.querySelector<HTMLElement>('#ge-layers-menu')!
const layersPill = document.querySelector<HTMLElement>('#ge-layers-pill')!
const layersActiveLabel = document.querySelector<HTMLElement>('#ge-layers-active-label')!
const datasetChips = document.querySelectorAll<HTMLButtonElement>('.ge-dataset-chip')
const overlayChips = document.querySelectorAll<HTMLButtonElement>('.ge-overlay-chip')
const overlayControls = document.querySelector<HTMLElement>('#ge-overlay-controls')!
const overlayStatusBadge = document.querySelector<HTMLElement>('#ge-overlay-status-badge')!
const overlaySlider = document.querySelector<HTMLInputElement>('#ge-overlay-slider')!
const overlayValue = document.querySelector<HTMLElement>('#ge-overlay-value')!
const presetButtons = document.querySelectorAll<HTMLButtonElement>('.ge-preset-btn')
const attributionLabel = document.querySelector<HTMLElement>('#attribution-label')!

// Google Maps Martian Route Planner Elements
const routesPill = document.querySelector<HTMLButtonElement>('#ge-routes-pill')!
const routePanel = document.querySelector<HTMLElement>('#gm-route-panel')!
const panelTab = document.querySelector<HTMLButtonElement>('#gm-panel-tab')!
const modeButtons = document.querySelectorAll<HTMLButtonElement>('.gm-mode-btn')

const originInput = document.querySelector<HTMLInputElement>('#gm-origin-input')!
const destInput = document.querySelector<HTMLInputElement>('#gm-dest-input')!
const originClear = document.querySelector<HTMLButtonElement>('#gm-origin-clear')!
const destClear = document.querySelector<HTMLButtonElement>('#gm-dest-clear')!
const originPick = document.querySelector<HTMLButtonElement>('#gm-origin-pick')!
const destPick = document.querySelector<HTMLButtonElement>('#gm-dest-pick')!
const originRow = document.querySelector<HTMLElement>('#gm-origin-row')!
const destRow = document.querySelector<HTMLElement>('#gm-dest-row')!
const swapBtn = document.querySelector<HTMLButtonElement>('#gm-swap-btn')!
const quickChips = document.querySelectorAll<HTMLButtonElement>('.gm-quick-chip')

const statusBanner = document.querySelector<HTMLElement>('#gm-status-banner')!
const statusIcon = document.querySelector<HTMLElement>('#gm-status-icon')!
const statusText = document.querySelector<HTMLElement>('#gm-status-text')!

const routesContainer = document.querySelector<HTMLElement>('#gm-routes-container')!
const routesList = document.querySelector<HTMLElement>('#gm-routes-list')!
const routeCount = document.querySelector<HTMLElement>('#gm-route-count')!

const simulateBtn = document.querySelector<HTMLButtonElement>('#gm-btn-simulate')!
const simulateLabel = document.querySelector<HTMLElement>('#gm-simulate-label')!
const clearBtn = document.querySelector<HTMLButtonElement>('#gm-btn-clear')!

const simHud = document.querySelector<HTMLElement>('#gm-sim-hud')!
const simTitle = document.querySelector<HTMLElement>('#gm-sim-title')!
const simStats = document.querySelector<HTMLElement>('#gm-sim-stats')!
const simExit = document.querySelector<HTMLButtonElement>('#gm-sim-exit')!

const DATASET_SHORT_NAMES: Record<string, string> = {
  viking: 'Viking Color',
  mola: 'MOLA Elevation',
  themis: 'THEMIS IR',
}

let started = false
let globe: GlobeExperience | undefined
let revealFallback: number | undefined

function updateLayerPillText(): void {
  if (!globe) return
  const baseId = globe.getBaseDataset()
  const overId = globe.getOverlayDataset()
  const baseName = DATASET_SHORT_NAMES[baseId] || baseId
  if (overId && DATASET_SHORT_NAMES[overId]) {
    const overName = DATASET_SHORT_NAMES[overId]
    const pct = Math.round(globe.getOverlayOpacity() * 100)
    layersActiveLabel.textContent = `${baseName} + ${overName} (${pct}%)`
    overlayStatusBadge.textContent = `${overName} (${pct}%)`
  } else {
    layersActiveLabel.textContent = baseName
    overlayStatusBadge.textContent = 'None'
  }
}

function revealGlobe(): void {
  if (revealFallback !== undefined) window.clearTimeout(revealFallback)
  loading.hidden = true
  universe.classList.add('is-visible')
  blackout.classList.remove('is-opaque')
  blackout.classList.add('is-clearing')
  window.setTimeout(() => {
    blackout.hidden = true
    blackout.classList.remove('is-clearing')
  }, 1500)
}

function continueToMars(): void {
  if (started) return
  started = true
  landing.setAttribute('aria-disabled', 'true')
  landing.classList.add('is-leaving')
  blackout.hidden = false
  requestAnimationFrame(() => blackout.classList.add('is-opaque'))

  window.setTimeout(async () => {
    landing.hidden = true
    universe.hidden = false
    universe.setAttribute('aria-hidden', 'false')
    loading.hidden = false

    globe = createGlobeExperience(
      scene,
      revealGlobe,
      coordinateReadout,
      altitudeReadout,
      compassNeedle,
      tiltLabel,
      attributionLabel,
    )
    updateLayerPillText()
    initRoutePlannerWiring()
    revealFallback = window.setTimeout(revealGlobe, 4000)
  }, 950)
}

// Landing page activation
landing.addEventListener('click', continueToMars)
landing.addEventListener('keydown', (event: KeyboardEvent) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    continueToMars()
  }
})

// Navigation controls wiring
zoomInButton.addEventListener('click', () => globe?.zoomIn())
zoomOutButton.addEventListener('click', () => globe?.zoomOut())
resetButton.addEventListener('click', () => globe?.reset())
compassButton.addEventListener('click', () => globe?.resetNorth())

// 2D Flat Map (Looped) vs 3D Globe Mode Toggle
tiltButton.addEventListener('click', () => {
  if (!globe) return
  const is2D = globe.toggleTilt()
  tiltButton.classList.toggle('is-2d-mode', is2D)
  tiltButton.title = is2D ? 'Switch to 3D Globe' : 'Switch to 2D Flat Map (Looped)'
  tiltLabel.textContent = is2D ? '3D' : '2D'
})

// Lighting Mode Toggle
function updateLightingUI(allLighted: boolean): void {
  const modeName = allLighted ? 'All Lighted' : 'Day & Night'
  const nextAction = allLighted ? 'Switch to Day & Night' : 'Switch to All Lighted'

  lightingPill.classList.toggle('is-all-lighted', allLighted)
  lightingPill.setAttribute('aria-pressed', String(allLighted))
  lightingPill.title = `Lighting: ${modeName} (${nextAction})`
  lightingPillText.textContent = modeName

  lightingNavToggle.classList.toggle('is-all-lighted', allLighted)
  lightingNavToggle.setAttribute('aria-pressed', String(allLighted))
  lightingNavToggle.title = `Lighting: ${modeName} (${nextAction})`

  lightingStatusBtn.classList.toggle('is-all-lighted', allLighted)
  lightingStatusBtn.textContent = modeName
}

function handleToggleLighting(): void {
  if (!globe) return
  const isAllLighted = globe.toggleLightingMode()
  updateLightingUI(isAllLighted)
}

lightingNavToggle.addEventListener('click', handleToggleLighting)
lightingPill.addEventListener('click', handleToggleLighting)
lightingStatusBtn.addEventListener('click', handleToggleLighting)

window.addEventListener('keydown', (event: KeyboardEvent) => {
  if (event.key === 'l' || event.key === 'L') {
    if (!universe.hidden && started) {
      handleToggleLighting()
    }
  }
})

fullscreenButton.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {})
  } else {
    document.exitFullscreen().catch(() => {})
  }
})

// Landmarks Drawer Menu
function toggleLandmarksMenu(open?: boolean): void {
  const shouldOpen = open ?? landmarksMenu.hidden
  landmarksMenu.hidden = !shouldOpen
  landmarksToggle.setAttribute('aria-expanded', String(shouldOpen))
  if (shouldOpen) {
    searchPill.classList.add('is-active')
    toggleLayersMenu(false)
  } else {
    searchPill.classList.remove('is-active')
  }
}

// NASA Datasets Drawer Menu
function toggleLayersMenu(open?: boolean): void {
  const shouldOpen = open ?? layersMenu.hidden
  layersMenu.hidden = !shouldOpen
  layersToggle.setAttribute('aria-expanded', String(shouldOpen))
  if (shouldOpen) {
    layersPill.classList.add('is-active')
    toggleLandmarksMenu(false)
  } else {
    layersPill.classList.remove('is-active')
  }
}

landmarksToggle.addEventListener('click', (e) => {
  e.stopPropagation()
  toggleLandmarksMenu()
})

searchPill.addEventListener('click', () => {
  toggleLandmarksMenu()
})

layersToggle.addEventListener('click', (e) => {
  e.stopPropagation()
  toggleLayersMenu()
})

layersPill.addEventListener('click', () => {
  toggleLayersMenu()
})

document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement
  if (!landmarksMenu.contains(target) && !searchPill.contains(target)) {
    toggleLandmarksMenu(false)
  }
  if (!layersMenu.contains(target) && !layersPill.contains(target)) {
    toggleLayersMenu(false)
  }
})

landmarkChips.forEach((chip) => {
  chip.addEventListener('click', (e) => {
    e.stopPropagation()
    const landmarkId = chip.dataset.landmark
    if (landmarkId && globe) {
      globe.flyToLandmark(landmarkId)
      toggleLandmarksMenu(false)
    }
  })
})

// Base Layer Selection
datasetChips.forEach((chip) => {
  chip.addEventListener('click', (e) => {
    e.stopPropagation()
    const datasetId = chip.dataset.dataset
    if (datasetId && globe) {
      globe.setDataset(datasetId)
      datasetChips.forEach((c) => c.classList.toggle('is-active', c === chip))
      updateLayerPillText()
    }
  })
})

// Overlay Layer Selection
overlayChips.forEach((chip) => {
  chip.addEventListener('click', (e) => {
    e.stopPropagation()
    const overlayId = chip.dataset.overlay
    if (!overlayId || !globe) return
    overlayChips.forEach((c) => c.classList.toggle('is-active', c === chip))

    if (overlayId === 'none') {
      globe.setOverlayDataset(null)
      overlayControls.hidden = true
    } else {
      globe.setOverlayDataset(overlayId)
      overlayControls.hidden = false
    }
    updateLayerPillText()
  })
})

overlaySlider.addEventListener('input', () => {
  if (!globe) return
  const pct = parseInt(overlaySlider.value, 10)
  overlayValue.textContent = `${pct}%`
  globe.setOverlayOpacity(pct / 100)
  presetButtons.forEach((b) => b.classList.toggle('is-active', b.dataset.opacity === String(pct)))
  updateLayerPillText()
})

presetButtons.forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    const val = parseInt(btn.dataset.opacity || '50', 10)
    overlaySlider.value = String(val)
    overlayValue.textContent = `${val}%`
    presetButtons.forEach((b) => b.classList.toggle('is-active', b === btn))
    globe?.setOverlayOpacity(val / 100)
    updateLayerPillText()
  })
})

// -------------------------------------------------------------
// GOOGLE MAPS MARTIAN ROUTE PLANNER WIRING
// -------------------------------------------------------------
function initRoutePlannerWiring(): void {
  if (!globe) return

  // Toggle Route Planner Tab from Right / Bottom
  function toggleRoutePanel(open?: boolean): void {
    const isCurrentlyCollapsed = routePanel.classList.contains('is-collapsed')
    const shouldCollapse = open !== undefined ? !open : !isCurrentlyCollapsed

    routePanel.classList.toggle('is-collapsed', shouldCollapse)
    routesPill.classList.toggle('is-active', !shouldCollapse)
    routesPill.setAttribute('aria-pressed', String(!shouldCollapse))
  }

  routesPill.addEventListener('click', () => {
    toggleRoutePanel()
  })

  panelTab.addEventListener('click', () => {
    toggleRoutePanel()
  })

  // Travel Mode Switcher
  modeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode as TravelMode
      if (!mode || !globe) return

      modeButtons.forEach((b) => {
        b.classList.toggle('is-active', b === btn)
        b.setAttribute('aria-selected', String(b === btn))
      })

      globe.setTravelMode(mode)
    })
  })

  // Origin / Destination Picking State
  function resetPickingUI(): void {
    originRow.classList.remove('is-picking')
    destRow.classList.remove('is-picking')
  }

  originPick.addEventListener('click', () => {
    if (!globe) return
    globe.setPickingTarget('origin')
    resetPickingUI()
    originRow.classList.add('is-picking')
    statusIcon.textContent = '🚀'
    statusText.textContent = 'Click on Mars to choose Landing Site (Rocket)'
  })

  destPick.addEventListener('click', () => {
    if (!globe) return
    globe.setPickingTarget('dest')
    resetPickingUI()
    destRow.classList.add('is-picking')
    statusIcon.textContent = '📍'
    statusText.textContent = 'Click on Mars to choose Destination Point (Pin)'
  })

  originClear.addEventListener('click', () => {
    if (!globe) return
    globe.setOriginPoint(null)
  })

  destClear.addEventListener('click', () => {
    if (!globe) return
    globe.setDestinationPoint(null)
  })

  swapBtn.addEventListener('click', () => {
    if (!globe) return
    globe.swapPoints()
  })

  // Quick Landmark Presets
  quickChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const presetId = chip.dataset.preset
      if (!presetId || !globe) return
      const lm = LANDMARKS[presetId]
      if (!lm) return

      const point: RoutePoint = {
        lat: lm.lat,
        lon: lm.lon,
        name: `${lm.name}`,
      }

      const orig = globe.getOriginPoint()
      const dest = globe.getDestinationPoint()

      if (!orig) {
        globe.setOriginPoint(point)
      } else if (!dest) {
        globe.setDestinationPoint(point)
      } else {
        globe.setDestinationPoint(point)
      }
    })
  })

  // Clear Route
  clearBtn.addEventListener('click', () => {
    if (!globe) return
    globe.clearRoute()
  })

  // Route Simulation / Preview Action
  simulateBtn.addEventListener('click', () => {
    if (!globe) return
    if (globe.isSimulatingRoute()) {
      globe.stopRouteSimulation()
      simulateBtn.classList.remove('is-simulating')
      simulateLabel.textContent = 'Simulate / Preview Route'
      simHud.hidden = true
    } else {
      globe.startRouteSimulation()
      simulateBtn.classList.add('is-simulating')
      simulateLabel.textContent = 'Stop Simulation'
      simHud.hidden = false
    }
  })

  simExit.addEventListener('click', () => {
    if (!globe) return
    globe.stopRouteSimulation()
    simulateBtn.classList.remove('is-simulating')
    simulateLabel.textContent = 'Simulate / Preview Route'
    simHud.hidden = true
  })

  // Render Route Cards
  function renderRouteCards(routes: RouteOption[], selectedIdx: number): void {
    routesList.replaceChildren()

    routes.forEach((route, idx) => {
      const card = document.createElement('div')
      card.className = `gm-route-card-item ${idx === selectedIdx ? 'is-selected' : ''}`
      card.setAttribute('role', 'button')
      card.setAttribute('tabindex', '0')

      const badgeHtml =
        route.badge === 'RECOMMENDED'
          ? `<span class="gm-card-badge gm-badge--recommended">Recommended</span>`
          : `<span class="gm-card-badge gm-badge--alt">${route.badge}</span>`

      card.innerHTML = `
        <div class="gm-card-top">
          <div style="display:flex; align-items:baseline; gap:8px;">
            <span class="gm-card-time">${route.durationFormatted}</span>
            <span class="gm-card-dist">${route.distanceKm.toLocaleString()} km</span>
          </div>
          ${badgeHtml}
        </div>
        <div class="gm-card-via">${route.name}</div>
        <div class="gm-card-desc">${route.hazardSummary}</div>
      `

      card.addEventListener('click', () => {
        globe?.setSelectedRouteIndex(idx)
      })

      routesList.appendChild(card)
    })
  }

  // Subscribe to Globe Route Updates
  globe.onRouteUpdated((routes, selectedIdx, origin, dest) => {
    resetPickingUI()

    // Update Origin Input
    if (origin) {
      originInput.value = origin.name || `Landing Site (${origin.lat}°, ${origin.lon}°)`
      originClear.hidden = false
    } else {
      originInput.value = ''
      originClear.hidden = true
    }

    // Update Dest Input
    if (dest) {
      destInput.value = dest.name || `Destination (${dest.lat}°, ${dest.lon}°)`
      destClear.hidden = false
    } else {
      destInput.value = ''
      destClear.hidden = true
    }

    // Update Status Banner
    if (!origin) {
      statusIcon.textContent = '🚀'
      statusText.textContent = 'Click on Mars to choose Landing Site (or select preset)'
      statusBanner.style.background = 'rgba(251, 188, 4, 0.12)'
      statusBanner.style.borderColor = 'rgba(251, 188, 4, 0.3)'
    } else if (!dest) {
      statusIcon.textContent = '📍'
      statusText.textContent = 'Landing site set! Click on Mars to choose Destination'
      statusBanner.style.background = 'rgba(138, 180, 248, 0.14)'
      statusBanner.style.borderColor = 'rgba(138, 180, 248, 0.35)'
    } else {
      statusIcon.textContent = '✅'
      statusText.textContent = 'Route determined! Choose travel mode or preview route'
      statusBanner.style.background = 'rgba(52, 168, 83, 0.14)'
      statusBanner.style.borderColor = 'rgba(52, 168, 83, 0.35)'
    }

    // Update Routes Container
    if (routes.length > 0) {
      routesContainer.hidden = false
      routeCount.textContent = `${routes.length} routes computed`
      renderRouteCards(routes, selectedIdx)

      // Ensure panel is expanded so user sees the routes
      routePanel.classList.remove('is-collapsed')
      routesPill.classList.add('is-active')
    } else {
      routesContainer.hidden = true
    }
  })

  // Simulation Telemetry Progress Callback
  globe.onSimulationProgress((progress, stats) => {
    if (progress >= 1.0) {
      simulateBtn.classList.remove('is-simulating')
      simulateLabel.textContent = 'Simulate / Preview Route'
      simHud.hidden = true
    } else {
      simTitle.textContent = `Navigating ${stats.routeName}`
      simStats.textContent = `Cruising at ${stats.speedKmH} km/h • Remaining: ${stats.kmRemaining.toLocaleString()} km`
    }
  })
}
