import { computed, ref, type Ref } from 'vue'
import alertSoundUrl from '../../assets/alert.wav'
import { INTENSITY_LABELS } from '@/lib/palette'
import type { AlertEvent } from '@/types'

export function useNotifications(soundAlerts?: Ref<boolean>, soundVolume?: Ref<number>) {
  const supported = typeof window !== 'undefined' && 'Notification' in window
  const permission = ref<NotificationPermission>(
    supported ? Notification.permission : 'denied',
  )
  const feedback = ref<string | null>(null)
  const alertPlaying = ref(false)
  let alertAudio: HTMLAudioElement | null = null
  let audioRequest = 0

  const permissionLabel = computed(() => {
    if (!supported) return 'Not supported'
    if (permission.value === 'granted') return 'Desktop notifications on'
    if (permission.value === 'denied') return 'Desktop notifications blocked'
    return 'Enable desktop notifications'
  })

  function show(title: string, options: NotificationOptions) {
    if (!supported || permission.value !== 'granted') return false
    try {
      new Notification(title, options)
      return true
    } catch {
      return false
    }
  }

  function getAlertAudio() {
    if (typeof Audio === 'undefined') return null
    if (alertAudio) return alertAudio
    alertAudio = new Audio(alertSoundUrl)
    alertAudio.addEventListener('ended', () => {
      alertPlaying.value = false
    })
    return alertAudio
  }

  function setAlertVolume(audio: HTMLAudioElement) {
    audio.volume = Math.max(0, Math.min(100, soundVolume?.value ?? 70)) / 100
  }

  function startAudio(loop: boolean) {
    const audio = getAlertAudio()
    if (!audio) return
    const request = ++audioRequest
    audio.loop = loop
    setAlertVolume(audio)
    audio.currentTime = 0
    void audio.play().then(() => {
      if (request === audioRequest) alertPlaying.value = true
    }).catch(() => {
      if (request === audioRequest) alertPlaying.value = false
    })
  }

  function playAlertSound() {
    if (soundAlerts?.value) startAudio(true)
  }

  function previewAlertSound() {
    startAudio(false)
  }

  function stopAlertSound() {
    if (!alertAudio) return
    audioRequest += 1
    alertAudio.pause()
    alertAudio.currentTime = 0
    alertPlaying.value = false
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

    const sent = show('Rainwatch notifications enabled', {
      body: 'Desktop alerts are ready. Keep Rainwatch open so it can monitor the radar.',
      tag: 'rainwatch-notifications-ready',
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
    const threshold = event.thresholdIntensity ?? event.intensity
    const intensityDetail =
      threshold === event.intensity
        ? `${INTENSITY_LABELS[threshold]} threshold met`
        : `${INTENSITY_LABELS[threshold]} threshold met · peak ${INTENSITY_LABELS[event.intensity]}`
    show(`${prefix}${event.areaName}`, {
      body: `${reason} · ${intensityDetail} · ${event.pixelCount} qualifying pixels`,
      tag: `${event.source}-${event.areaId}-${event.reason}`,
    })
    playAlertSound()
  }

  function sendRadarFailure(message: string) {
    show('Rainwatch radar check failed', {
      body: message,
      tag: 'rainwatch-radar-failure',
    })
  }

  return {
    supported,
    permission,
    permissionLabel,
    feedback,
    alertPlaying,
    requestPermission,
    send,
    sendRadarFailure,
    previewAlertSound,
    stopAlertSound,
  }
}
