import { reactive, watch } from 'vue'
import { INTENSITIES } from '@/types'
import type {
  AlertArea,
  AreaAlertState,
  AlertEvent,
  LiveLocation,
  LiveSettings,
  PersistedState,
  PersistedStateV1,
} from '@/types'

// The key keeps its original name so existing browsers keep their data across the rename.
const STORAGE_KEY = 'rainwatch-singapore:v1'
const PERSIST_DELAY_MS = 250

export const AREA_LIGHTNING_DEFAULTS = {
  lightningEnabled: true,
  lightningBufferKm: 5,
  lightningTypes: 'cg',
  openLiveOnAlert: true,
} satisfies Partial<AlertArea>

const defaultArea = (): AlertArea => ({
  id: crypto.randomUUID(),
  name: 'Central Singapore',
  color: '#ffb454',
  enabled: true,
  vertices: [
    { x: 0.4, y: 0.48 },
    { x: 0.58, y: 0.48 },
    { x: 0.58, y: 0.62 },
    { x: 0.4, y: 0.62 },
  ],
  intensityThreshold: 'moderate',
  pixelThreshold: 20,
  notifyNewCell: true,
  ...AREA_LIGHTNING_DEFAULTS,
})

export function newLiveLocation(overrides: Partial<LiveLocation> = {}): LiveLocation {
  return {
    id: crypto.randomUUID(),
    name: 'Home',
    lat: 1.35,
    lon: 103.82,
    radiusKm: 8,
    countCloudToCloud: true,
    showCountdown: true,
    notifyStrike: true,
    notifyAllClear: true,
    ...overrides,
  }
}

export function defaultLiveSettings(): LiveSettings {
  return {
    allClearEnabled: true,
    allClearMinutes: 15,
    layers: {
      sectors: 'town',
      forecast: true,
      clusters: true,
      cg: true,
      cc: true,
      rings: true,
      radarOpacity: 0.35,
    },
    forecast: {
      radar: { minClusterKm2: 10, distanceKm: 6, minIntensity: 'moderate' },
      lightning: { distanceKm: 15, windowMinutes: 15, types: 'cg' },
    },
  }
}

export interface AppState {
  areas: AlertArea[]
  history: AlertEvent[]
  alertState: Record<string, AreaAlertState>
  monitoring: boolean
  overlayOpacity: number
  soundAlerts: boolean
  soundVolume: number
  liveLocations: LiveLocation[]
  live: LiveSettings
  lightningState: Record<string, boolean>
}

function defaults(): AppState {
  return {
    areas: [defaultArea()],
    history: [],
    alertState: {},
    monitoring: true,
    overlayOpacity: 0.82,
    soundAlerts: false,
    soundVolume: 70,
    liveLocations: [newLiveLocation({ name: 'Central Singapore' })],
    live: defaultLiveSettings(),
    lightningState: {},
  }
}

/** v1 → v2: adds Live mode settings and locations, and the lightning trigger fields on areas. */
export function migrateV1(state: PersistedStateV1): PersistedState {
  return {
    version: 2,
    // Existing areas opt in to lightning alerts explicitly so an upgrade doesn't start new notifications.
    areas: state.areas.map((area) => ({ ...AREA_LIGHTNING_DEFAULTS, ...area, lightningEnabled: false })),
    history: Array.isArray(state.history) ? state.history : [],
    alertState: state.alertState ?? {},
    settings: state.settings,
    liveLocations: [newLiveLocation({ name: 'Central Singapore' })],
    live: defaultLiveSettings(),
    lightningState: {},
  }
}

function mergeLiveSettings(saved: Partial<LiveSettings> | undefined): LiveSettings {
  const base = defaultLiveSettings()
  const minIntensity = saved?.forecast?.radar?.minIntensity
  return {
    allClearEnabled: saved?.allClearEnabled ?? base.allClearEnabled,
    allClearMinutes: saved?.allClearMinutes ?? base.allClearMinutes,
    layers: { ...base.layers, ...saved?.layers },
    forecast: {
      radar: {
        ...base.forecast.radar,
        ...saved?.forecast?.radar,
        minIntensity:
          minIntensity && INTENSITIES.includes(minIntensity) ? minIntensity : base.forecast.radar.minIntensity,
      },
      lightning: { ...base.forecast.lightning, ...saved?.forecast?.lightning },
    },
  }
}

export function readPersistedState(storage: Pick<Storage, 'getItem'> = localStorage): AppState {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return defaults()
    let parsed = JSON.parse(raw) as PersistedState | PersistedStateV1
    if (!Array.isArray(parsed.areas)) return defaults()
    if (parsed.version === 1) parsed = migrateV1(parsed)
    if (parsed.version !== 2) return defaults()
    return {
      areas: parsed.areas.map((area) => ({ ...AREA_LIGHTNING_DEFAULTS, ...area })),
      history: Array.isArray(parsed.history) ? parsed.history : [],
      alertState: parsed.alertState ?? {},
      monitoring: parsed.settings?.monitoring ?? true,
      overlayOpacity: parsed.settings?.overlayOpacity ?? 0.82,
      soundAlerts: parsed.settings?.soundAlerts ?? false,
      soundVolume: parsed.settings?.soundVolume ?? 70,
      liveLocations: Array.isArray(parsed.liveLocations)
        ? parsed.liveLocations.map((location) => newLiveLocation(location))
        : [],
      live: mergeLiveSettings(parsed.live),
      lightningState: parsed.lightningState ?? {},
    }
  } catch {
    return defaults()
  }
}

export function usePersistence() {
  const state = reactive(readPersistedState())
  let persistTimer: ReturnType<typeof setTimeout> | undefined
  const persist = () => {
    clearTimeout(persistTimer)
    persistTimer = undefined
    const persisted: PersistedState = {
      version: 2,
      areas: state.areas,
      history: state.history.slice(0, 50),
      alertState: state.alertState,
      settings: {
        monitoring: state.monitoring,
        overlayOpacity: state.overlayOpacity,
        soundAlerts: state.soundAlerts,
        soundVolume: state.soundVolume,
      },
      liveLocations: state.liveLocations,
      live: state.live,
      lightningState: state.lightningState,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted))
  }
  watch(
    state,
    () => {
      clearTimeout(persistTimer)
      persistTimer = setTimeout(persist, PERSIST_DELAY_MS)
    },
    { deep: true },
  )
  window.addEventListener('pagehide', persist, { once: true })
  return state
}

export { STORAGE_KEY }
