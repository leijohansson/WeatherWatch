import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import { migrateV1, readPersistedState, STORAGE_KEY, usePersistence } from './usePersistence'
import type { PersistedStateV1 } from '@/types'

describe('persistence', () => {
  it('falls back safely for malformed or incompatible data', () => {
    const storage = { getItem: () => '{broken' }
    expect(readPersistedState(storage).areas).toHaveLength(1)
    const old = { getItem: () => JSON.stringify({ version: 0, areas: [] }) }
    expect(readPersistedState(old).areas).toHaveLength(1)
  })

  it('persists versioned area settings', async () => {
    vi.useFakeTimers()
    const state = usePersistence()
    state.areas[0]!.name = 'Home'
    state.areas[0]!.pixelThreshold = 42
    await nextTick()
    vi.runAllTimers()
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(saved.version).toBe(2)
    expect(saved.live.layers.radarOpacity).toBe(0.35)
    expect(saved.areas[0]).toMatchObject({ name: 'Home', pixelThreshold: 42 })
    vi.useRealTimers()
  })

  describe('v1 migration', () => {
    const v1: PersistedStateV1 = {
      version: 1,
      areas: [
        {
          id: 'home',
          name: 'Home',
          color: '#ff0000',
          enabled: true,
          vertices: [
            { x: 0.1, y: 0.1 },
            { x: 0.2, y: 0.1 },
            { x: 0.2, y: 0.2 },
          ],
          intensityThreshold: 'heavy',
          pixelThreshold: 9,
          notifyNewCell: false,
        },
      ],
      history: [],
      alertState: { home: { rainy: true, maximumIntensity: 'heavy', clusterPixels: [] } },
      settings: { monitoring: false, overlayOpacity: 0.7, soundAlerts: true, soundVolume: 40 },
    }

    it('keeps areas as they are', () => {
      const migrated = migrateV1(v1)
      expect(migrated.version).toBe(2)
      expect(migrated.areas).toEqual(v1.areas)
    })

    it('adds Live defaults and keeps existing state', () => {
      const migrated = migrateV1(v1)
      expect(migrated.alertState.home?.rainy).toBe(true)
      expect(migrated.settings).toEqual(v1.settings)
      expect(migrated.live.allClearEnabled).toBe(true)
      expect(migrated.live.allClearMinutes).toBe(15)
      expect(migrated.live.layers).toMatchObject({ sectors: 'town', radarOpacity: 0.35 })
      expect(migrated.live.forecast.radar.minLevel).toBe(21)
      expect(migrated.liveLocations).toHaveLength(1)
    })

    it('reads a stored v1 document as v2 state', () => {
      const state = readPersistedState({ getItem: () => JSON.stringify(v1) })
      expect(state.areas[0]?.name).toBe('Home')
      expect(state.soundVolume).toBe(40)
      expect(state.live.layers.cg).toBe(true)
    })

    it('fills settings missing from a partial v2 document', () => {
      const partial = { ...migrateV1(v1), live: { layers: { sectors: 'army' } } }
      const state = readPersistedState({ getItem: () => JSON.stringify(partial) })
      expect(state.live.layers).toMatchObject({ sectors: 'army', cc: true, radarOpacity: 0.35 })
      expect(state.live.forecast.lightning.distanceKm).toBe(15)
    })

    it('drops the removed all-clear notification from saved locations', () => {
      const saved = { ...migrateV1(v1) }
      saved.liveLocations = [{ ...saved.liveLocations[0]!, notifyAllClear: true } as never]
      const state = readPersistedState({ getItem: () => JSON.stringify(saved) })
      expect(state.liveLocations[0]).not.toHaveProperty('notifyAllClear')
      expect(state.liveLocations[0]?.notifyStrike).toBe(true)
    })

    it('drops Watch lightning from early v2 data', () => {
      const early = {
        ...migrateV1(v1),
        areas: [{ ...v1.areas[0], lightningEnabled: true, lightningBufferKm: 5, lightningTypes: 'cg', openLiveOnAlert: true }],
        history: [
          { id: 'a', reason: 'lightning', areaId: 'home', areaName: 'Home', timestamp: '', source: 'live' },
          { id: 'b', reason: 'entry', areaId: 'home', areaName: 'Home', timestamp: '', source: 'live', intensity: 'heavy', pixelCount: 3 },
        ],
        live: { forecast: { radar: { minClusterKm2: 12, distanceKm: 6, minIntensity: 'moderate' } } },
        lightningState: { home: true },
      }
      const state = readPersistedState({ getItem: () => JSON.stringify(early) })
      expect(state.areas[0]).toEqual(v1.areas[0])
      expect(state.history.map((event) => event.id)).toEqual(['b'])
      expect(state.live.forecast.radar).toEqual({ minClusterKm2: 12, distanceKm: 6, minLevel: 21 })
    })
  })
})
