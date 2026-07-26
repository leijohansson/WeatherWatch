import { reactive, watch } from 'vue'
import type { AlertArea, AreaAlertState, AlertEvent, PersistedState } from '@/types'

const STORAGE_KEY = 'rainwatch-singapore:v1'

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
})

export interface AppState {
  areas: AlertArea[]
  history: AlertEvent[]
  alertState: Record<string, AreaAlertState>
  monitoring: boolean
  overlayOpacity: number
}

function defaults(): AppState {
  return {
    areas: [defaultArea()],
    history: [],
    alertState: {},
    monitoring: true,
    overlayOpacity: 0.82,
  }
}

export function readPersistedState(storage: Pick<Storage, 'getItem'> = localStorage): AppState {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return defaults()
    const parsed = JSON.parse(raw) as PersistedState
    if (parsed.version !== 1 || !Array.isArray(parsed.areas)) return defaults()
    return {
      areas: parsed.areas,
      history: Array.isArray(parsed.history) ? parsed.history : [],
      alertState: parsed.alertState ?? {},
      monitoring: parsed.settings?.monitoring ?? true,
      overlayOpacity: parsed.settings?.overlayOpacity ?? 0.82,
    }
  } catch {
    return defaults()
  }
}

export function usePersistence() {
  const state = reactive(readPersistedState())
  watch(
    state,
    () => {
      const persisted: PersistedState = {
        version: 1,
        areas: state.areas,
        history: state.history.slice(0, 50),
        alertState: state.alertState,
        settings: {
          monitoring: state.monitoring,
          overlayOpacity: state.overlayOpacity,
        },
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted))
    },
    { deep: true },
  )
  return state
}

export { STORAGE_KEY }
