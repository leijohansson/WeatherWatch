import { radarTimestamp } from './timestamps'

const RADAR_API_URL = '/api/weather-radar/240km/latest'

export interface LatestRadarImage {
  timestamp: string
  url: string
  source: string
}

export async function fetchLatestRadarImage(
  fetcher: (input: string, init: RequestInit) => Promise<Response> = fetch,
): Promise<LatestRadarImage> {
  const response = await fetcher(RADAR_API_URL, {
    headers: { Accept: 'image/png' },
  })
  if (!response.ok) throw new Error(`Radar API returned ${response.status}.`)

  const timestamp = response.headers.get('X-Radar-Timestamp')
  const source = response.headers.get('X-Radar-Source') || 'Unknown'
  
  if (!timestamp) {
    throw new Error('Radar API returned no timestamp header.')
  }

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)

  return {
    timestamp: radarTimestamp(new Date(timestamp)),
    url,
    source,
  }
}
