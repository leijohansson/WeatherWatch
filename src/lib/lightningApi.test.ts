import { describe, expect, it, vi } from 'vitest'
import fixture from '@/test/fixtures/lightning-sample.json'
import {
  FixtureLightningSource,
  HttpLightningSource,
  LightningFeedError,
  parseLightningResponse,
  sgtDaysBetween,
  type LightningResponse,
} from './lightningApi'

// Trimmed from a real data.gov.sg response (1 Oct 2026).
const sample: LightningResponse = {
  code: 0,
  errorMsg: '',
  data: {
    records: [
      {
        datetime: '2026-10-01T17:42:00+08:00',
        item: {
          readings: [
            {
              location: { latitude: '1.6080', longitude: '103.3126' },
              type: 'C',
              datetime: '2026-10-01T17:40:06.202+08:00',
            },
            {
              location: { latitude: '1.3410', longitude: '103.8000' },
              type: 'G',
              datetime: '2026-10-01T17:40:36.277+08:00',
            },
            {
              location: { latitude: 'n/a', longitude: '103.8' },
              type: 'G',
              datetime: '2026-10-01T17:40:37.000+08:00',
            },
          ],
        },
      },
    ],
  },
}

describe('lightning response parsing', () => {
  it('maps readings to strikes with a stable id', () => {
    const strikes = parseLightningResponse(sample)
    expect(strikes).toHaveLength(2)
    expect(strikes[0]).toEqual({
      id: '2026-10-01T17:40:06.202+08:00|1.608|103.3126|cc',
      time: Date.parse('2026-10-01T09:40:06.202Z'),
      lat: 1.608,
      lon: 103.3126,
      type: 'cc',
    })
    expect(strikes[1]?.type).toBe('cg')
  })

  it('rejects error responses', () => {
    expect(() => parseLightningResponse({ code: 4, errorMsg: 'Invalid date format.' })).toThrow(
      LightningFeedError,
    )
  })

  it('handles empty records', () => {
    expect(parseLightningResponse({ code: 0, data: { records: [] } })).toEqual([])
  })
})

describe('SGT days', () => {
  it('asks for yesterday too when the window crosses SGT midnight', () => {
    const now = Date.parse('2026-10-01T00:10:00+08:00')
    expect(sgtDaysBetween(now - 30 * 60_000, now)).toEqual(['2026-10-01', '2026-09-30'])
    expect(sgtDaysBetween(now - 5 * 60_000, now)).toEqual(['2026-10-01'])
  })
})

describe('HTTP lightning source', () => {
  it('fetches the SGT day through the backend proxy and filters by time', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(sample), { status: 200 }))
    const now = Date.parse('2026-10-01T17:45:00+08:00')
    const source = new HttpLightningSource(fetcher, () => now)
    const strikes = await source.fetchSince(Date.parse('2026-10-01T17:40:30+08:00'))
    expect(fetcher).toHaveBeenCalledWith('/api/lightning?date=2026-10-01', {
      headers: { Accept: 'application/json' },
    })
    expect(strikes.map((strike) => strike.type)).toEqual(['cg'])
  })

  it('treats a 404 day as no strikes and other failures as errors', async () => {
    const now = Date.parse('2026-10-01T12:00:00+08:00')
    const empty = new HttpLightningSource(async () => new Response('{}', { status: 404 }), () => now)
    await expect(empty.fetchSince(now - 60_000)).resolves.toEqual([])
    const failing = new HttpLightningSource(async () => new Response('', { status: 502 }), () => now)
    await expect(failing.fetchSince(now - 60_000)).rejects.toThrow('502')
  })
})

describe('fixture lightning source', () => {
  it('replays the recorded storm ending one minute before now', async () => {
    const now = Date.parse('2026-12-25T09:00:00+08:00')
    const source = new FixtureLightningSource(fixture as LightningResponse, () => now)
    const strikes = await source.fetchSince(now - 30 * 60_000)
    expect(strikes.length).toBeGreaterThan(50)
    expect(Math.max(...strikes.map((strike) => strike.time))).toBe(now - 60_000)
    expect(strikes.some((strike) => strike.type === 'cg')).toBe(true)
    expect(strikes.some((strike) => strike.type === 'cc')).toBe(true)
  })
})
