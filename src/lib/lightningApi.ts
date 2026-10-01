import type { Strike } from '@/types'

const LIGHTNING_API_URL = '/api/lightning'

export interface LightningSource {
  readonly kind: 'live' | 'test'
  fetchSince(since: number): Promise<Strike[]>
}

/** data.gov.sg `weather?api=lightning` response, as far as we use it. */
export interface LightningResponse {
  code: number
  errorMsg?: string | null
  data?: {
    records?: {
      datetime: string
      item?: {
        readings?: {
          location: { latitude: string; longitude: string }
          datetime: string
          type: string
        }[]
      }
    }[]
  } | null
}

export class LightningFeedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LightningFeedError'
  }
}

/** Maps a lightning response to strikes. The feed has no strike id, so time, position and type stand in for one. */
export function parseLightningResponse(response: LightningResponse): Strike[] {
  if (response.code !== 0) throw new LightningFeedError(response.errorMsg || 'Lightning feed error')
  const strikes: Strike[] = []
  for (const record of response.data?.records ?? []) {
    for (const reading of record.item?.readings ?? []) {
      const time = Date.parse(reading.datetime)
      const lat = Number(reading.location?.latitude)
      const lon = Number(reading.location?.longitude)
      if (!Number.isFinite(time) || !Number.isFinite(lat) || !Number.isFinite(lon)) continue
      const type = reading.type === 'G' ? 'cg' : reading.type === 'C' ? 'cc' : null
      if (!type) continue
      strikes.push({ id: `${reading.datetime}|${lat}|${lon}|${type}`, time, lat, lon, type })
    }
  }
  return strikes
}

const sgtDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Singapore',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** The SGT calendar days (YYYY-MM-DD) touched by [since, now], newest first. */
export function sgtDaysBetween(since: number, now: number): string[] {
  const days = [sgtDate.format(now)]
  const earliest = sgtDate.format(Math.min(since, now))
  if (earliest !== days[0]) days.push(earliest)
  return days
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>

export class HttpLightningSource implements LightningSource {
  readonly kind = 'live'

  constructor(
    private readonly fetcher: Fetcher = (input, init) => fetch(input, init),
    private readonly clock: () => number = Date.now,
  ) {}

  async fetchSince(since: number): Promise<Strike[]> {
    const days = sgtDaysBetween(since, this.clock())
    const results = await Promise.all(days.map((day) => this.fetchDay(day)))
    return results.flat().filter((strike) => strike.time >= since)
  }

  private async fetchDay(day: string): Promise<Strike[]> {
    const response = await this.fetcher(`${LIGHTNING_API_URL}?date=${day}`, {
      headers: { Accept: 'application/json' },
    })
    // data.gov.sg answers 404 for a day with no observations yet (just after midnight).
    if (response.status === 404) return []
    if (!response.ok) throw new LightningFeedError(`Lightning feed returned ${response.status}.`)
    return parseLightningResponse((await response.json()) as LightningResponse)
  }
}

/**
 * Replays a recorded storm relative to when it was created: the newest fixture strike lands one
 * minute before then, so rings start active and the all-clear countdowns run out over time.
 */
export class FixtureLightningSource implements LightningSource {
  readonly kind = 'test'
  private readonly strikes: Strike[]

  constructor(
    fixture: LightningResponse,
    private readonly clock: () => number = Date.now,
  ) {
    const recorded = parseLightningResponse(fixture)
    const newest = Math.max(...recorded.map((strike) => strike.time))
    const offset = clock() - 60_000 - newest
    this.strikes = recorded.map((strike) => ({ ...strike, time: strike.time + offset }))
  }

  async fetchSince(since: number): Promise<Strike[]> {
    const now = this.clock()
    return this.strikes.filter((strike) => strike.time >= since && strike.time <= now)
  }
}
