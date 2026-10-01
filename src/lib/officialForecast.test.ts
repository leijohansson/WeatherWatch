import { describe, expect, it, vi } from 'vitest'
import { fetchArmyCat, parseArmyCat, parseTwoHourForecast } from './officialForecast'

describe('official forecasts', () => {
  it('reads the 2-hour forecast by area', () => {
    const parsed = parseTwoHourForecast({
      code: 0,
      data: {
        items: [
          {
            valid_period: { text: '8.00 pm to 10.00 pm' },
            forecasts: [
              { area: 'Ang Mo Kio', forecast: 'Thundery Showers' },
              { area: 'Bedok', forecast: 'Cloudy' },
            ],
          },
        ],
      },
    })
    expect(parsed).toEqual({
      byArea: { 'Ang Mo Kio': 'Thundery Showers', Bedok: 'Cloudy' },
      validPeriod: '8.00 pm to 10.00 pm',
    })
    expect(() => parseTwoHourForecast({ code: 0, data: { items: [] } })).toThrow()
  })

  it('reads SafeGuardian sector CAT codes', () => {
    expect(
      parseArmyCat({
        data: {
          armysectors: [
            { sector: { name: 'SECTOR L1' }, weather: { CAT: '0' } },
            { sector: { name: '3S' }, weather: { CAT: 3 } },
          ],
        },
      }),
    ).toEqual({ L1: '0', '3S': '3' })
  })

  it('treats an unconfigured SafeGuardian proxy as no data', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 503 }))
    await expect(fetchArmyCat(fetcher)).resolves.toBeNull()
  })
})
