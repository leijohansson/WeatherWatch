export function radarTimestamp(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${get('year')}${get('month')}${get('day')}${get('hour')}${get('minute')}0000`
}

export function recentRadarTimestamps(now = new Date(), count = 5): string[] {
  const interval = 15 * 60 * 1000
  const boundary = Math.floor(now.getTime() / interval) * interval
  return Array.from({ length: count }, (_, index) =>
    radarTimestamp(new Date(boundary - index * interval)),
  )
}

export function millisecondsUntilNextBoundary(now = new Date(), delayMs = 60_000) {
  const interval = 15 * 60 * 1000
  return interval - (now.getTime() % interval) + delayMs
}

export function radarUrl(timestamp: string) {
  return `/weather-radar/dpsri_240km_${timestamp}dBR.dpsri.png`
}
