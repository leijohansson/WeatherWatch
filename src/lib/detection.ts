import { pointInPolygon } from './geometry'
import { classifyRadarColor, INTENSITY_RANK, meetsIntensity } from './palette'
import type {
  AlertArea,
  AreaReading,
  Intensity,
  RadarCluster,
  RadarFrame,
} from '@/types'

function intensityAt(frame: RadarFrame, index: number): Intensity | null {
  const offset = index * 4
  return classifyRadarColor(
    frame.pixels[offset] ?? 0,
    frame.pixels[offset + 1] ?? 0,
    frame.pixels[offset + 2] ?? 0,
    frame.pixels[offset + 3] ?? 0,
  )
}

export function connectedComponents(
  pixelIndexes: Set<number>,
  width: number,
  intensityForPixel: (index: number) => Intensity,
): RadarCluster[] {
  const remaining = new Set(pixelIndexes)
  const clusters: RadarCluster[] = []

  while (remaining.size) {
    const start = remaining.values().next().value as number
    remaining.delete(start)
    const queue = [start]
    const pixels: number[] = []
    let maxIntensity: Intensity = intensityForPixel(start)

    while (queue.length) {
      const current = queue.pop()
      if (current === undefined) break
      pixels.push(current)
      const x = current % width
      const neighbors = [current - width, current + width]
      if (x > 0) neighbors.push(current - 1)
      if (x < width - 1) neighbors.push(current + 1)
      for (const neighbor of neighbors) {
        if (!remaining.delete(neighbor)) continue
        queue.push(neighbor)
        const intensity = intensityForPixel(neighbor)
        if (INTENSITY_RANK[intensity] > INTENSITY_RANK[maxIntensity]) maxIntensity = intensity
      }
    }
    clusters.push({ pixels, size: pixels.length, maxIntensity })
  }
  return clusters.sort((a, b) => b.size - a.size)
}

export function analyzeArea(frame: RadarFrame, area: AlertArea): AreaReading {
  const qualifying = new Set<number>()
  const intensityMap = new Map<number, Intensity>()
  let maximumIntensity: Intensity | null = null
  const xCoordinates = area.vertices.map(({ x }) => x)
  const yCoordinates = area.vertices.map(({ y }) => y)
  const startX = Math.max(0, Math.ceil(Math.min(...xCoordinates) * frame.width - 0.5))
  const endX = Math.min(frame.width - 1, Math.floor(Math.max(...xCoordinates) * frame.width - 0.5))
  const startY = Math.max(0, Math.ceil(Math.min(...yCoordinates) * frame.height - 0.5))
  const endY = Math.min(frame.height - 1, Math.floor(Math.max(...yCoordinates) * frame.height - 0.5))

  for (let y = startY; y <= endY; y++) {
    for (let x = startX; x <= endX; x++) {
      if (!pointInPolygon({ x: (x + 0.5) / frame.width, y: (y + 0.5) / frame.height }, area.vertices))
        continue
      const index = y * frame.width + x
      const intensity = intensityAt(frame, index)
      if (!meetsIntensity(intensity, area.intensityThreshold) || !intensity) continue
      qualifying.add(index)
      intensityMap.set(index, intensity)
      if (!maximumIntensity || INTENSITY_RANK[intensity] > INTENSITY_RANK[maximumIntensity])
        maximumIntensity = intensity
    }
  }

  const clusters = connectedComponents(
    qualifying,
    frame.width,
    (index) => intensityMap.get(index) ?? area.intensityThreshold,
  )
  return {
    qualifyingPixels: qualifying.size,
    maximumIntensity,
    clusters,
    rainy: qualifying.size >= area.pixelThreshold,
  }
}

export function isNewCluster(
  cluster: RadarCluster,
  previousMasks: number[][],
  width: number,
  expansion = 12,
): boolean {
  if (!previousMasks.length) return true
  const previous = new Set(previousMasks.flat())
  for (const index of cluster.pixels) {
    const x = index % width
    const y = Math.floor(index / width)
    for (let dy = -expansion; dy <= expansion; dy++) {
      for (let dx = -expansion; dx <= expansion; dx++) {
        if (dx * dx + dy * dy > expansion * expansion) continue
        const px = x + dx
        const py = y + dy
        if (px >= 0 && py >= 0 && px < width && previous.has(py * width + px)) return false
      }
    }
  }
  return true
}
