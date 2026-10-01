import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useNotifications } from './useNotifications'
import type { AlertEvent } from '@/types'

describe('notifications', () => {
  it('distinguishes the configured threshold from the peak intensity', () => {
    const created: Array<{ title: string; body?: string }> = []
    class NotificationSpy {
      static permission: NotificationPermission = 'granted'
      static requestPermission = vi.fn(async () => 'granted' as NotificationPermission)
      constructor(title: string, options?: NotificationOptions) {
        created.push({ title, body: options?.body })
      }
    }
    vi.stubGlobal('Notification', NotificationSpy)
    const notifications = useNotifications()
    const event: AlertEvent = {
      id: 'event',
      areaId: 'home',
      areaName: 'Home',
      reason: 'entry',
      timestamp: '2026072320150000',
      thresholdIntensity: 'heavy',
      intensity: 'intense',
      pixelCount: 24,
      source: 'test',
    }
    notifications.send(event)
    expect(created[0]).toEqual({
      title: 'Test · Home',
      body:
        'Rain entered your area · Heavy threshold met · peak Intense · 24 qualifying pixels',
    })
  })

  it('sends a desktop confirmation after permission is granted', async () => {
    const created: Array<{ title: string; body?: string }> = []
    class NotificationSpy {
      static permission: NotificationPermission = 'default'
      static requestPermission = vi.fn(async () => 'granted' as NotificationPermission)
      constructor(title: string, options?: NotificationOptions) {
        created.push({ title, body: options?.body })
      }
    }
    vi.stubGlobal('Notification', NotificationSpy)
    const notifications = useNotifications()

    await notifications.requestPermission()

    expect(notifications.permission.value).toBe('granted')
    expect(created[0]).toEqual({
      title: 'WeatherWatch notifications enabled',
      body: 'Desktop alerts are ready. Keep WeatherWatch open so it can monitor radar and lightning.',
    })
    expect(notifications.feedback.value).toBe('Test notification sent. Desktop alerts are ready.')
  })

  it('explains how to recover when browser permission is blocked', async () => {
    class NotificationSpy {
      static permission: NotificationPermission = 'denied'
      static requestPermission = vi.fn()
    }
    vi.stubGlobal('Notification', NotificationSpy)
    const notifications = useNotifications()

    await notifications.requestPermission()

    expect(NotificationSpy.requestPermission).not.toHaveBeenCalled()
    expect(notifications.feedback.value).toContain('site’s browser settings')
  })

  it('sends radar retrieval failures as desktop notifications', () => {
    const created: Array<{ title: string; body?: string }> = []
    class NotificationSpy {
      static permission: NotificationPermission = 'granted'
      constructor(title: string, options?: NotificationOptions) {
        created.push({ title, body: options?.body })
      }
    }
    vi.stubGlobal('Notification', NotificationSpy)
    const notifications = useNotifications()

    notifications.sendRadarFailure('No recent radar frame could be loaded.')

    expect(created[0]).toEqual({
      title: 'WeatherWatch radar check failed',
      body: 'No recent radar frame could be loaded.',
    })
  })

  function stubAudio() {
    const created: AudioSpy[] = []
    class AudioSpy {
      play = vi.fn(() => Promise.resolve())
      pause = vi.fn()
      loop = false
      volume = 1
      currentTime = 0
      constructor(public src: string) {
        created.push(this)
      }
      addEventListener(_type: string, _listener: () => void) {}
    }
    vi.stubGlobal('Audio', AudioSpy)
    return created
  }

  const rainEvent = {
    id: 'event',
    areaId: 'home',
    areaName: 'Home',
    reason: 'entry' as const,
    timestamp: '2026072320150000',
    intensity: 'heavy' as const,
    pixelCount: 24,
    source: 'live' as const,
  }

  it('loops the rain tone until it is acknowledged', async () => {
    const audio = stubAudio()
    const notifications = useNotifications(ref(true))

    notifications.send(rainEvent)
    await Promise.resolve()
    expect(audio).toHaveLength(1)
    expect(audio[0]?.src).toContain('rain-alert')
    expect(audio[0]?.loop).toBe(true)
    expect(notifications.playing.rain).toBe(true)
    expect(notifications.sounding.rain?.title).toBe('Home')

    notifications.stopTone('rain')
    expect(audio[0]?.pause).toHaveBeenCalledOnce()
    expect(notifications.playing.rain).toBe(false)
    expect(notifications.sounding.rain).toBeNull()
  })

  it('plays the lightning tone once and loops the discrepancy tone', async () => {
    const audio = stubAudio()
    const notifications = useNotifications(ref(true))

    notifications.sendLive('Home', 'Ground strike 2 km away', 'tag', '#/live', true)
    notifications.sendDiscrepancy('Discrepancy · Bedok', 'Radar shows a storm', 'tag', '#/live')
    await Promise.resolve()
    expect(audio.map((a) => [a.src.includes('lightning') ? 'lightning' : 'discrepancy', a.loop])).toEqual([
      ['lightning', false],
      ['discrepancy', true],
    ])
    expect(notifications.sounding.lightning).toBeNull()
    expect(notifications.sounding.discrepancy?.title).toBe('Discrepancy · Bedok')
  })

  it('stays silent when alert sounds are off', () => {
    const audio = stubAudio()
    const notifications = useNotifications(ref(false))
    notifications.send(rainEvent)
    expect(audio).toHaveLength(0)
    expect(notifications.sounding.rain).toBeNull()
  })

  it('previews a tone once at the selected volume', async () => {
    const audio = stubAudio()
    const notifications = useNotifications(ref(true), ref(35))

    notifications.previewTone('lightning')
    await Promise.resolve()
    expect(audio[0]?.loop).toBe(false)
    expect(audio[0]?.volume).toBe(0.35)
    expect(notifications.playing.lightning).toBe(true)
  })
})
