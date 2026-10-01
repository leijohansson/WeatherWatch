import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import { readPersistedState, STORAGE_KEY, usePersistence } from './usePersistence'

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
    expect(saved.version).toBe(1)
    expect(saved.areas[0]).toMatchObject({ name: 'Home', pixelThreshold: 42 })
    vi.useRealTimers()
  })
})
