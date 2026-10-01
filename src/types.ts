export type Point = { x: number; y: number }
export type LatLon = { lat: number; lon: number }

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
  lightningEnabled: boolean
  lightningBufferKm: number
  lightningTypes: LightningTypes
  openLiveOnAlert: boolean
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

export type RainAlertReason = 'entry' | 'escalation' | 'new-cell'
export type AlertReason = RainAlertReason | 'lightning'

interface AlertEventBase {
  id: string
  areaId: string
  areaName: string
  timestamp: string
  source: 'live' | 'test'
}

export interface RainAlertEvent extends AlertEventBase {
  reason: RainAlertReason
  thresholdIntensity?: Intensity
  intensity: Intensity
  pixelCount: number
}

export interface LightningAlertEvent extends AlertEventBase {
  reason: 'lightning'
  groundCount: number
  cloudCount: number
  bufferKm: number
  nearestKm: number
  nearestType: StrikeType
  openLive: boolean
}

export type AlertEvent = RainAlertEvent | LightningAlertEvent

export interface AreaAlertState {
  rainy: boolean
  maximumIntensity: Intensity | null
  clusterPixels: number[][]
}

export type StrikeType = 'cg' | 'cc'
export type LightningTypes = 'cg' | 'cg+cc'

export interface Strike {
  id: string
  time: number // epoch ms
  lat: number
  lon: number
  type: StrikeType
}

export interface LiveLocation {
  id: string
  name: string
  lat: number
  lon: number
  radiusKm: number
  countCloudToCloud: boolean
  showCountdown: boolean
  notifyStrike: boolean
  notifyAllClear: boolean
}

export type SectorSet = 'town' | 'army' | 'off'

export interface LiveLayers {
  sectors: SectorSet
  forecast: boolean
  clusters: boolean
  cg: boolean
  cc: boolean
  rings: boolean
  radarOpacity: number
}

export interface ForecastSettings {
  radar: { minClusterKm2: number; distanceKm: number; minIntensity: Intensity }
  lightning: { distanceKm: number; windowMinutes: number; types: LightningTypes }
}

export interface LiveSettings {
  allClearEnabled: boolean
  allClearMinutes: number
  layers: LiveLayers
  forecast: ForecastSettings
}

export type RingState = 'clear' | 'active'

export interface PersistedSettings {
  monitoring: boolean
  overlayOpacity: number
  soundAlerts: boolean
  soundVolume: number
}

export interface PersistedStateV1 {
  version: 1
  areas: Omit<AlertArea, 'lightningEnabled' | 'lightningBufferKm' | 'lightningTypes' | 'openLiveOnAlert'>[]
  history: AlertEvent[]
  alertState: Record<string, AreaAlertState>
  settings: PersistedSettings
}

export interface PersistedState {
  version: 2
  areas: AlertArea[]
  history: AlertEvent[]
  alertState: Record<string, AreaAlertState>
  settings: PersistedSettings
  liveLocations: LiveLocation[]
  live: LiveSettings
  lightningState: Record<string, boolean>
}

export type MonitoringStatus =
  | 'idle'
  | 'checking'
  | 'monitoring'
  | 'offline'
  | 'cors-blocked'
  | 'error'
