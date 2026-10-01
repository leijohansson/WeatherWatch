type Fetcher = (input: string, init?: RequestInit) => Promise<Response>

export interface TwoHourForecast {
  /** Forecast text by area name, e.g. "Ang Mo Kio" → "Thundery Showers". */
  byArea: Record<string, string>
  validPeriod: string | null
}

interface TwoHourResponse {
  code: number
  data?: {
    items?: {
      valid_period?: { text?: string }
      forecasts?: { area: string; forecast: string }[]
    }[]
  }
}

export function parseTwoHourForecast(response: TwoHourResponse): TwoHourForecast {
  const item = response.code === 0 ? response.data?.items?.[0] : undefined
  if (!item) throw new Error('The 2-hour forecast returned no items.')
  const byArea: Record<string, string> = {}
  for (const entry of item.forecasts ?? []) byArea[entry.area] = entry.forecast
  return { byArea, validPeriod: item.valid_period?.text ?? null }
}

interface SafeGuardianResponse {
  data?: { armysectors?: { sector?: { name?: string }; weather?: { CAT?: string | number } }[] }
}

/** Army sector CAT codes by sector name; "SECTOR L1" becomes "L1". */
export function parseArmyCat(response: SafeGuardianResponse): Record<string, string> {
  const codes: Record<string, string> = {}
  for (const entry of response.data?.armysectors ?? []) {
    const name = (entry.sector?.name ?? '').trim().replace(/^sector\s+/i, '')
    if (name) codes[name] = String(entry.weather?.CAT ?? '')
  }
  return codes
}

export async function fetchTwoHourForecast(fetcher: Fetcher = (i, o) => fetch(i, o)) {
  const response = await fetcher('/api/two-hr-forecast', { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`2-hour forecast returned ${response.status}.`)
  return parseTwoHourForecast((await response.json()) as TwoHourResponse)
}

/** Null when the backend has no SafeGuardian token configured. */
export async function fetchArmyCat(fetcher: Fetcher = (i, o) => fetch(i, o)) {
  const response = await fetcher('/api/army-cat', { headers: { Accept: 'application/json' } })
  if (response.status === 503) return null
  if (!response.ok) throw new Error(`Army CAT status returned ${response.status}.`)
  return parseArmyCat((await response.json()) as SafeGuardianResponse)
}
