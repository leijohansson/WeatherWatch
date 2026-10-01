import { describe, expect, it, vi } from 'vitest'
import { fetchLatestRadarImage } from './radarApi'

describe('radar API', () => {
  it('returns the latest radar image with timestamp and source from headers', async () => {
    const imageBlob = new Blob(['fake-image-data'], { type: 'image/png' })
    const fetcher = vi.fn(async () =>
      new Response(imageBlob, {
        status: 200,
        headers: {
          'X-Radar-Timestamp': '2026-07-26T15:30:00+08:00',
          'X-Radar-Source': 'data.gov.sg',
        },
      }),
    )

    // Mock URL.createObjectURL to avoid browser dependency in tests
    const mockObjectUrl = 'blob:mock-url'
    vi.spyOn(URL, 'createObjectURL').mockReturnValue(mockObjectUrl)

    await expect(fetchLatestRadarImage(fetcher)).resolves.toEqual({
      timestamp: '2026072615300000',
      url: mockObjectUrl,
      source: 'data.gov.sg',
    })
    expect(fetcher).toHaveBeenCalledWith(
      '/api/weather-radar/240km/latest',
      { headers: { Accept: 'image/png' } },
    )
  })
})
