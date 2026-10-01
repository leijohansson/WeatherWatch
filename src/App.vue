<script setup lang="ts">
import { computed, nextTick, reactive, ref, toRef } from 'vue'
import ModeTabs from '@/components/ModeTabs.vue'
import StatusPill from '@/components/StatusPill.vue'
import { useLightningFeed } from '@/composables/useLightningFeed'
import { useLiveAlerts } from '@/composables/useLiveAlerts'
import { useNotifications } from '@/composables/useNotifications'
import { useNow } from '@/composables/useNow'
import { usePersistence } from '@/composables/usePersistence'
import { useRadarMonitor } from '@/composables/useRadarMonitor'
import { routeHash, useRoute, type Mode } from '@/composables/useRoute'
import { evaluateAreaLightning, readAreaLightning, type AreaLightningReading } from '@/lib/lightning'
import LiveView from '@/views/LiveView.vue'
import WatchView from '@/views/WatchView.vue'
import type { AlertEvent, Strike } from '@/types'

const state = usePersistence()
const notifications = useNotifications(toRef(state, 'soundAlerts'), toRef(state, 'soundVolume'))
const { route, navigate } = useRoute()
const now = useNow()

function addEvents(events: AlertEvent[]) {
  for (const event of events) notifications.send(event)
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

// Test-mode lightning state stays in memory so a demo storm never touches live alert state.
const testLightningState = reactive<Record<string, boolean>>({})
const feedReady = ref(false)

function onLightningUpdate(strikes: Strike[], source: 'live' | 'test') {
  const previous = source === 'live' ? state.lightningState : testLightningState
  const { next, events } = evaluateAreaLightning(
    state.areas,
    strikes,
    Date.now(),
    state.live.allClearMinutes,
    previous,
    source,
  )
  for (const key of Object.keys(previous)) delete previous[key]
  Object.assign(previous, next)
  if (events.length) addEvents(events)
  if (!feedReady.value) void nextTick(() => (feedReady.value = true))
}

const feed = useLightningFeed({
  enabled: computed(() => state.monitoring || route.value.mode === 'live'),
  onUpdate: onLightningUpdate,
})

const liveAlerts = useLiveAlerts({
  locations: toRef(state, 'liveLocations'),
  strikes: feed.strikes,
  now,
  settings: toRef(state, 'live'),
  testMode: feed.testMode,
  ready: feedReady,
  notify: notifications.sendLive,
})

const lightningReadings = computed(() => {
  const readings: Record<string, AreaLightningReading> = {}
  for (const area of state.areas) {
    if (!area.lightningEnabled) continue
    readings[area.id] = readAreaLightning(area, feed.strikes.value, now.value, state.live.allClearMinutes)
  }
  return readings
})

function selectMode(mode: Mode) {
  navigate(routeHash(mode))
}
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
          :test-mode="feed.testMode.value || (route.mode === 'watch' && monitor.testMode.value)"
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
        @navigate="navigate"
      />
      <WatchView
        v-else
        :state="state"
        :monitor="monitor"
        :notifications="notifications"
        :feed="feed"
        :lightning-readings="lightningReadings"
        :now="now"
      />
    </main>

    <footer>
      <span>WeatherWatch stores everything in this browser.</span>
      <span>Radar imagery: weather.gov.sg · Lightning: data.gov.sg</span>
    </footer>
  </div>
</template>
