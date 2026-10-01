import { INTENSITY_RANK } from './palette'
import { isNewCluster } from './detection'
import type {
  AlertArea,
  AreaAlertState,
  AreaReading,
  RadarFrame,
  RainAlertEvent,
  RainAlertReason,
} from '@/types'

export function evaluateTransition(
  area: AlertArea,
  reading: AreaReading,
  previous: AreaAlertState | undefined,
  frame: Pick<RadarFrame, 'timestamp' | 'source' | 'width'>,
): { next: AreaAlertState; events: RainAlertEvent[] } {
  const prior = previous ?? { rainy: false, maximumIntensity: null, clusterPixels: [] }
  const next: AreaAlertState = {
    rainy: reading.rainy,
    maximumIntensity: reading.maximumIntensity,
    clusterPixels: reading.clusters.map((cluster) => cluster.pixels),
  }
  const events: RainAlertEvent[] = []
  if (!reading.rainy || !reading.maximumIntensity) return { next, events }

  const add = (reason: RainAlertReason, pixelCount = reading.qualifyingPixels) => {
    events.push({
      id: `${area.id}-${frame.timestamp}-${reason}`,
      areaId: area.id,
      areaName: area.name,
      reason,
      timestamp: frame.timestamp,
      thresholdIntensity: area.intensityThreshold,
      intensity: reading.maximumIntensity!,
      pixelCount,
      source: frame.source,
    })
  }

  if (!prior.rainy) {
    add('entry')
  } else if (
    prior.maximumIntensity &&
    INTENSITY_RANK[reading.maximumIntensity] > INTENSITY_RANK[prior.maximumIntensity]
  ) {
    add('escalation')
  }

  if (area.notifyNewCell && prior.rainy) {
    for (const cluster of reading.clusters) {
      if (
        cluster.size >= area.pixelThreshold &&
        isNewCluster(cluster, prior.clusterPixels, frame.width)
      ) {
        add('new-cell', cluster.size)
        break
      }
    }
  }
  return { next, events }
}
