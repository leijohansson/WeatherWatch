import { describe, expect, it } from 'vitest'
import { analyzeArea, connectedComponents, isNewCluster } from './detection'
import { clientToNormalized, pointInPolygon, pointsAttribute } from './geometry'
import { classifyRadarColor, meetsIntensity } from './palette'
import { evaluateTransition } from './transitions'
import type {
  AlertArea,
  AreaAlertState,
  AreaReading,
  Intensity,
  RadarFrame,
} from '@/types'

const area: AlertArea = {
  id: 'central',
  name: 'Central',
  color: '#fff',
  enabled: true,
  vertices: [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ],
  intensityThreshold: 'moderate',
  pixelThreshold: 3,
  notifyNewCell: true,
}

function frameWith(colors: Array<[number, number, number] | null>, width = 3): RadarFrame {
  const pixels = new Uint8ClampedArray(colors.length * 4)
  colors.forEach((color, index) => {
    if (!color) return
    pixels.set([...color, 255], index * 4)
  })
  return {
    source: 'live',
    timestamp: '2026072320150000',
    url: 'test.png',
    width,
    height: colors.length / width,
    pixels,
  }
}

describe('radar palette', () => {
  it('classifies ordered representative colours and ignores transparent background', () => {
    expect(classifyRadarColor(0, 230, 225)).toBe('light')
    expect(classifyRadarColor(30, 250, 0)).toBe('moderate')
    expect(classifyRadarColor(255, 85, 0)).toBe('heavy')
    expect(classifyRadarColor(200, 0, 80)).toBe('intense')
    expect(classifyRadarColor(0, 0, 0, 0)).toBeNull()
    expect(meetsIntensity('heavy', 'moderate')).toBe(true)
    expect(meetsIntensity('light', 'moderate')).toBe(false)
  })
})

describe('normalized geometry', () => {
  const square = [
    { x: 0.25, y: 0.25 },
    { x: 0.75, y: 0.25 },
    { x: 0.75, y: 0.75 },
    { x: 0.25, y: 0.75 },
  ]

  it('masks points inside a polygon', () => {
    expect(pointInPolygon({ x: 0.5, y: 0.5 }, square)).toBe(true)
    expect(pointInPolygon({ x: 0.1, y: 0.5 }, square)).toBe(false)
  })

  it('maps any display size into the same normalized coordinate system', () => {
    expect(clientToNormalized(426.5, 426.5, { left: 0, top: 0, width: 853, height: 853 }))
      .toEqual({ x: 0.5, y: 0.5 })
    expect(clientToNormalized(240, 240, { left: 0, top: 0, width: 480, height: 480 }))
      .toEqual({ x: 0.5, y: 0.5 })
    expect(pointsAttribute(square)).toContain('25,25')
  })
})

describe('rain analysis', () => {
  it('applies threshold, minimum pixel count, and connected components', () => {
    const frame = frameWith([
      [0, 230, 0],
      [0, 230, 0],
      null,
      [0, 230, 0],
      null,
      [255, 80, 0],
      null,
      null,
      [0, 220, 220],
    ])
    const reading = analyzeArea(frame, area)
    expect(reading.qualifyingPixels).toBe(4)
    expect(reading.rainy).toBe(true)
    expect(reading.maximumIntensity).toBe('heavy')
    expect(reading.clusters.map((cluster) => cluster.size)).toEqual([3, 1])
  })

  it('finds components without wrapping rows and matches expanded previous cells', () => {
    const intensities = new Map<number, Intensity>([
      [2, 'moderate'],
      [3, 'heavy'],
    ])
    const clusters = connectedComponents(new Set([2, 3]), 3, (index) => intensities.get(index)!)
    expect(clusters).toHaveLength(2)
    expect(isNewCluster(clusters[0]!, [[1]], 3, 1)).toBe(false)
    expect(isNewCluster({ pixels: [8], size: 1, maxIntensity: 'heavy' }, [[0]], 3, 1)).toBe(true)
  })
})

describe('alert transitions', () => {
  const reading = (
    rainy: boolean,
    maximumIntensity: Intensity | null,
    pixels = [0, 1, 2],
  ): AreaReading => ({
    rainy,
    maximumIntensity,
    qualifyingPixels: pixels.length,
    clusters: maximumIntensity
      ? [{ pixels, size: pixels.length, maxIntensity: maximumIntensity }]
      : [],
  })
  const frame = { timestamp: '2026072320150000', source: 'live' as const, width: 480 }

  it('alerts on entry and intensity escalation', () => {
    const entry = evaluateTransition(area, reading(true, 'moderate'), undefined, frame)
    expect(entry.events.map((event) => event.reason)).toEqual(['entry'])
    expect(entry.events[0]).toMatchObject({
      thresholdIntensity: 'moderate',
      intensity: 'moderate',
      pixelCount: 3,
    })
    const escalation = evaluateTransition(area, reading(true, 'heavy'), entry.next, frame)
    expect(escalation.events.map((event) => event.reason)).toEqual(['escalation'])
  })

  it('detects an independently qualifying new cell and clears only on a valid clear reading', () => {
    const previous: AreaAlertState = {
      rainy: true,
      maximumIntensity: 'moderate',
      clusterPixels: [[0, 1, 2]],
    }
    const next = evaluateTransition(
      area,
      reading(true, 'moderate', [480 * 100, 480 * 100 + 1, 480 * 100 + 2]),
      previous,
      frame,
    )
    expect(next.events.map((event) => event.reason)).toEqual(['new-cell'])
    const clear = evaluateTransition(area, reading(false, null, []), next.next, frame)
    expect(clear.next.rainy).toBe(false)
    expect(clear.events).toHaveLength(0)
  })
})
