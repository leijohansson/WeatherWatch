import { describe, expect, it } from 'vitest'
import {
  bufferOutline,
  distanceKm,
  distanceToPolygonKm,
  latLonToNormalized,
  normalizedToLatLon,
  project,
  unproject,
} from './geo'

describe('geo', () => {
  it('measures haversine distance', () => {
    expect(distanceKm({ lat: 1.35, lon: 103.82 }, { lat: 1.35, lon: 103.82 })).toBe(0)
    // One degree of latitude is about 111.2 km on the mean-radius sphere.
    expect(distanceKm({ lat: 1, lon: 103.8 }, { lat: 2, lon: 103.8 })).toBeCloseTo(111.2, 0)
  })

  it('projects around the Singapore origin in km', () => {
    expect(project(1.35, 103.82)).toEqual({ x: 0, y: 0 })
    const north = project(1.45, 103.82)
    expect(north.x).toBe(0)
    expect(north.y).toBeCloseTo(-11.057, 3)
    const east = project(1.35, 103.92)
    expect(east.x).toBeCloseTo(11.129, 2)
  })

  it('agrees with haversine at city scale', () => {
    const a = { lat: 1.3, lon: 103.75 }
    const b = { lat: 1.42, lon: 103.95 }
    const pa = project(a.lat, a.lon)
    const pb = project(b.lat, b.lon)
    expect(Math.hypot(pa.x - pb.x, pa.y - pb.y)).toBeCloseTo(distanceKm(a, b), 0)
  })

  it('round-trips projection and radar-image coordinates', () => {
    const point = unproject(project(1.29, 103.85))
    expect(point.lat).toBeCloseTo(1.29, 9)
    expect(point.lon).toBeCloseTo(103.85, 9)
    const normalized = latLonToNormalized({ lat: 1.35, lon: 103.82 })
    expect(normalizedToLatLon(normalized).lat).toBeCloseTo(1.35, 9)
    expect(normalized.x).toBeGreaterThan(0.4)
    expect(normalized.x).toBeLessThan(0.6)
  })

  it('measures distance to a polygon, zero inside', () => {
    const square = [
      { lat: 1.3, lon: 103.8 },
      { lat: 1.3, lon: 103.9 },
      { lat: 1.4, lon: 103.9 },
      { lat: 1.4, lon: 103.8 },
    ]
    expect(distanceToPolygonKm({ lat: 1.35, lon: 103.85 }, square)).toBe(0)
    const east = distanceToPolygonKm({ lat: 1.35, lon: 104.0 }, square)
    expect(east).toBeCloseTo(distanceKm({ lat: 1.35, lon: 103.9 }, { lat: 1.35, lon: 104.0 }), 1)
  })
})

describe('buffer outline', () => {
  it('grows a square by the buffer distance', () => {
    const square = [
      { lat: 1.3, lon: 103.8 },
      { lat: 1.3, lon: 103.9 },
      { lat: 1.4, lon: 103.9 },
      { lat: 1.4, lon: 103.8 },
    ]
    const outline = bufferOutline(square, 5)
    for (const point of outline) {
      expect(distanceToPolygonKm(point, square)).toBeGreaterThan(4.9)
      expect(distanceToPolygonKm(point, square)).toBeLessThanOrEqual(5.01)
    }
    expect(bufferOutline(square, 0).length).toBe(4)
  })
})
