import { INTENSITIES, type Intensity } from '@/types'

export const INTENSITY_LABELS: Record<Intensity, string> = {
  light: 'Light',
  moderate: 'Moderate',
  heavy: 'Heavy',
  intense: 'Intense',
}

export const INTENSITY_RANK: Record<Intensity, number> = {
  light: 1,
  moderate: 2,
  heavy: 3,
  intense: 4,
}

type RGB = [number, number, number]

const PALETTE: Record<Intensity, RGB[]> = {
  light: [
    [0, 255, 255],
    [0, 210, 210],
    [0, 170, 160],
  ],
  moderate: [
    [0, 215, 40],
    [35, 255, 0],
    [180, 255, 0],
    [255, 235, 0],
  ],
  heavy: [
    [255, 165, 0],
    [255, 95, 0],
    [255, 20, 0],
  ],
  intense: [
    [210, 0, 75],
    [145, 0, 110],
    [255, 0, 230],
  ],
}

const distance = (a: RGB, b: RGB) =>
  Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)

export function classifyRadarColor(r: number, g: number, b: number, a = 255): Intensity | null {
  if (a < 40 || Math.max(r, g, b) < 45) return null

  let closest: { intensity: Intensity; distance: number } | null = null
  for (const intensity of INTENSITIES) {
    for (const sample of PALETTE[intensity]) {
      const next = distance([r, g, b], sample)
      if (!closest || next < closest.distance) closest = { intensity, distance: next }
    }
  }
  return closest && closest.distance <= 115 ? closest.intensity : null
}

export function meetsIntensity(value: Intensity | null, threshold: Intensity) {
  return value !== null && INTENSITY_RANK[value] >= INTENSITY_RANK[threshold]
}
