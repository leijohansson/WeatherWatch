import { pointInPolygon } from './geometry'
import type { LatLon, Point } from '@/types'

// Local equirectangular projection around Singapore. Accurate enough at this scale.
export const LAT0 = 1.35
export const LON0 = 103.82
const KM_PER_DEG_LON = Math.cos((LAT0 * Math.PI) / 180) * 111.32
const KM_PER_DEG_LAT = 110.57
const EARTH_RADIUS_KM = 6371.0088

// Geographic extent of the 240 km radar image (and the matching base map), WGS84.
export const RADAR_BOUNDS = { west: 101.812, east: 106.127, south: -0.805, north: 3.507 }

export function distanceKm(a: LatLon, b: LatLon): number {
  const toRad = Math.PI / 180
  const dLat = (b.lat - a.lat) * toRad
  const dLon = (b.lon - a.lon) * toRad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Position in km east (x) and south (y) of the projection origin. */
export function project(lat: number, lon: number): Point {
  return { x: (lon - LON0) * KM_PER_DEG_LON, y: (LAT0 - lat) * KM_PER_DEG_LAT }
}

export function unproject(point: Point): LatLon {
  return { lat: LAT0 - point.y / KM_PER_DEG_LAT, lon: LON0 + point.x / KM_PER_DEG_LON }
}

/** Watch areas are stored as 0–1 positions on the radar image. */
export function normalizedToLatLon(point: Point): LatLon {
  const { west, east, south, north } = RADAR_BOUNDS
  return { lat: north - point.y * (north - south), lon: west + point.x * (east - west) }
}

export function latLonToNormalized({ lat, lon }: LatLon): Point {
  const { west, east, south, north } = RADAR_BOUNDS
  return { x: (lon - west) / (east - west), y: (north - lat) / (north - south) }
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Distance in km from a point to a polygon's edge, or 0 when the point is inside. */
export function distanceToPolygonKm(point: LatLon, polygon: LatLon[]): number {
  const p = project(point.lat, point.lon)
  const ring = polygon.map(({ lat, lon }) => project(lat, lon))
  if (pointInPolygon(p, ring)) return 0
  let nearest = Infinity
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    nearest = Math.min(nearest, distanceToSegment(p, ring[j]!, ring[i]!))
  }
  return nearest
}

export function centroid(points: LatLon[]): LatLon | null {
  if (!points.length) return null
  const sum = points.reduce((acc, p) => ({ lat: acc.lat + p.lat, lon: acc.lon + p.lon }), {
    lat: 0,
    lon: 0,
  })
  return { lat: sum.lat / points.length, lon: sum.lon / points.length }
}

export function convexHull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  if (sorted.length < 3) return sorted
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: Point[] = []
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Point[] = []
  for (const p of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, p) <= 0) upper.pop()
    upper.push(p)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}
