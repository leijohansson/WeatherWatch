import { connectedComponents } from './detection'
import { convexHull, distanceToPolygonKm, normalizedToLatLon, project, RADAR_BOUNDS, unproject } from './geo'
import { pointInPolygon } from './geometry'
import { strikeAgeMinutes, typeAllowed } from './lightning'
import { classifyRadarColor, meetsIntensity } from './palette'
import type { ForecastSettings, Intensity, LatLon, RadarFrame, Strike } from '@/types'

export type SectorClass = 'discrepancy' | 'thunderstorm' | 'clear'

export const SECTOR_CLASS_COLORS: Record<SectorClass, string> = {
  discrepancy: '#b3123f',
  thunderstorm: '#b25e00',
  clear: '#1f6f69',
}

export const SECTOR_CLASS_LABELS: Record<SectorClass, string> = {
  discrepancy: 'Discrepancy',
  thunderstorm: 'Thunderstorm',
  clear: 'Clear',
}

// Only look for clusters where they can matter: Singapore plus the largest forecast distance.
export const CLUSTER_SEARCH_BOX = { west: 103.3, east: 104.4, south: 0.95, north: 1.75 }

export interface RadarClusterShape {
  id: string
  label: string
  areaKm2: number
  maxIntensity: Intensity
  /** Convex outline, for drawing. */
  outline: LatLon[]
  /** Centres of the cluster's edge pixels, for distance checks. */
  edge: LatLon[]
}

export function pixelAreaKm2(frame: Pick<RadarFrame, 'width' | 'height'>): number {
  const { west, east, south, north } = RADAR_BOUNDS
  const a = project(north, west)
  const b = project(south, east)
  return ((b.x - a.x) / frame.width) * ((b.y - a.y) / frame.height)
}

/** Connected rain areas at or above `minIntensity` and at least `minClusterKm2`, largest first. */
export function findRadarClusters(
  frame: RadarFrame,
  settings: ForecastSettings['radar'],
  box = CLUSTER_SEARCH_BOX,
): RadarClusterShape[] {
  const { west, east, south, north } = RADAR_BOUNDS
  const x0 = Math.max(0, Math.floor(((box.west - west) / (east - west)) * frame.width))
  const x1 = Math.min(frame.width - 1, Math.ceil(((box.east - west) / (east - west)) * frame.width))
  const y0 = Math.max(0, Math.floor(((north - box.north) / (north - south)) * frame.height))
  const y1 = Math.min(frame.height - 1, Math.ceil(((north - box.south) / (north - south)) * frame.height))

  const qualifying = new Set<number>()
  const intensities = new Map<number, Intensity>()
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const index = y * frame.width + x
      const o = index * 4
      const intensity = classifyRadarColor(
        frame.pixels[o] ?? 0,
        frame.pixels[o + 1] ?? 0,
        frame.pixels[o + 2] ?? 0,
        frame.pixels[o + 3] ?? 0,
      )
      if (!intensity || !meetsIntensity(intensity, settings.minIntensity)) continue
      qualifying.add(index)
      intensities.set(index, intensity)
    }
  }

  const pixelKm2 = pixelAreaKm2(frame)
  const toLatLon = (x: number, y: number) =>
    normalizedToLatLon({ x: x / frame.width, y: y / frame.height })

  return connectedComponents(qualifying, frame.width, (i) => intensities.get(i) ?? settings.minIntensity)
    .filter((cluster) => cluster.size * pixelKm2 >= settings.minClusterKm2)
    .map((cluster, index) => {
      const members = new Set(cluster.pixels)
      const corners = []
      const edge: LatLon[] = []
      for (const pixel of cluster.pixels) {
        const x = pixel % frame.width
        const y = Math.floor(pixel / frame.width)
        const isEdge =
          !members.has(pixel - 1) || !members.has(pixel + 1) ||
          !members.has(pixel - frame.width) || !members.has(pixel + frame.width)
        if (!isEdge) continue
        edge.push(toLatLon(x + 0.5, y + 0.5))
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
          const corner = toLatLon(x + dx, y + dy)
          corners.push(project(corner.lat, corner.lon))
        }
      }
      return {
        id: `C${index + 1}`,
        label: `CLUSTER C${index + 1}`,
        areaKm2: cluster.size * pixelKm2,
        maxIntensity: cluster.maxIntensity,
        outline: convexHull(corners).map(unproject),
        edge,
      }
    })
}

export interface SectorInput {
  id: string
  /** Outer rings of the sector's polygons. */
  rings: LatLon[][]
  /** Whether the official forecast for this sector expects lightning; null when unknown. */
  forecastLightning: boolean | null
}

function nearSector(point: LatLon, rings: LatLon[][], km: number) {
  return rings.some((ring) => distanceToPolygonKm(point, ring) <= km)
}

function clusterCoversSector(cluster: RadarClusterShape, rings: LatLon[][]) {
  const hull = cluster.outline.map(({ lat, lon }) => project(lat, lon))
  return rings.some((ring) => ring[0] && pointInPolygon(project(ring[0].lat, ring[0].lon), hull))
}

/**
 * Thunderstorm when a qualifying radar cluster or a recent strike is within the configured distance
 * of the sector; Discrepancy when that happens but the official forecast doesn't expect lightning.
 */
export function classifySectors(
  sectors: SectorInput[],
  clusters: RadarClusterShape[],
  strikes: Strike[],
  now: number,
  settings: ForecastSettings,
): Record<string, SectorClass> {
  const recent = strikes.filter(
    (strike) =>
      typeAllowed(strike.type, settings.lightning.types) &&
      strikeAgeMinutes(strike, now) < settings.lightning.windowMinutes,
  )
  const result: Record<string, SectorClass> = {}
  for (const sector of sectors) {
    const radar = clusters.some(
      (cluster) =>
        clusterCoversSector(cluster, sector.rings) ||
        cluster.edge.some((point) => nearSector(point, sector.rings, settings.radar.distanceKm)),
    )
    const lightning =
      !radar && recent.some((strike) => nearSector(strike, sector.rings, settings.lightning.distanceKm))
    const storm = radar || lightning
    result[sector.id] = !storm ? 'clear' : sector.forecastLightning === false ? 'discrepancy' : 'thunderstorm'
  }
  return result
}

/** 2-hour forecast texts that expect lightning, e.g. "Thundery Showers". */
export function forecastExpectsLightning(text: string | undefined): boolean | null {
  if (!text) return null
  return text.toLowerCase().includes('thunder')
}

/** SafeGuardian CAT codes meaning CAT 1 is incoming, active or pending clear. */
export function catExpectsLightning(code: string | undefined): boolean | null {
  if (code === undefined || code === '') return null
  return ['0', '1', '-1'].includes(code)
}

export function sectorCounts(classes: Record<string, SectorClass>): Record<SectorClass, number> {
  const counts: Record<SectorClass, number> = { discrepancy: 0, thunderstorm: 0, clear: 0 }
  for (const value of Object.values(classes)) counts[value] += 1
  return counts
}
