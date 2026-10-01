import { describe, expect, it } from 'vitest'
import { formatRate, RADAR_COLORS, RADAR_LEVEL_CHOICES, RADAR_RATES, radarLevel } from './radarScale'

describe('radar colour scale', () => {
  it('has 33 colours with rising rain rates', () => {
    expect(RADAR_COLORS).toHaveLength(33)
    for (let i = 1; i < RADAR_RATES.length; i++) expect(RADAR_RATES[i]!).toBeGreaterThan(RADAR_RATES[i - 1]!)
    expect(RADAR_RATES[0]).toBe(0.1)
    expect(RADAR_RATES[32]).toBe(150)
  })

  it('classifies exact colours, including the near-identical purples', () => {
    expect(radarLevel(0, 255, 255)).toBe(0)
    expect(radarLevel(255, 178, 0)).toBe(21)
    expect(radarLevel(210, 0, 165)).toBe(30)
    expect(radarLevel(212, 0, 170)).toBe(31)
    expect(radarLevel(255, 0, 255)).toBe(32)
  })

  it('ignores transparent and non-rain pixels', () => {
    expect(radarLevel(255, 178, 0, 0)).toBeNull()
    expect(radarLevel(240, 240, 240)).toBeNull()
  })

  it('offers orange and every second colour after it', () => {
    expect(RADAR_LEVEL_CHOICES.map((choice) => choice.index)).toEqual([21, 23, 25, 27, 29, 31])
    expect(formatRate(21)).toBe('12 mm/h')
  })
})
