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
  const interval = 5 * 60 * 1000
  const boundary = Math.floor(now.getTime() / interval) * interval
  return Array.from({ length: count }, (_, index) =>
    radarTimestamp(new Date(boundary - index * interval)),
  )
}

export function millisecondsUntilNextBoundary(now = new Date()) {
  const interval = 3 * 60 * 1000
  return interval - (now.getTime() % interval)
}

export function radarUrl(timestamp: string) {
  return `/api/weather-radar/img/dpsri_240km_${timestamp}dBR.dpsri.png`
}
