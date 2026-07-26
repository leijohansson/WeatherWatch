import { defineComponent, h, reactive, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { useRadarMonitor } from './useRadarMonitor'
import type { AlertArea, AlertEvent, RadarFrame } from '@/types'

function mountMonitor(setupMonitor: () => void) {
  return mount(
    defineComponent({
      setup() {
        setupMonitor()
        return () => h('div')
      },
    }),
  )
}

describe('radar monitor area edits', () => {
  it('reanalyzes an edited polygon against the current frame without sending an alert', () => {
    const area: AlertArea = {
      id: 'home',
      name: 'Home',
      color: '#ff0000',
      enabled: true,
      vertices: [
        { x: 0, y: 0 },
        { x: 0.5, y: 0 },
        { x: 0.5, y: 1 },
        { x: 0, y: 1 },
      ],
      intensityThreshold: 'moderate',
      pixelThreshold: 1,
      notifyNewCell: false,
    }
    const events: AlertEvent[] = []
    const areas = ref([area])
    const liveState = reactive({})
    let monitor!: ReturnType<typeof useRadarMonitor>
    const wrapper = mountMonitor(() => {
      monitor = useRadarMonitor({
        areas,
        monitoring: ref(false),
        liveState,
        addEvents: (next) => events.push(...next),
        notifyFailure: () => undefined,
      })
    })
    const frame: RadarFrame = {
      source: 'live',
      timestamp: '2026072323000000',
      url: '/radar.png',
      width: 2,
      height: 1,
      pixels: new Uint8ClampedArray([
        30, 250, 0, 255,
        0, 0, 0, 0,
      ]),
    }

    monitor.processFrame(frame)
    expect(monitor.visibleReadings.value.home?.qualifyingPixels).toBe(1)
    expect(events).toHaveLength(1)

    area.vertices = [
      { x: 0.5, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0.5, y: 1 },
    ]
    monitor.reanalyzeArea(area.id)

    expect(monitor.visibleReadings.value.home?.qualifyingPixels).toBe(0)
    expect(liveState.home?.rainy).toBe(false)
    expect(events).toHaveLength(1)
    wrapper.unmount()
  })

  it('notifies once when all radar fallbacks fail in the same period', async () => {
    class FailingImage {
      crossOrigin: string | null = null
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.())
      }
    }
    vi.stubGlobal('Image', FailingImage)
    const monitoring = ref(false)
    const notifyFailure = vi.fn()
    let monitor!: ReturnType<typeof useRadarMonitor>
    const wrapper = mountMonitor(() => {
      monitor = useRadarMonitor({
        areas: ref([]),
        monitoring,
        liveState: reactive({}),
        addEvents: () => undefined,
        notifyFailure,
      })
    })

    monitoring.value = true
    await flushPromises()
    expect(monitor.status.value).toBe('error')
    expect(notifyFailure).toHaveBeenCalledTimes(1)

    await monitor.poll()
    expect(notifyFailure).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
})
