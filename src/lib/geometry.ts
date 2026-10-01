import type { Point } from '@/types'

export function pointInPolygon(point: Point, vertices: Point[]): boolean {
  if (vertices.length < 3) return false
  let inside = false
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[i]
    const b = vertices[j]
    if (!a || !b) continue
    const intersects =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    if (intersects) inside = !inside
  }
  return inside
}

export function clientToNormalized(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
): Point {
  return {
    x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
  }
}

export function pointsAttribute(vertices: Point[]) {
  return vertices.map(({ x, y }) => `${x * 100},${y * 100}`).join(' ')
}

/** Zoom on a 0–1 map: `center` is the map point in the middle of the viewport. */
export interface MapView {
  scale: number
  center: Point
}

export const FULL_VIEW: MapView = { scale: 1, center: { x: 0.5, y: 0.5 } }

/** Keeps the zoomed map covering the whole viewport. */
export function clampView(view: MapView, minScale = 1, maxScale = 6): MapView {
  const scale = Math.max(minScale, Math.min(maxScale, view.scale))
  const half = 0.5 / scale
  return {
    scale,
    center: {
      x: Math.max(half, Math.min(1 - half, view.center.x)),
      y: Math.max(half, Math.min(1 - half, view.center.y)),
    },
  }
}

/** A 0–1 position in the viewport to the 0–1 map position under it. */
export function viewToMap(screen: Point, view: MapView): Point {
  // Rounded far below a radar pixel, so stored corners don't pick up float noise like 0.0999…
  const round = (value: number) => Math.round(value * 1e9) / 1e9
  return {
    x: round((screen.x - 0.5) / view.scale + view.center.x),
    y: round((screen.y - 0.5) / view.scale + view.center.y),
  }
}

/** Zooms by `factor`, keeping the map point under `anchor` (a 0–1 viewport position) in place. */
export function zoomView(view: MapView, factor: number, anchor: Point = { x: 0.5, y: 0.5 }): MapView {
  const target = viewToMap(anchor, view)
  const scale = clampView({ ...view, scale: view.scale * factor }).scale
  return clampView({
    scale,
    center: { x: target.x - (anchor.x - 0.5) / scale, y: target.y - (anchor.y - 0.5) / scale },
  })
}
