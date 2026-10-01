import { describe, expect, it } from 'vitest'
import {
  millisecondsUntilNextBoundary,
  radarTimestamp,
  radarUrl,
  recentRadarTimestamps,
} from './timestamps'

describe('radar timestamp generation', () => {
  it('uses Singapore time and recent 5-minute fallbacks', () => {
    const date = new Date('2026-07-23T12:22:10Z')
    expect(radarTimestamp(date)).toBe('2026072320220000')
    expect(recentRadarTimestamps(date, 3)).toEqual([
      '2026072320200000',
      '2026072320150000',
      '2026072320100000',
    ])
  })

  it('schedules the next three-minute refresh', () => {
    const date = new Date('2026-07-23T12:14:50.000Z')
    expect(millisecondsUntilNextBoundary(date)).toBe(10_000)
    expect(radarUrl('2026072320150000')).toBe(
      '/api/weather-radar/img/dpsri_240km_2026072320150000dBR.dpsri.png',
    )
  })
})
