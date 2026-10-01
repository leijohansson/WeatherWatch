import { computed, watch, type Ref } from 'vue'
import { liveHref } from '@/lib/alertText'
import { formatKm, latestStrikeInRing, ringState, STRIKE_TYPE_LABELS } from '@/lib/lightning'
import type { LiveLocation, LiveSettings, RingState, Strike } from '@/types'

interface LiveAlertOptions {
  locations: Ref<LiveLocation[]>
  strikes: Ref<Strike[]>
  now: Ref<number>
  settings: Ref<LiveSettings>
  testMode: Ref<boolean>
  /** Set once the feed has delivered its first batch, so existing storms don't notify on page load. */
  ready: Ref<boolean>
  notify: (title: string, body: string, tag: string, href: string) => void
}

/** Ring state per Live location, with a notification when a strike lands inside a ring. */
export function useLiveAlerts(options: LiveAlertOptions) {
  const ringStates = computed<Record<string, RingState>>(() => {
    const states: Record<string, RingState> = {}
    for (const location of options.locations.value) {
      states[location.id] = ringState(
        location,
        options.strikes.value,
        options.now.value,
        options.settings.value.allClearMinutes,
      )
    }
    return states
  })

  const anyActive = computed(() => Object.values(ringStates.value).includes('active'))

  watch(ringStates, (next, previous) => {
    if (!options.ready.value || !previous) return
    const prefix = options.testMode.value ? 'Test · ' : ''
    for (const location of options.locations.value) {
      const before = previous[location.id]
      const after = next[location.id]
      if (!before || before === after) continue
      if (after !== 'active' || !location.notifyStrike) continue
      const latest = latestStrikeInRing(location, options.strikes.value)
      const detail = latest
        ? `${STRIKE_TYPE_LABELS[latest.strike.type]} strike ${formatKm(latest.distanceKm)} away, inside the ${location.radiusKm} km ring`
        : `Strike inside the ${location.radiusKm} km ring`
      options.notify(`${prefix}${location.name}`, detail, `live-${location.id}-strike`, liveHref(location.id))
    }
  })

  return { ringStates, anyActive }
}
