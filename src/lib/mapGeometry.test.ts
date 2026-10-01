import { describe, expect, it } from 'vitest'
import { RADAR_BOUNDS } from './geo'
import { pathRadarImage } from './mapGeometry'

describe('radar-image paths', () => {
  it('places the radar corners at 0 and 100', () => {
    const { west, east, south, north } = RADAR_BOUNDS
    const d = pathRadarImage([[[
      [west, north],
      [east, north],
      [east, south],
    ]]])
    expect(d).toBe('M0.000 0.000L100.000 0.000L100.000 100.000Z')
  })
})
