/**
 * The rain-area (DPSRI) radar's 33-colour table, lightest rain first, from dbr_mapping.py.
 * Each 16 rain-rate bins (0.1–150 mm/h, each edge 1.58× the last) is drawn in two colours split
 * at the bin's geometric mean; the last colour is 150 mm/h and above.
 * Rows are [r, g, b, lowest rain rate in mm/h].
 */
const TABLE: [number, number, number, number][] = [
  [0, 255, 255, 0.1],
  [0, 239, 239, 0.1257],
  [0, 209, 213, 0.1579],
  [0, 186, 191, 0.1985],
  [0, 151, 154, 0.2495],
  [0, 131, 125, 0.3121],
  [0, 128, 69, 0.3904],
  [0, 137, 56, 0.4929],
  [0, 162, 53, 0.6223],
  [0, 183, 41, 0.7821],
  [0, 202, 17, 0.9829],
  [0, 218, 13, 1.235],
  [0, 245, 7, 1.553],
  [0, 255, 0, 1.951],
  [67, 255, 65, 2.452],
  [72, 255, 70, 3.082],
  [255, 255, 59, 3.873],
  [255, 255, 0, 4.867],
  [255, 240, 0, 6.117],
  [255, 220, 0, 7.688],
  [255, 198, 0, 9.662],
  [255, 178, 0, 12.14],
  [255, 165, 0, 15.26],
  [255, 138, 0, 19.18],
  [255, 114, 0, 24.1],
  [255, 73, 0, 30.29],
  [255, 31, 0, 38.07],
  [229, 0, 0, 47.84],
  [193, 0, 0, 60.13],
  [182, 0, 106, 75.57],
  [210, 0, 165, 94.97],
  [212, 0, 170, 119.4],
  [255, 0, 255, 150],
]

export const RADAR_COLORS = TABLE.map(([r, g, b]) => [r, g, b] as const)
export const RADAR_RATES = TABLE.map(([, , , rate]) => rate)

/** Selectable thresholds for the forecast: orange, then every second colour. */
export const RADAR_LEVEL_CHOICES = [
  { index: 21, name: 'Light orange' },
  { index: 23, name: 'Orange' },
  { index: 25, name: 'Red-orange' },
  { index: 27, name: 'Red' },
  { index: 29, name: 'Crimson' },
  { index: 31, name: 'Purple' },
] as const

export const DEFAULT_RADAR_LEVEL = 21

export function radarColorCss(index: number): string {
  const color = RADAR_COLORS[index]
  return color ? `rgb(${color[0]}, ${color[1]}, ${color[2]})` : 'transparent'
}

export function formatRate(index: number): string {
  const rate = RADAR_RATES[index] ?? 0
  return `${rate < 10 ? rate.toFixed(1) : Math.round(rate)} mm/h`
}

export function isRadarLevelChoice(index: unknown): index is number {
  return RADAR_LEVEL_CHOICES.some((choice) => choice.index === index)
}

// Radar pixels are exact table colours; anything further than this from all of them isn't rain.
const MAX_DISTANCE_SQUARED = 30 ** 2

/** The table index of a radar pixel's colour, or null for no rain. */
export function radarLevel(r: number, g: number, b: number, a = 255): number | null {
  if (a < 40) return null
  let best: number | null = null
  let bestDistance = MAX_DISTANCE_SQUARED
  RADAR_COLORS.forEach(([cr, cg, cb], index) => {
    const distance = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2
    if (distance <= bestDistance) {
      best = index
      bestDistance = distance
    }
  })
  return best
}
