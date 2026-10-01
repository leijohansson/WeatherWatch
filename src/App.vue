<script setup lang="ts">
import { computed, nextTick, ref, toRef, watch } from 'vue'
import ModeTabs from '@/components/ModeTabs.vue'
import StatusPill from '@/components/StatusPill.vue'
import { useLightningFeed } from '@/composables/useLightningFeed'
import { useLiveAlerts } from '@/composables/useLiveAlerts'
import { useNotifications } from '@/composables/useNotifications'
import { useNow } from '@/composables/useNow'
import { usePersistence } from '@/composables/usePersistence'
import { useRadarMonitor } from '@/composables/useRadarMonitor'
import { routeHash, useRoute, type Mode } from '@/composables/useRoute'
import LiveView from '@/views/LiveView.vue'
import WatchView from '@/views/WatchView.vue'
import type { AlertEvent } from '@/types'

const state = usePersistence()
const notifications = useNotifications(toRef(state, 'soundAlerts'), toRef(state, 'soundVolume'))
const { route, navigate } = useRoute()
const now = useNow()

// Alerts only notify and sound on the page they belong to: rain on Watch, lightning and
// discrepancy on Live. Rain events still go into Watch's history while Live is open.
function addEvents(events: AlertEvent[]) {
  if (route.value.mode === 'watch' && state.alertTypes.rain) {
    for (const event of events) notifications.send(event)
  }
  state.history.unshift(...events)
  state.history = state.history.slice(0, 50)
}

const monitor = useRadarMonitor({
  areas: toRef(state, 'areas'),
  monitoring: toRef(state, 'monitoring'),
  liveState: state.alertState,
  addEvents,
  notifyFailure: notifications.sendRadarFailure,
})

// Set after the first batch of strikes has settled, so a storm already under way on page load
// doesn't send ring notifications.
const feedReady = ref(false)

// Strikes keep coming in while on Watch so Live's ring alerts and the tab's dot stay current.
const feed = useLightningFeed({
  enabled: computed(() => state.monitoring || route.value.mode === 'live'),
  onUpdate: () => {
    if (!feedReady.value) void nextTick(() => (feedReady.value = true))
  },
})

const liveAlerts = useLiveAlerts({
  locations: toRef(state, 'liveLocations'),
  strikes: feed.strikes,
  now,
  settings: toRef(state, 'live'),
  testMode: feed.testMode,
  ready: feedReady,
  notify: (...args) => {
    if (route.value.mode === 'live' && state.alertTypes.lightning) notifications.sendLive(...args)
  },
})

function selectMode(mode: Mode) {
  navigate(routeHash(mode))
}

// Leaving test mode from Watch also ends Live's test storm, so the two never disagree.
watch(monitor.testMode, (testing) => {
  if (!testing && feed.testMode.value) void feed.leaveFixture()
})

// Each mode starts at the top, and the page being left stops sounding its alerts.
watch(
  () => route.value.mode,
  (mode) => {
    window.scrollTo?.({ top: 0 })
    if (mode === 'live') notifications.stopTone('rain')
    else {
      notifications.stopTone('lightning')
      notifications.stopTone('discrepancy')
    }
  },
)
</script>

<template>
  <div class="app-shell" :class="`mode-${route.mode}`">
    <header class="topbar">
      <a class="brand" href="#/watch" aria-label="WeatherWatch home">
        <span class="brand-mark" aria-hidden="true">◒</span>
        <span>WEATHERWATCH<small>SINGAPORE</small></span>
      </a>
      <ModeTabs :mode="route.mode" :strikes-in-ring="liveAlerts.anyActive.value" @select="selectMode" />
      <div class="header-actions">
        <StatusPill
          :status="route.mode === 'live' ? feed.status.value : monitor.status.value"
          :test-mode="route.mode === 'live' ? feed.testMode.value || monitor.testMode.value : monitor.testMode.value"
          :subject="route.mode === 'live' ? 'lightning' : 'radar'"
        />
        <div class="notification-control">
          <button class="notification-button" type="button" @click="notifications.requestPermission">
            <span aria-hidden="true">♢</span>
            {{ notifications.permissionLabel.value }}
          </button>
          <small
            v-if="notifications.feedback.value"
            class="notification-feedback"
            role="status"
          >
            {{ notifications.feedback.value }}
          </small>
        </div>
      </div>
    </header>

    <main>
      <LiveView
        v-if="route.mode === 'live'"
        :state="state"
        :monitor="monitor"
        :feed="feed"
        :ring-states="liveAlerts.ringStates.value"
        :now="now"
        :route="route"
        :notifications="notifications"
        @navigate="navigate"
      />
      <WatchView
        v-else
        :state="state"
        :monitor="monitor"
        :notifications="notifications"
      />
    </main>

    <footer>
      <span>WeatherWatch stores everything in this browser.</span>
      <span>Radar imagery: weather.gov.sg · Lightning: data.gov.sg</span>
    </footer>
  </div>
</template>
