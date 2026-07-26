<script setup lang="ts">
import { computed, ref, toRef } from 'vue'
import AlertHistory from '@/components/AlertHistory.vue'
import AreaEditor from '@/components/AreaEditor.vue'
import RadarMap from '@/components/RadarMap.vue'
import StatusPill from '@/components/StatusPill.vue'
import { useNotifications } from '@/composables/useNotifications'
import { usePersistence } from '@/composables/usePersistence'
import { useRadarMonitor } from '@/composables/useRadarMonitor'
import type { AlertArea, AlertEvent, Point } from '@/types'

const state = usePersistence()
const notifications = useNotifications()
const selectedId = ref<string | null>(state.areas[0]?.id ?? null)
const drawing = ref(false)
const draft = ref<Point[]>([])

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

const selectedArea = computed(
  () => state.areas.find((area) => area.id === selectedId.value) ?? null,
)
const rainyAreaIds = computed(
  () =>
    new Set(
      Object.entries(monitor.visibleState.value)
        .filter(([, areaState]) => areaState.rainy)
        .map(([id]) => id),
    ),
)

function startDrawing() {
  drawing.value = true
  draft.value = []
  selectedId.value = null
}

function finishDrawing() {
  if (draft.value.length < 3) return
  const area: AlertArea = {
    id: crypto.randomUUID(),
    name: `Alert area ${state.areas.length + 1}`,
    color: ['#ffb454', '#62d9c7', '#ff748c', '#a99cff'][state.areas.length % 4] ?? '#ffb454',
    enabled: true,
    vertices: [...draft.value],
    intensityThreshold: 'moderate',
    pixelThreshold: 20,
    notifyNewCell: true,
  }
  state.areas.push(area)
  monitor.reanalyzeArea(area.id)
  selectedId.value = area.id
  draft.value = []
  drawing.value = false
}

function cancelDrawing() {
  draft.value = []
  drawing.value = false
  selectedId.value = state.areas[0]?.id ?? null
}

function deleteSelected() {
  if (!selectedArea.value) return
  const index = state.areas.findIndex((area) => area.id === selectedArea.value?.id)
  if (index < 0) return
  state.areas.splice(index, 1)
  selectedId.value = state.areas[Math.min(index, state.areas.length - 1)]?.id ?? null
}

function moveVertex(areaId: string, index: number, point: Point) {
  const area = state.areas.find((candidate) => candidate.id === areaId)
  if (area?.vertices[index]) area.vertices[index] = point
}

