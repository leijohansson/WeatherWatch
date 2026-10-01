import { describe, expect, it } from 'vitest'
import { distanceKm } from './geo'
import {
  allClearRemaining,
  areaLightningReading,
  countedStrikes,
  formatCountdown,
  latestStrikeInRing,
  mergeStrikes,
  pruneStrikes,
  ringState,
  STRIKE_AGE_COLORS,
  strikeAgeColor,
  strikeCounts,
} from './lightning'
import type { LiveLocation, Strike, StrikeType } from '@/types'

const MIN = 60_000
const NOW = Date.UTC(2026, 9, 1, 6, 30) // 14:30 SGT

const home: LiveLocation = {
  id: 'home',
  name: 'Home',
  lat: 1.35,
  lon: 103.82,
  radiusKm: 8,
  countCloudToCloud: true,
  showCountdown: true,
  notifyStrike: true,
  notifyAllClear: true,
}

/** A strike `km` due north of home, `ageMin` minutes before NOW. */
function strike(km: number, ageMin: number, type: StrikeType = 'cg', id?: string): Strike {
  return {
    id: id ?? `${type}-${km}-${ageMin}`,
    time: NOW - ageMin * MIN,
    lat: home.lat + km / 111.19508,
    lon: home.lon,
    type,
  }
}

describe('strike age colours', () => {
  it('steps every 2.5 minutes across 12 colours', () => {
    expect(strikeAgeColor(0)).toBe(STRIKE_AGE_COLORS[0])
    expect(strikeAgeColor(2.4999)).toBe(STRIKE_AGE_COLORS[0])
    expect(strikeAgeColor(2.5)).toBe(STRIKE_AGE_COLORS[1])
    expect(strikeAgeColor(5)).toBe(STRIKE_AGE_COLORS[2])
    expect(strikeAgeColor(27.5)).toBe(STRIKE_AGE_COLORS[11])
    expect(strikeAgeColor(29.999)).toBe(STRIKE_AGE_COLORS[11])
  })

  it('has no colour from 30 minutes', () => {
    expect(strikeAgeColor(30)).toBeNull()
    expect(strikeAgeColor(45)).toBeNull()
  })

  it('treats future timestamps as brand new', () => {
    expect(strikeAgeColor(-1)).toBe(STRIKE_AGE_COLORS[0])
  })
})

describe('strike buffer', () => {
  it('drops strikes older than 30 minutes', () => {
    const kept = pruneStrikes([strike(1, 29.9), strike(1, 30), strike(1, 31)], NOW)
    expect(kept.map((s) => s.time)).toEqual([NOW - 29.9 * MIN])
  })

  it('merges by id and keeps oldest first', () => {
    const a = strike(1, 10, 'cg', 'a')
    const b = strike(2, 5, 'cc', 'b')
    const merged = mergeStrikes([b], [a, b, strike(3, 40, 'cg', 'old')], NOW)
    expect(merged.map((s) => s.id)).toEqual(['a', 'b'])
  })
})

describe('rings', () => {
  it('counts a strike exactly on the radius as inside', () => {
    const edge = strike(8, 1)
    const location = { ...home, radiusKm: distanceKm(home, edge) }
    expect(latestStrikeInRing(location, [edge])).not.toBeNull()
    expect(ringState(location, [edge], NOW, 15)).toBe('active')
    expect(ringState({ ...location, radiusKm: location.radiusKm - 0.001 }, [edge], NOW, 15)).toBe('clear')
  })

  it('filters cloud-to-cloud strikes when they are not counted', () => {
    const strikes = [strike(2, 1, 'cc'), strike(20, 1, 'cg')]
    expect(countedStrikes(strikes, home)).toHaveLength(2)
    expect(countedStrikes(strikes, { countCloudToCloud: false })).toHaveLength(1)
    expect(ringState(home, strikes, NOW, 15)).toBe('active')
    expect(ringState({ ...home, countCloudToCloud: false }, strikes, NOW, 15)).toBe('clear')
  })

  it('is active at 14:59 and clear at 15:00', () => {
    expect(ringState(home, [strike(2, 14 + 59 / 60)], NOW, 15)).toBe('active')
    expect(ringState(home, [strike(2, 15)], NOW, 15)).toBe('clear')
  })

  it('ignores strikes outside the ring', () => {
    expect(ringState(home, [strike(9, 1)], NOW, 15)).toBe('clear')
  })
})

describe('all-clear countdown', () => {
  it('counts down from the newest counted strike inside the ring', () => {
    expect(allClearRemaining(home, [strike(2, 4)], NOW, 15)).toBe(11 * MIN)
    expect(allClearRemaining(home, [], NOW, 15)).toBeNull()
    expect(allClearRemaining(home, [strike(2, 16)], NOW, 15)).toBeNull()
  })

  it('restarts when a newer strike arrives', () => {
    const first = [strike(2, 10)]
    expect(allClearRemaining(home, first, NOW, 15)).toBe(5 * MIN)
    const withNewer = [...first, strike(5, 1)]
    expect(allClearRemaining(home, withNewer, NOW, 15)).toBe(14 * MIN)
  })

  it('formats as mm:ss', () => {
    expect(formatCountdown(14 * MIN + 3_000)).toBe('14:03')
    expect(formatCountdown(500)).toBe('00:01')
    expect(formatCountdown(0)).toBe('00:00')
  })
})

describe('strike counts', () => {
  it('buckets by type into <5, 5–15 and 15–30 minutes', () => {
    const counts = strikeCounts(
      [
        strike(1, 0),
        strike(1, 4.9),
        strike(1, 5),
        strike(1, 14.9, 'cc'),
        strike(1, 15, 'cc'),
        strike(1, 29.9, 'cc'),
        strike(1, 30, 'cc'),
      ],
      NOW,
    )
    expect(counts).toEqual({
      cg: { lt5: 2, lt15: 1, lt30: 0 },
      cc: { lt5: 0, lt15: 1, lt30: 2 },
    })
  })
})

describe('watch area lightning reading', () => {
  const square = [
    { lat: 1.34, lon: 103.81 },
    { lat: 1.34, lon: 103.83 },
    { lat: 1.36, lon: 103.83 },
    { lat: 1.36, lon: 103.81 },
  ]

  it('counts strikes inside the buffer by type and reports the nearest', () => {
    const strikes = [strike(0, 1), strike(4, 2), strike(3, 1, 'cc'), strike(12, 1)]
    const reading = areaLightningReading(square, strikes, NOW, 5, 'cg+cc', 15)
    expect(reading.groundCount).toBe(2)
    expect(reading.cloudCount).toBe(1)
    expect(reading.nearestKm).toBe(0)
  })

  it('honours strike types and the time window', () => {
    const strikes = [strike(3, 1, 'cc'), strike(3, 20)]
    const reading = areaLightningReading(square, strikes, NOW, 5, 'cg', 15)
    expect(reading).toMatchObject({ groundCount: 0, cloudCount: 0, nearestKm: null })
  })
})
