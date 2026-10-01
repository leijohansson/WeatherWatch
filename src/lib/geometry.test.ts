import { describe, expect, it } from 'vitest'
import { clampView, FULL_VIEW, viewToMap, zoomView } from './geometry'

describe('map zoom', () => {
  it('maps viewport positions to map positions', () => {
    expect(viewToMap({ x: 0.25, y: 0.75 }, FULL_VIEW)).toEqual({ x: 0.25, y: 0.75 })
    const zoomed = { scale: 2, center: { x: 0.5, y: 0.5 } }
    expect(viewToMap({ x: 0, y: 1 }, zoomed)).toEqual({ x: 0.25, y: 0.75 })
  })

  it('keeps the point under the cursor fixed while zooming', () => {
    const anchor = { x: 0.8, y: 0.3 }
    const before = viewToMap(anchor, FULL_VIEW)
    const zoomed = zoomView(FULL_VIEW, 2, anchor)
    expect(zoomed.scale).toBe(2)
    const after = viewToMap(anchor, zoomed)
    expect(after.x).toBeCloseTo(before.x, 10)
    expect(after.y).toBeCloseTo(before.y, 10)
  })

  it('never shows past the map edge or zooms out past the whole map', () => {
    expect(clampView({ scale: 2, center: { x: 0, y: 1 } }).center).toEqual({ x: 0.25, y: 0.75 })
    expect(clampView({ scale: 0.5, center: { x: 0.1, y: 0.1 } })).toEqual(FULL_VIEW)
    expect(zoomView(FULL_VIEW, 100).scale).toBe(6)
  })
})
