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

  it('plays the bundled sound when sound alerts are enabled', () => {
    const play = vi.fn(() => Promise.resolve())
    const pause = vi.fn()
    class AudioSpy {
      play = play
      pause = pause
      loop = false
      volume = 1
      currentTime = 0
      constructor(_url: string) {}
      addEventListener(_type: string, _listener: () => void) {}
    }
    vi.stubGlobal('Audio', AudioSpy)
    const notifications = useNotifications(ref(true))

    notifications.send({
      id: 'event',
      areaId: 'home',
      areaName: 'Home',
      reason: 'entry',
      timestamp: '2026072320150000',
      intensity: 'heavy',
      pixelCount: 24,
      source: 'live',
    })

    expect(play).toHaveBeenCalledOnce()
  })

  it('previews at the selected volume and can stop an active alert', async () => {
    const play = vi.fn(() => Promise.resolve())
    const pause = vi.fn()
    class AudioSpy {
      static latest: AudioSpy | undefined
      play = play
      pause = pause
      loop = false
      volume = 1
      currentTime = 0
      constructor(_url: string) {
        AudioSpy.latest = this
      }
      addEventListener(_type: string, _listener: () => void) {}
    }
    vi.stubGlobal('Audio', AudioSpy)
    const notifications = useNotifications(ref(true), ref(35))

    notifications.previewAlertSound()
    await Promise.resolve()
    expect(AudioSpy.latest?.loop).toBe(false)
    expect(AudioSpy.latest?.volume).toBe(0.35)
    expect(notifications.alertPlaying.value).toBe(true)

    notifications.stopAlertSound()
    expect(pause).toHaveBeenCalledOnce()
    expect(notifications.alertPlaying.value).toBe(false)
  })
})
