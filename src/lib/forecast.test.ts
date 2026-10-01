import { describe, expect, it } from 'vitest'
import {
  catExpectsLightning,
  classifySectors,
  findRadarClusters,
  forecastExpectsLightning,
  pixelAreaKm2,
  type SectorInput,
} from './forecast'
import { latLonToNormalized } from './geo'
import type { ForecastSettings, RadarFrame, Strike } from '@/types'

const NOW = Date.UTC(2026, 9, 1, 6, 30)
const settings: ForecastSettings = {
  radar: { minClusterKm2: 10, distanceKm: 6, minIntensity: 'moderate' },
  lightning: { distanceKm: 15, windowMinutes: 15, types: 'cg' },
}

/** A 480 px frame with a square of moderate rain `size` px wide centred on lat/lon. */
function frameWithBlob(lat: number, lon: number, size: number): RadarFrame {
  const width = 480
  const pixels = new Uint8ClampedArray(width * width * 4)
  const centre = latLonToNormalized({ lat, lon })
  const cx = Math.round(centre.x * width)
  const cy = Math.round(centre.y * width)
  for (let y = cy - Math.floor(size / 2); y < cy - Math.floor(size / 2) + size; y++) {
    for (let x = cx - Math.floor(size / 2); x < cx - Math.floor(size / 2) + size; x++) {
      const o = (y * width + x) * 4
      pixels.set([0, 215, 40, 255], o)
    }
  }
  return { source: 'test', timestamp: '', url: '', width, height: width, pixels }
}

// A ~2 km square sector around 1.35, 103.82.
const sector = (id: string, lat: number, lon: number, forecastLightning: boolean | null): SectorInput => ({
  id,
  forecastLightning,
  rings: [
    [
      { lat: lat - 0.01, lon: lon - 0.01 },
      { lat: lat - 0.01, lon: lon + 0.01 },
      { lat: lat + 0.01, lon: lon + 0.01 },
      { lat: lat + 0.01, lon: lon - 0.01 },
    ],
  ],
})

describe('radar clusters', () => {
  it('measures pixels at about 1 km² on the 480 px frame', () => {
    expect(pixelAreaKm2({ width: 480, height: 480 })).toBeCloseTo(1, 0)
  })

  it('keeps clusters at or above the minimum size', () => {
    const big = findRadarClusters(frameWithBlob(1.35, 103.82, 4), settings.radar)
    expect(big).toHaveLength(1)
    expect(big[0]).toMatchObject({ id: 'C1', label: 'CLUSTER C1', maxIntensity: 'moderate' })
    expect(big[0]!.areaKm2).toBeGreaterThan(10)
    expect(findRadarClusters(frameWithBlob(1.35, 103.82, 2), settings.radar)).toHaveLength(0)
  })

  it('ignores rain below the minimum intensity', () => {
    const heavyOnly = { ...settings.radar, minIntensity: 'heavy' as const }
    expect(findRadarClusters(frameWithBlob(1.35, 103.82, 6), heavyOnly)).toHaveLength(0)
  })
})

describe('sector classification', () => {
  const cluster = findRadarClusters(frameWithBlob(1.35, 103.82, 5), settings.radar)

  it('marks sectors near a cluster as thunderstorm and far ones clear', () => {
    const classes = classifySectors(
      [sector('near', 1.35, 103.86, true), sector('far', 1.35, 104.2, true)],
      cluster,
      [],
      NOW,
      settings,
    )
    expect(classes).toEqual({ near: 'thunderstorm', far: 'clear' })
  })

  it('flags a discrepancy when the forecast does not expect lightning', () => {
    const classes = classifySectors(
      [sector('a', 1.35, 103.82, false), sector('b', 1.35, 103.82, null)],
      cluster,
      [],
      NOW,
      settings,
    )
    expect(classes).toEqual({ a: 'discrepancy', b: 'thunderstorm' })
  })

  it('uses recent strikes of the allowed types within the lightning distance', () => {
    const strike = (type: Strike['type'], ageMin: number): Strike => ({
      id: `${type}${ageMin}`,
      type,
      time: NOW - ageMin * 60_000,
      lat: 1.35,
      lon: 103.95, // ~13 km east of the sector edge
    })
    const sectors = [sector('s', 1.35, 103.82, true)]
    expect(classifySectors(sectors, [], [strike('cg', 5)], NOW, settings)).toEqual({ s: 'thunderstorm' })
    expect(classifySectors(sectors, [], [strike('cg', 16)], NOW, settings)).toEqual({ s: 'clear' })
    expect(classifySectors(sectors, [], [strike('cc', 1)], NOW, settings)).toEqual({ s: 'clear' })
    const withCloud = { ...settings, lightning: { ...settings.lightning, types: 'cg+cc' as const } }
    expect(classifySectors(sectors, [], [strike('cc', 1)], NOW, withCloud)).toEqual({ s: 'thunderstorm' })
  })
})

describe('official forecasts', () => {
  it('reads thundery 2-hour forecasts', () => {
    expect(forecastExpectsLightning('Heavy Thundery Showers with Gusty Winds')).toBe(true)
    expect(forecastExpectsLightning('Light Rain')).toBe(false)
    expect(forecastExpectsLightning(undefined)).toBeNull()
  })

  it('reads SafeGuardian CAT codes', () => {
    expect(catExpectsLightning('0')).toBe(true)
    expect(catExpectsLightning('-1')).toBe(true)
    expect(catExpectsLightning('3')).toBe(false)
    expect(catExpectsLightning(undefined)).toBeNull()
  })
})