function formatTimestamp(timestamp: string | null) {
  if (!timestamp) return 'Waiting for first frame'
  const compact = timestamp.replace(/\D/g, '')
  const date = new Date(
    `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}T${compact.slice(8, 10)}:${compact.slice(10, 12)}:00+08:00`,
  )
  return new Intl.DateTimeFormat('en-SG', {
    timeZone: 'Asia/Singapore',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <a class="brand" href="#" aria-label="Rainwatch home">
        <span class="brand-mark" aria-hidden="true">◒</span>
        <span>RAINWATCH<small>SINGAPORE</small></span>
      </a>
      <div class="header-actions">
        <StatusPill :status="monitor.status.value" :test-mode="monitor.testMode.value" />
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
      <section class="hero-copy">
        <div>
          <p class="eyebrow">Hyperlocal rain alerts</p>
          <h1>Watch the weather<br /><em>where it matters.</em></h1>
        </div>
        <p class="intro">
          Draw the places you care about. Rainwatch checks Singapore's radar every 15 minutes
          and lets you know when rain arrives.
        </p>
      </section>

      <div class="workspace">
        <section class="map-panel">
          <div class="map-toolbar">
            <div>
              <span class="toolbar-label">RADAR · 240 KM</span>
              <strong>{{ formatTimestamp(monitor.visibleTimestamp.value) }}</strong>
            </div>
            <label>
              Overlay
              <input
                v-model.number="state.overlayOpacity"
                type="range"
                min="0"
                max="1"
                step="0.05"
                aria-label="Radar overlay opacity"
              />
            </label>
          </div>

          <RadarMap
            :areas="state.areas"
            :selected-id="selectedId"
            :drawing="drawing"
            :draft="draft"
            :overlay-url="monitor.visibleOverlay.value"
            :overlay-opacity="state.overlayOpacity"
            :rainy-area-ids="rainyAreaIds"
            @select="selectedId = $event"
            @map-click="draft.push($event)"
            @move-vertex="moveVertex"
            @move-vertex-end="monitor.reanalyzeArea($event)"
          />

          <div class="legend-row">
            <div class="legend">
              <span>LIGHT</span>
              <i class="legend-gradient" />
              <span>INTENSE</span>
            </div>
            <span>Singapore time · Updates every 15 min</span>
          </div>
        </section>

        <aside class="control-panel">
          <section>
            <header class="section-heading">
              <div>
                <p class="eyebrow">Your places</p>
                <h2>Alert areas</h2>
              </div>
              <button v-if="!drawing" class="add-button" type="button" @click="startDrawing">
                + Draw area
              </button>
            </header>

            <div v-if="drawing" class="drawing-card">
              <span class="step-number">01</span>
              <h3>Mark your area</h3>
              <p>Click at least three points on the map to make a shape.</p>
              <strong>{{ draft.length }} corners placed</strong>
              <div class="button-row">
                <button class="secondary-button" type="button" @click="cancelDrawing">Cancel</button>
                <button
                  class="primary-button"
                  type="button"
                  :disabled="draft.length < 3"
                  @click="finishDrawing"
                >
                  Save shape
                </button>
              </div>
            </div>

            <template v-else>
              <div class="area-tabs" role="list" aria-label="Alert areas">
                <button
                  v-for="area in state.areas"
                  :key="area.id"
                  type="button"
                  :class="{ active: selectedId === area.id }"
                  @click="selectedId = area.id"
                >
                  <i :style="{ background: area.color }" />
                  <span>{{ area.name }}</span>
                  <small v-if="rainyAreaIds.has(area.id)">RAIN</small>
                </button>
              </div>
              <AreaEditor
                v-if="selectedArea"
                :area="selectedArea"
                :reading="monitor.visibleReadings.value[selectedArea.id]"
                @change="monitor.reanalyzeArea(selectedArea.id)"
                @delete="deleteSelected"
              />
              <div v-else class="empty-areas">
                <p>No alert areas yet.</p>
                <button class="primary-button" type="button" @click="startDrawing">
                  Draw your first area
                </button>
              </div>
            </template>
          </section>

          <section class="monitor-card">
            <div class="monitor-heading">
              <span class="pulse-dot" :class="{ active: state.monitoring }" />
              <div>
                <strong>Automatic monitoring</strong>
                <small>Checks one minute after each quarter hour</small>
              </div>
              <input v-model="state.monitoring" type="checkbox" aria-label="Automatic monitoring" />
            </div>
            <p v-if="monitor.lastError.value" class="status-message">
              {{ monitor.lastError.value }}
            </p>
            <button
              class="check-button"
              type="button"
              :disabled="monitor.status.value === 'checking'"
              @click="monitor.poll"
            >
              Check for radar now
            </button>
          </section>

          <section class="test-card" :class="{ active: monitor.testMode.value }">
            <header>
              <div>
                <p class="eyebrow">Demonstration</p>
                <h3>Test your alerts</h3>
              </div>
              <button
                v-if="monitor.testMode.value"
                class="text-button"
                type="button"
                @click="monitor.leaveTestMode"
              >
                Exit test
              </button>
            </header>
            <p>Try the bundled radar without affecting live rain state.</p>
            <div class="button-row">
              <button class="secondary-button" type="button" @click="monitor.useClearFrame">
                Clear frame
              </button>
              <button class="primary-button" type="button" @click="monitor.useSampleFrame">
                Sample frame
              </button>
            </div>
          </section>

          <AlertHistory :events="state.history" @clear="state.history = []" />
        </aside>
      </div>
    </main>

    <footer>
      <span>Rainwatch stores everything in this browser.</span>
      <span>Radar imagery: weather.gov.sg</span>
    </footer>
  </div>
</template>
