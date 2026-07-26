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

  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
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
