export type Point = { x: number; y: number }

export const INTENSITIES = ['light', 'moderate', 'heavy', 'intense'] as const
export type Intensity = (typeof INTENSITIES)[number]

export interface AlertArea {
  id: string
  name: string
  color: string
  enabled: boolean
  vertices: Point[]
  intensityThreshold: Intensity
  pixelThreshold: number
  notifyNewCell: boolean
}

export interface RadarFrame {
  source: 'live' | 'test'
  timestamp: string
  url: string
  width: number
  height: number
  pixels: Uint8ClampedArray
}

export interface RadarCluster {
  pixels: number[]
  size: number
  maxIntensity: Intensity
}

export interface AreaReading {
  qualifyingPixels: number
  maximumIntensity: Intensity | null
  clusters: RadarCluster[]
  rainy: boolean
}

export type AlertReason = 'entry' | 'escalation' | 'new-cell'

export interface AlertEvent {
  id: string
  areaId: string
  areaName: string
  reason: AlertReason
  timestamp: string
  thresholdIntensity?: Intensity
  intensity: Intensity
  pixelCount: number
  source: 'live' | 'test'
}

export interface AreaAlertState {
  rainy: boolean
  maximumIntensity: Intensity | null
  clusterPixels: number[][]
}

export interface PersistedState {
  version: 1
  areas: AlertArea[]
  history: AlertEvent[]
  alertState: Record<string, AreaAlertState>
  settings: {
    monitoring: boolean
    overlayOpacity: number
    soundAlerts: boolean
    soundVolume: number
  }
}

export type MonitoringStatus =
  | 'idle'
  | 'checking'
  | 'monitoring'
  | 'offline'
  | 'cors-blocked'
  | 'error'
