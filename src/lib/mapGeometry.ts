import { project } from './geo'
import { pointInPolygon } from './geometry'
import type { LatLon, Point } from '@/types'

/** GeoJSON positions are [lon, lat]. */
export type Ring = [number, number][]
export type MultiPolygon = Ring[][]

export interface GeoFeature<P = Record<string, unknown>> {
  type: 'Feature'
  properties: P
  geometry: { type: 'MultiPolygon'; coordinates: MultiPolygon } | { type: 'Polygon'; coordinates: Ring[] }
}

export interface GeoCollection<P = Record<string, unknown>> {
  type: 'FeatureCollection'
  features: GeoFeature<P>[]
}

export function featurePolygons(feature: GeoFeature<unknown>): MultiPolygon {
  return feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates
}

/** SVG path data in projected km; use with fill-rule evenodd so holes stay holes. */
export function pathKm(polygons: MultiPolygon): string {
  let d = ''
  for (const polygon of polygons) {
    for (const ring of polygon) {
      ring.forEach(([lon, lat], index) => {
        const { x, y } = project(lat, lon)
        d += `${index ? 'L' : 'M'}${x.toFixed(3)} ${y.toFixed(3)}`
      })
      d += 'Z'
    }
  }
  return d
}

/** Outer rings as lat/lon lists, for distance checks. */
export function outerRings(polygons: MultiPolygon): LatLon[][] {
  return polygons.flatMap((polygon) =>
    polygon[0] ? [polygon[0].map(([lon, lat]) => ({ lat, lon }))] : [],
  )
}

/** Label anchor: the centroid of the largest outer ring, in km. */
export function labelAnchorKm(polygons: MultiPolygon): Point | null {
  let best: { area: number; point: Point } | null = null
  for (const polygon of polygons) {
    const ring = polygon[0]?.map(([lon, lat]) => project(lat, lon))
    if (!ring || ring.length < 3) continue
    let area = 0
    let cx = 0
    let cy = 0
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j]!
      const b = ring[i]!
      const cross = a.x * b.y - b.x * a.y
      area += cross
      cx += (a.x + b.x) * cross
      cy += (a.y + b.y) * cross
    }
    if (!area) continue
    const point = { x: cx / (3 * area), y: cy / (3 * area) }
    // Fall back to the first vertex for odd shapes whose centroid falls outside.
    const anchor = pointInPolygon(point, ring) ? point : ring[0]!
    if (!best || Math.abs(area) > best.area) best = { area: Math.abs(area), point: anchor }
  }
  return best?.point ?? null
}
