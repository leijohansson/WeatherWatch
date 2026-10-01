import { computed, reactive, ref, type Ref } from 'vue'
import discrepancyToneUrl from '../../assets/discrepancy-alert.mp3'
import lightningToneUrl from '../../assets/lightning-alert.mp3'
import rainToneUrl from '../../assets/rain-alert.mp3'
import { rainDetail } from '@/lib/alertText'
import type { AlertEvent, AlertKind } from '@/types'

/** Rain and discrepancy tones repeat until acknowledged; lightning plays once. */
const TONES: Record<AlertKind, { url: string; loop: boolean }> = {
  rain: { url: rainToneUrl, loop: true },
  lightning: { url: lightningToneUrl, loop: false },
  discrepancy: { url: discrepancyToneUrl, loop: true },
}

export interface SoundingAlert {
  title: string
  body: string
}

export function useNotifications(soundAlerts?: Ref<boolean>, soundVolume?: Ref<number>) {
  const supported = typeof window !== 'undefined' && 'Notification' in window
  const permission = ref<NotificationPermission>(
    supported ? Notification.permission : 'denied',
  )
  const feedback = ref<string | null>(null)
  /** Which tones are playing now. */
  const playing = reactive<Record<AlertKind, boolean>>({ rain: false, lightning: false, discrepancy: false })
  /** The alert behind each looping tone, for the acknowledge banner. */
  const sounding = reactive<Record<AlertKind, SoundingAlert | null>>({
    rain: null,
    lightning: null,
    discrepancy: null,
  })
  const audio: Partial<Record<AlertKind, HTMLAudioElement>> = {}
  const requests: Record<AlertKind, number> = { rain: 0, lightning: 0, discrepancy: 0 }

  const permissionLabel = computed(() => {
    if (!supported) return 'Not supported'
    if (permission.value === 'granted') return 'Desktop notifications on'
    if (permission.value === 'denied') return 'Desktop notifications blocked'
    return 'Enable desktop notifications'
  })

  function show(title: string, options: NotificationOptions, href?: string) {
    if (!supported || permission.value !== 'granted') return false
    try {
      const notification = new Notification(title, options)
      if (href) {
        notification.onclick = () => {
          window.focus()
          window.location.hash = href
          notification.close?.()
        }
      }
      return true
    } catch {
      return false
    }
  }

  function toneAudio(kind: AlertKind) {
    if (typeof Audio === 'undefined') return null
    const existing = audio[kind]
    if (existing) return existing
    const created = new Audio(TONES[kind].url)
    created.addEventListener('ended', () => {
      playing[kind] = false
      sounding[kind] = null
    })
    audio[kind] = created
    return created
  }

  function startTone(kind: AlertKind, loop: boolean) {
    const element = toneAudio(kind)
    if (!element) return
    const request = ++requests[kind]
    element.loop = loop
    element.volume = Math.max(0, Math.min(100, soundVolume?.value ?? 70)) / 100
    element.currentTime = 0
    void element.play().then(() => {
      if (request === requests[kind]) playing[kind] = true
    }).catch(() => {
      if (request === requests[kind]) playing[kind] = false
    })
  }

  /** Plays an alert's tone when sounds are on; looping tones remember the alert for acknowledging. */
  function playTone(kind: AlertKind, alert: SoundingAlert) {
    if (!soundAlerts?.value) return
    if (TONES[kind].loop) sounding[kind] = alert
    startTone(kind, TONES[kind].loop)
  }

  function previewTone(kind: AlertKind) {
    startTone(kind, false)
  }

  /** Stops a tone; for looping tones this is the acknowledgement. */
  function stopTone(kind: AlertKind) {
    sounding[kind] = null
    const element = audio[kind]
    if (!element) return
    requests[kind] += 1
    element.pause()
    element.currentTime = 0
    playing[kind] = false
  }

  async function requestPermission() {
    if (!supported) {
      feedback.value = 'Desktop notifications are not supported by this browser.'
      return
    }
    if (window.isSecureContext === false) {
      feedback.value = 'Desktop notifications require HTTPS or localhost.'
      return
    }

    permission.value = Notification.permission
    if (permission.value === 'denied') {
      feedback.value =
        'Notifications are blocked. Allow them in this site’s browser settings, then try again.'
      return
    }

    feedback.value = 'Requesting desktop notification permission…'
    try {
      if (permission.value !== 'granted') {
        permission.value = await Notification.requestPermission()
      }
    } catch {
      feedback.value = 'The browser could not request desktop notification permission.'
      return
    }

    if (permission.value !== 'granted') {
      feedback.value = 'Permission was not granted. Click again when you are ready to allow it.'
      return
    }

    const sent = show('WeatherWatch notifications enabled', {
      body: 'Desktop alerts are ready. Keep WeatherWatch open so it can monitor radar and lightning.',
      tag: 'weatherwatch-notifications-ready',
    })
    feedback.value = sent
      ? 'Test notification sent. Desktop alerts are ready.'
      : 'Permission is enabled, but the browser could not display the test notification.'
  }

  function send(event: AlertEvent) {
    const prefix = event.source === 'test' ? 'Test · ' : ''
    const reason = {
      entry: 'Rain entered your area',
      escalation: 'Rain intensity increased',
      'new-cell': 'A new rain cell appeared',
    }[event.reason]
    const title = `${prefix}${event.areaName}`
    const body = `${reason} · ${rainDetail(event, 'threshold met')} · ${event.pixelCount} qualifying pixels`
    show(title, { body, tag: `${event.source}-${event.areaId}-${event.reason}` })
    playTone('rain', { title, body })
  }

  /** A strike inside a Live location's ring, with the lightning tone. */
  function sendLive(title: string, body: string, tag: string, href: string) {
    show(title, { body, tag }, href)
    playTone('lightning', { title, body })
  }

  /** A sector has become Discrepancy; its tone repeats until acknowledged. */
  function sendDiscrepancy(title: string, body: string, tag: string, href: string) {
    show(title, { body, tag }, href)
    playTone('discrepancy', { title, body })
  }

  function sendRadarFailure(message: string) {
    show('WeatherWatch radar check failed', {
      body: message,
      tag: 'weatherwatch-radar-failure',
    })
  }

  return {
    supported,
    permission,
    permissionLabel,
    feedback,
    playing,
    sounding,
    requestPermission,
    send,
    sendLive,
    sendDiscrepancy,
    sendRadarFailure,
    previewTone,
    stopTone,
  }
}
