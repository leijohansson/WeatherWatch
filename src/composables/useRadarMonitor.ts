import { computed, onBeforeUnmount, onMounted, reactive, ref, watch, type Ref } from 'vue'
import sampleRadarUrl from '../../assets/dpsri_240km_2026072320150000dBR.dpsri.png'
import { analyzeArea } from '@/lib/detection'
import { CanvasAccessError, loadRadarFrame } from '@/lib/frame'
import { fetchLatestRadarImage } from '@/lib/radarApi'
import { evaluateTransition } from '@/lib/transitions'
import {
  millisecondsUntilNextBoundary,
  radarTimestamp,
  radarUrl,
  recentRadarTimestamps,
} from '@/lib/timestamps'
import type {
  AlertArea,
  AreaAlertState,
  AreaReading,
  AlertEvent,
  MonitoringStatus,
  RadarFrame,
} from '@/types'

interface MonitorOptions {
  areas: Ref<AlertArea[]>
  monitoring: Ref<boolean>
  liveState: Record<string, AreaAlertState>
  addEvents: (events: AlertEvent[]) => void
  notifyFailure: (message: string) => void
}

type RadarSource = 'data.gov.sg' | 'weather.gov.sg' | 'legacy' | null

export function useRadarMonitor(options: MonitorOptions) {
  const status = ref<MonitoringStatus>('idle')
  const latestTimestamp = ref<string | null>(null)
  const overlayUrl = ref<string | null>(null)
  const lastError = ref<string | null>(null)
  const radarSource = ref<RadarSource>(null)
  const lastRadarCheck = ref<number | null>(null)
  const processed = new Set<string>()
  const testMode = ref(false)
  const testState = reactive<Record<string, AreaAlertState>>({})
  const liveReadings = reactive<Record<string, AreaReading>>({})
  const testReadings = reactive<Record<string, AreaReading>>({})
  const testTimestamp = ref<string | null>(null)
  const testOverlayUrl = ref<string | null>(null)
  let liveFrame: RadarFrame | null = null
  let testFrame: RadarFrame | null = null
  let notifiedFailureBoundary: string | null = null
  let boundaryTimer: ReturnType<typeof setTimeout> | undefined

  function notifyFailure(message: string) {
    const boundary = radarTimestamp(new Date())
    if (notifiedFailureBoundary === boundary) return
    notifiedFailureBoundary = boundary
    options.notifyFailure(message)
  }

  function processFrame(frame: RadarFrame) {
    if (frame.source === 'live') liveFrame = frame
    else testFrame = frame
    const state = frame.source === 'live' ? options.liveState : testState
    const readings = frame.source === 'live' ? liveReadings : testReadings
    const events: AlertEvent[] = []
    for (const area of options.areas.value) {
      if (!area.enabled) continue
      const reading = analyzeArea(frame, area)
      readings[area.id] = reading
      const transition = evaluateTransition(area, reading, state[area.id], frame)
      state[area.id] = transition.next
      events.push(...transition.events)
    }
    if (events.length) options.addEvents(events)
    if (frame.source === 'live') {
      latestTimestamp.value = frame.timestamp
      overlayUrl.value = frame.url
      processed.add(frame.timestamp)
    } else {
      testTimestamp.value = frame.timestamp
    }
    return events
  }

  function reanalyzeArea(areaId: string) {
    const frame = testMode.value ? testFrame : liveFrame
    const state = testMode.value ? testState : options.liveState
    const readings = testMode.value ? testReadings : liveReadings
    const area = options.areas.value.find((candidate) => candidate.id === areaId)

    if (!area?.enabled) {
      delete readings[areaId]
      delete state[areaId]
      return
    }
    if (!frame) return

    const reading = analyzeArea(frame, area)
    readings[areaId] = reading
    state[areaId] = {
      rainy: reading.rainy,
      maximumIntensity: reading.maximumIntensity,
      clusterPixels: reading.clusters.map((cluster) => cluster.pixels),
    }
  }

  async function loadLegacyFallback(): Promise<RadarFrame | null> {
    let lastFailure: unknown
    for (const timestamp of recentRadarTimestamps()) {
      if (processed.has(timestamp)) return null
      try {
        return await loadRadarFrame(radarUrl(timestamp), timestamp, 'live')
      } catch (error) {
        if (error instanceof CanvasAccessError) throw error
        lastFailure = error
      }
    }
    throw lastFailure instanceof Error
      ? lastFailure
      : new Error('No legacy radar image could be loaded.')
  }

  async function poll() {
    if (!options.monitoring.value || status.value === 'checking') return
    if (!navigator.onLine) {
      status.value = 'offline'
      lastError.value = 'You appear to be offline. Existing rain states were preserved.'
      notifyFailure(lastError.value)
      lastRadarCheck.value = Date.now()
      scheduleNext()
      return
    }
    status.value = 'checking'
    lastError.value = null
    try {
      let frame: RadarFrame | null = null
      try {
        const { timestamp, url, source } = await fetchLatestRadarImage()
        if (!processed.has(timestamp)) frame = await loadRadarFrame(url, timestamp, 'live')
        radarSource.value = source as RadarSource
      } catch {
        frame = await loadLegacyFallback()
        radarSource.value = 'legacy'
      }
      if (frame) {
        processFrame(frame)
      }
      status.value = 'monitoring'
    } catch (error) {
      if (error instanceof CanvasAccessError) {
        status.value = 'cors-blocked'
        lastError.value =
          'Live image analysis is blocked by both radar sources. Test mode remains available.'
      } else {
        status.value = 'error'
        lastError.value = 'The latest radar image could not be loaded. Existing rain states were preserved.'
      }
      notifyFailure(lastError.value)
    }
    lastRadarCheck.value = Date.now()
    scheduleNext()
  }

  function scheduleNext() {
    clearTimeout(boundaryTimer)
    if (!options.monitoring.value) return
    boundaryTimer = setTimeout(() => void poll(), millisecondsUntilNextBoundary())
  }

  async function useSampleFrame() {
    testMode.value = true
    lastError.value = null
    try {
      const timestamp = '2026072320150000'
      const frame = await loadRadarFrame(sampleRadarUrl, timestamp, 'test')
      testOverlayUrl.value = sampleRadarUrl
      return processFrame(frame)
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : 'The sample frame could not be read.'
      return []
    }
  }

  function useClearFrame() {
    testMode.value = true
    testOverlayUrl.value = null
    const width = 480
    const timestamp = radarTimestamp(new Date())
    return processFrame({
      source: 'test',
      timestamp,
      url: '',
      width,
      height: width,
      pixels: new Uint8ClampedArray(width * width * 4),
    })
  }

  function leaveTestMode() {
    testMode.value = false
    testOverlayUrl.value = null
    for (const key of Object.keys(testState)) delete testState[key]
    for (const key of Object.keys(testReadings)) delete testReadings[key]
  }

  watch(
    () => options.monitoring.value,
    (enabled) => {
      if (enabled) void poll()
      else {
        clearTimeout(boundaryTimer)
        status.value = 'idle'
      }
    },
  )

  const visibleOverlay = computed(() =>
    testMode.value ? testOverlayUrl.value : overlayUrl.value,
  )
  const visibleTimestamp = computed(() =>
    testMode.value ? testTimestamp.value : latestTimestamp.value,
  )
  const visibleState = computed(() => (testMode.value ? testState : options.liveState))
  const visibleReadings = computed(() => (testMode.value ? testReadings : liveReadings))
  const radarAgeMinutes = computed(() => {
    const timestamp = latestTimestamp.value
    if (!timestamp) return null
    const date = new Date(
      `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}T${timestamp.slice(8, 10)}:${timestamp.slice(10, 12)}:00+08:00`,
    )
    const now = Math.max(Date.now(), lastRadarCheck.value ?? 0)
    return Math.max(0, Math.floor((now - date.getTime()) / 60_000))
  })
  const radarIsStale = computed(
    () => !testMode.value && (radarAgeMinutes.value === null || radarAgeMinutes.value > 10),
  )
  const radarSourceLabel = computed(() => {
    if (testMode.value) return 'Sample radar'
    if (radarSource.value === 'data.gov.sg') return 'Source · data.gov.sg'
    if (radarSource.value === 'weather.gov.sg') return 'Source · weather.gov.sg'
    if (radarSource.value === 'legacy') return 'Source · local fallback'
    return 'Source · waiting for radar'
  })

  onMounted(() => {
    if (options.monitoring.value) void poll()
  })
  onBeforeUnmount(() => clearTimeout(boundaryTimer))

  return {
    status,
    latestTimestamp,
    visibleTimestamp,
    visibleOverlay,
    visibleState,
    visibleReadings,
    lastError,
    radarSourceLabel,
    radarAgeMinutes,
    radarIsStale,
    testMode,
    poll,
    useSampleFrame,
    useClearFrame,
    leaveTestMode,
    processFrame,
    reanalyzeArea,
  }
}
