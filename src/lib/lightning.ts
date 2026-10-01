import { distanceKm } from './geo'
import type { LightningTypes, LiveLocation, RingState, Strike, StrikeType } from '@/types'

export const STRIKE_AGE_STEP_MIN = 2.5
export const STRIKE_WINDOW_MIN = 30
export const STRIKE_AGE_COLORS = [
  '#d7191c', '#e8401e', '#f46d20', '#f99a25', '#fdc22e', '#f2e235',
  '#bfe04a', '#7fcc5c', '#3fb36e', '#1f9a96', '#2b7bba', '#2c55a8',
] // 0–2.5 min … 27.5–30 min (red → orange → yellow → green → blue)
export const FRESH_STRIKE_MIN = 5

const MINUTE_MS = 60_000

export const STRIKE_TYPE_LABELS: Record<StrikeType, string> = { cg: 'Ground', cc: 'Cloud' }

export function strikeAgeMinutes(strike: Pick<Strike, 'time'>, now: number): number {
  return Math.max(0, (now - strike.time) / MINUTE_MS)
}

export function strikeAgeColor(ageMin: number): string | null {
  if (ageMin >= STRIKE_WINDOW_MIN) return null
  return STRIKE_AGE_COLORS[Math.floor(Math.max(0, ageMin) / STRIKE_AGE_STEP_MIN)] ?? null
}

/** Drops strikes outside the 30-minute window. */
export function pruneStrikes(strikes: Strike[], now: number): Strike[] {
  return strikes.filter((strike) => strikeAgeMinutes(strike, now) < STRIKE_WINDOW_MIN)
}

/** Merges new strikes into the buffer, de-duplicating by id, oldest first. */
export function mergeStrikes(existing: Strike[], incoming: Strike[], now: number): Strike[] {
  const byId = new Map(existing.map((strike) => [strike.id, strike]))
  for (const strike of incoming) byId.set(strike.id, strike)
  return pruneStrikes([...byId.values()], now).sort((a, b) => a.time - b.time)
}

export function typeAllowed(type: StrikeType, types: LightningTypes): boolean {
  return type === 'cg' || types === 'cg+cc'
}

export function countedStrikes(
  strikes: Strike[],
  location: Pick<LiveLocation, 'countCloudToCloud'>,
): Strike[] {
  return strikes.filter((strike) => strike.type === 'cg' || location.countCloudToCloud)
}

export function isInsideRing(strike: Strike, location: LiveLocation): boolean {
  return distanceKm(location, strike) <= location.radiusKm
}

/** The newest counted strike inside the ring, with its distance. */
export function latestStrikeInRing(
  location: LiveLocation,
  strikes: Strike[],
): { strike: Strike; distanceKm: number } | null {
  let latest: { strike: Strike; distanceKm: number } | null = null
  for (const strike of countedStrikes(strikes, location)) {
    const distance = distanceKm(location, strike)
    if (distance > location.radiusKm) continue
    if (!latest || strike.time > latest.strike.time) latest = { strike, distanceKm: distance }
  }
  return latest
}

/** The closest counted strike, inside the ring or not. */
export function nearestStrike(
  location: LiveLocation,
  strikes: Strike[],
): { strike: Strike; distanceKm: number } | null {
  let nearest: { strike: Strike; distanceKm: number } | null = null
  for (const strike of countedStrikes(strikes, location)) {
    const distance = distanceKm(location, strike)
    if (!nearest || distance < nearest.distanceKm) nearest = { strike, distanceKm: distance }
  }
  return nearest
}

/** Milliseconds left until all-clear, or null when the ring is clear. Restarts on each counted strike inside the ring. */
export function allClearRemaining(
  location: LiveLocation,
  strikes: Strike[],
  now: number,
  minutes: number,
): number | null {
  const latest = latestStrikeInRing(location, strikes)
  if (!latest) return null
  const remaining = latest.strike.time + minutes * MINUTE_MS - now
  return remaining > 0 ? remaining : null
}

export function ringState(
  location: LiveLocation,
  strikes: Strike[],
  now: number,
  allClearMinutes: number,
): RingState {
  return allClearRemaining(location, strikes, now, allClearMinutes) === null ? 'clear' : 'active'
}

export type AgeBucket = 'lt5' | 'lt15' | 'lt30'
export type StrikeCounts = Record<StrikeType, Record<AgeBucket, number>>

export function strikeCounts(strikes: Strike[], now: number): StrikeCounts {
  const counts: StrikeCounts = {
    cg: { lt5: 0, lt15: 0, lt30: 0 },
    cc: { lt5: 0, lt15: 0, lt30: 0 },
  }
  for (const strike of strikes) {
    const age = strikeAgeMinutes(strike, now)
    if (age >= STRIKE_WINDOW_MIN) continue
    const bucket: AgeBucket = age < 5 ? 'lt5' : age < 15 ? 'lt15' : 'lt30'
    counts[strike.type][bucket] += 1
  }
  return counts
}

export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function formatKm(km: number): string {
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`
}

export function formatAgo(ageMin: number): string {
  const minutes = Math.floor(ageMin)
  return minutes < 1 ? 'just now' : `${minutes} min ago`
}
