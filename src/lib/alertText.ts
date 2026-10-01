import { INTENSITY_LABELS } from './palette'
import type { AlertEvent } from '@/types'

export function liveHref(focusId: string, fromAlert = true): string {
  const params = new URLSearchParams({ focus: focusId })
  if (fromAlert) params.set('from', 'alert')
  return `#/live?${params.toString()}`
}

export function rainDetail(event: AlertEvent, suffix = 'threshold'): string {
  const threshold = event.thresholdIntensity ?? event.intensity
  return threshold === event.intensity
    ? `${INTENSITY_LABELS[threshold]} ${suffix}`
    : `${INTENSITY_LABELS[threshold]} ${suffix} · peak ${INTENSITY_LABELS[event.intensity]}`
}

export const REASON_LABELS: Record<AlertEvent['reason'], string> = {
  entry: 'Rain entered',
  escalation: 'Intensity increased',
  'new-cell': 'New rain cell',
}

/** Compact "YYYYMMDDHHmm…" timestamps (radar frames and alert events) as a Date. */
export function parseCompactTimestamp(timestamp: string): Date | null {
  const compact = timestamp.replace(/\D/g, '')
  if (compact.length < 12) return null
  return new Date(
    `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}T${compact.slice(8, 10)}:${compact.slice(10, 12)}:00+08:00`,
  )
}

const clockFormat = new Intl.DateTimeFormat('en-SG', {
  timeZone: 'Asia/Singapore',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** "14:31" in Singapore time. */
export function formatClock(time: number | Date): string {
  return clockFormat.format(time)
}
