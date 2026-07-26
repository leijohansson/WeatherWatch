import { describe, expect, it } from 'vitest'
import {
  millisecondsUntilNextBoundary,
  radarTimestamp,
  radarUrl,
  recentRadarTimestamps,
} from './timestamps'

describe('radar timestamp generation', () => {
  it('uses Singapore time and recent 15-minute fallbacks', () => {
    const date = new Date('2026-07-23T12:22:10Z')
    expect(radarTimestamp(date)).toBe('2026072320220000')
    expect(recentRadarTimestamps(date, 3)).toEqual([
      '2026072320150000',
      '2026072320000000',
      '2026072319450000',
    ])
  })

  it('schedules one minute after the next boundary and produces proxied radar URLs', () => {
    const date = new Date('2026-07-23T12:14:50.000Z')
    expect(millisecondsUntilNextBoundary(date)).toBe(70_000)
    expect(radarUrl('2026072320150000')).toBe(
      '/weather-radar/dpsri_240km_2026072320150000dBR.dpsri.png',
    )
  })
})
