import type { StrikeType } from '@/types'

/** SVG path for a strike marker centred on (x, y): a plus for cloud-to-ground, a diamond for cloud-to-cloud. */
export function strikePath(type: StrikeType, x: number, y: number, fresh: boolean, scale = 1): string {
  if (type === 'cg') {
    const arm = (fresh ? 6.5 : 5.5) * scale
    const half = ((fresh ? 2.1 : 1.8) * scale) / 2
    return [
      `M${x - half},${y - arm}`,
      `H${x + half}V${y - half}H${x + arm}V${y + half}H${x + half}V${y + arm}`,
      `H${x - half}V${y + half}H${x - arm}V${y - half}H${x - half}Z`,
    ].join('')
  }
  const r = (fresh ? 4.4 : 3.8) * scale
  return `M${x},${y - r}L${x + r},${y}L${x},${y + r}L${x - r},${y}Z`
}
