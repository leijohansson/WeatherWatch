<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import AlertBanner from '@/components/AlertBanner.vue'
import ForecastSettingsPanel from '@/components/ForecastSettings.vue'
import LayersPanel from '@/components/LayersPanel.vue'
import LiveAlertSettings from '@/components/LiveAlertSettings.vue'
import LiveMap, { type MapSector } from '@/components/LiveMap.vue'
import LocationEditor from '@/components/LocationEditor.vue'
import LocationStatus from '@/components/LocationStatus.vue'
import StrikeColorBar from '@/components/StrikeColorBar.vue'
import { useGeoLayers } from '@/composables/useGeoLayers'
import type { useLightningFeed } from '@/composables/useLightningFeed'
import type { useNotifications } from '@/composables/useNotifications'
import { useOfficialForecast } from '@/composables/useOfficialForecast'
import { defaultLiveSettings, newLiveLocation, type AppState } from '@/composables/usePersistence'
import type { useRadarMonitor } from '@/composables/useRadarMonitor'
import { routeHash, type Route } from '@/composables/useRoute'
import { formatClock } from '@/lib/alertText'
import {
  catExpectsLightning,
  classifySectors,
  findRadarClusters,
  forecastExpectsLightning,
  SECTOR_CLASS_COLORS,
  SECTOR_CLASS_LABELS,
  sectorCounts,
  type SectorClass,
} from '@/lib/forecast'
import { centroid, LAT0, LON0 } from '@/lib/geo'
import { formatAgo, formatKm, latestStrikeInRing, STRIKE_TYPE_LABELS, strikeAgeMinutes } from '@/lib/lightning'
import { featurePolygons, labelAnchorKm, outerRings, pathKm } from '@/lib/mapGeometry'
import type { ForecastSettings, LatLon, LiveLocation, RingState, SectorSet } from '@/types'

const props = defineProps<{
  state: AppState
  monitor: ReturnType<typeof useRadarMonitor>
  feed: ReturnType<typeof useLightningFeed>
  ringStates: Record<string, RingState>
  now: number
  route: Route
  notifications: ReturnType<typeof useNotifications>
}>()
const emit = defineEmits<{ navigate: [hash: string] }>()

const layers = computed(() => props.state.live.layers)

// ---- Panels -------------------------------------------------------------------------------

type Panel = 'status' | 'setup' | 'place' | 'edit' | 'forecast'
const panel = ref<Panel>('status')
const layersOpen = ref(false)
const selectedId = ref<string | null>(null)

// ---- Location setup -----------------------------------------------------------------------

const draft = ref<LiveLocation | null>(null)
const draftIsNew = ref(false)
// Where setup was opened from, to return there when it's done.
const setupOrigin = ref<Panel>('setup')

function editLocation(location: LiveLocation) {
  draft.value = { ...location }
  draftIsNew.value = false
  setupOrigin.value = 'setup'
  selectedId.value = location.id
  panel.value = 'edit'
}

/** Like drawing an area in Watch: place the pin on the map first, then set the ring up. */
function addLocation() {
  draft.value = null
  draftIsNew.value = true
  setupOrigin.value = panel.value === 'status' ? 'status' : 'setup'
  layersOpen.value = false
  panel.value = 'place'
}

function onMapClick(position: LatLon) {
  if (panel.value === 'place' && !draft.value) {
    draft.value = newLiveLocation({ name: `Location ${props.state.liveLocations.length + 1}` })
    selectedId.value = draft.value.id
  }
  if (draft.value) moveDraft(draft.value.id, position)
}

function saveDraft() {
  if (!draft.value) return
  const index = props.state.liveLocations.findIndex((l) => l.id === draft.value?.id)
  if (index >= 0) props.state.liveLocations.splice(index, 1, { ...draft.value })
  else props.state.liveLocations.push({ ...draft.value })
  draft.value = null
  panel.value = setupOrigin.value
}

function deleteDraft() {
  const id = draft.value?.id
  props.state.liveLocations = props.state.liveLocations.filter((l) => l.id !== id)
  draft.value = null
  panel.value = setupOrigin.value
}

function cancelDraft() {
  draft.value = null
  panel.value = setupOrigin.value
}

function moveDraft(id: string, position: LatLon) {
  if (draft.value?.id !== id) return
  draft.value.lat = Number(position.lat.toFixed(4))
  draft.value.lon = Number(position.lon.toFixed(4))
}

const mapLocations = computed(() => {
  const editing = draft.value
  if (!editing) return props.state.liveLocations
  const others = props.state.liveLocations.filter((l) => l.id !== editing.id)
  return [...others, editing]
})

// ---- Focus and the deep-link chip ---------------------------------------------------------

const focusedLocation = computed(
  () => props.state.liveLocations.find((l) => l.id === props.route.focus) ?? null,
)

const mapCentre = computed<LatLon>(() => {
  if (focusedLocation.value) return focusedLocation.value
  return centroid(props.state.liveLocations) ?? { lat: LAT0, lon: LON0 }
})
const focusKey = computed(() => `${props.route.focus ?? ''}|${props.route.fromAlert}`)

/** Shown when a ring notification opened Live. */
const chip = computed(() => {
  const location = focusedLocation.value
  if (!props.route.fromAlert || !location) return null
  const inRing = latestStrikeInRing(location, props.feed.strikes.value)
  if (!inRing) return { time: null, text: `${location.name} · no strike inside the ring now` }
  return {
    time: formatClock(inRing.strike.time),
    text: `${STRIKE_TYPE_LABELS[inRing.strike.type]} strike ${formatKm(inRing.distanceKm)} from ${location.name}`,
  }
})

function dismissChip() {
  emit('navigate', props.route.focus ? routeHash('live', { focus: props.route.focus }) : routeHash('live'))
}

// ---- Sectors, clusters and the recommended forecast ---------------------------------------

const geo = useGeoLayers()
const official = useOfficialForecast()

function sectorGeometry(set: SectorSet) {
  const collection = set === 'army' ? geo.army.value : set === 'town' ? geo.townships.value : null
  return (collection?.features ?? []).map((feature) => {
    const polygons = featurePolygons(feature)
    return {
      id: feature.properties.id,
      name: feature.properties.name,
      forecastArea: feature.properties.forecastArea ?? feature.properties.name,
      path: pathKm(polygons),
      anchor: labelAnchorKm(polygons),
      rings: outerRings(polygons),
    }
  })
}

const townGeometry = computed(() => sectorGeometry('town'))
const armyGeometry = computed(() => sectorGeometry('army'))
const geometryFor = (set: SectorSet) =>
  set === 'army' ? armyGeometry.value : set === 'town' ? townGeometry.value : []

// Strike ages change every second; the forecast only needs refreshing every 30 seconds.
const classifyNow = computed(() => Math.floor(props.now / 30_000) * 30_000)

const clusters = computed(() => {
  const frame = props.monitor.visibleFrame.value
  return frame ? findRadarClusters(frame, props.state.live.forecast.radar) : []
})

// Past these ages the published status is too old to call a Discrepancy against.
const TWO_HOUR_MAX_AGE_MS = 2 * 60 * 60_000
const ARMY_CAT_MAX_AGE_MS = 30 * 60_000
const isFresh = (updated: number | null, maxAge: number) =>
  updated !== null && classifyNow.value - updated < maxAge
const twoHourFresh = computed(() => isFresh(official.twoHourUpdated.value, TWO_HOUR_MAX_AGE_MS))
const armyFresh = computed(() => isFresh(official.armyUpdated.value, ARMY_CAT_MAX_AGE_MS))

function classify(set: SectorSet, settings: ForecastSettings): Record<string, SectorClass> {
  const frame = props.monitor.visibleFrame.value
  const clusterSet =
    settings === props.state.live.forecast ? clusters.value : frame ? findRadarClusters(frame, settings.radar) : []
  const inputs = geometryFor(set).map((sector) => ({
    id: sector.id,
    rings: sector.rings,
    forecastLightning:
      set === 'town'
        ? twoHourFresh.value
          ? forecastExpectsLightning(official.twoHour.value?.byArea[sector.forecastArea])
          : null
        : armyFresh.value
          ? catExpectsLightning(official.armyCat.value?.[sector.name])
          : null,
  }))
  return classifySectors(inputs, clusterSet, props.feed.strikes.value, classifyNow.value, settings)
}

const forecastOn = computed(() => layers.value.sectors !== 'off' && layers.value.forecast)
const sectorClasses = computed(() =>
  forecastOn.value ? classify(layers.value.sectors, props.state.live.forecast) : {},
)

const mapSectors = computed<MapSector[]>(() =>
  geometryFor(layers.value.sectors).map((sector) => ({
    id: sector.id,
    name: sector.name,
    path: sector.path,
    anchor: sector.anchor,
    cls: sectorClasses.value[sector.id] ?? null,
    showLabel: layers.value.sectors === 'army',
  })),
)

const legendClasses: SectorClass[] = ['discrepancy', 'thunderstorm', 'clear']

// ---- Discrepancy alerts -------------------------------------------------------------------

const discrepancyIds = computed(() =>
  Object.entries(sectorClasses.value)
    .filter(([, cls]) => cls === 'discrepancy')
    .map(([id]) => id),
)
let knownDiscrepancies = new Set<string>()

// Picking another sector set or turning the forecast on resets the baseline without an alert:
// those are the user's own changes, not new weather.
watch([() => layers.value.sectors, forecastOn], () => {
  knownDiscrepancies = new Set(discrepancyIds.value)
})

watch(discrepancyIds, (ids) => {
  const fresh = ids.filter((id) => !knownDiscrepancies.has(id))
  knownDiscrepancies = new Set(ids)
  if (!fresh.length || !forecastOn.value || !props.state.alertTypes.discrepancy) return
  const names = geometryFor(layers.value.sectors)
    .filter((sector) => fresh.includes(sector.id))
    .map((sector) => sector.name)
  const shown = names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3}` : names.join(', ')
  const prefix = props.feed.testMode.value ? 'Test · ' : ''
  const official = layers.value.sectors === 'army' ? 'SafeGuardian has not issued CAT 1' : "the 2-hour forecast isn't thundery"
  props.notifications.sendDiscrepancy(
    `${prefix}Discrepancy · ${shown}`,
    `Radar or lightning shows a thunderstorm, but ${official}.`,
    'live-discrepancy',
    routeHash('live'),
  )
})

// ---- Forecast settings screen -------------------------------------------------------------

// Settings are plain JSON; structuredClone can't copy Vue's reactive proxies.
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const forecastDraft = reactive<ForecastSettings>(clone(defaultLiveSettings().forecast))

function openForecastSettings() {
  Object.assign(forecastDraft, clone(props.state.live.forecast))
  panel.value = 'forecast'
  layersOpen.value = false
}

function resetForecast() {
  Object.assign(forecastDraft, clone(defaultLiveSettings().forecast))
}

function saveForecast() {
  props.state.live.forecast = clone(forecastDraft)
  panel.value = 'status'
}

const forecastPreview = computed(() => {
  const set = layers.value.sectors === 'off' ? 'town' : layers.value.sectors
  const counts = sectorCounts(classify(set, clone(forecastDraft)))
  const name = set === 'army' ? 'Army Sectors' : 'Townships'
  return `${name}: ${counts.discrepancy} discrepancy · ${counts.thunderstorm} thunderstorm · ${counts.clear} clear`
})

// ---- Live data health ---------------------------------------------------------------------

/** One line per source that isn't delivering live information right now. */
const dataWarnings = computed(() => {
  const warnings: string[] = []
  const since = (time: number | null) => (time === null ? null : formatClock(time))
  const feed = props.feed
  if (!feed.testMode.value && (feed.status.value === 'error' || feed.status.value === 'offline')) {
    const last = since(feed.lastUpdated.value)
    warnings.push(
      last
        ? `Not getting live lightning. Strikes shown are as of ${last}.`
        : 'Not getting live lightning. No strikes have been received yet.',
    )
  }
  const monitor = props.monitor
  if (!monitor.testMode.value && (monitor.lastError.value || monitor.radarIsStale.value)) {
    const age = monitor.radarAgeMinutes.value
    warnings.push(
      age === null
        ? 'Not getting live radar. No radar image has been received yet.'
        : `Not getting live radar. The overlay and clusters are ${age} min old.`,
    )
  }
  if (forecastOn.value && layers.value.sectors === 'town' && (official.twoHourFailed.value || !twoHourFresh.value)) {
    const last = since(official.twoHourUpdated.value)
    warnings.push(
      twoHourFresh.value && last
        ? `Not getting the live 2-hour forecast. Discrepancy uses the forecast from ${last}.`
        : 'Not getting the live 2-hour forecast. Townships show Thunderstorm or Clear only.',
    )
  }
  if (forecastOn.value && layers.value.sectors === 'army') {
    const last = since(official.armyUpdated.value)
    if (!official.armyConfigured.value) {
      warnings.push('SafeGuardian isn\'t configured on this server. Army sectors show Thunderstorm or Clear only.')
    } else if (official.armyFailed.value || !armyFresh.value) {
      warnings.push(
        armyFresh.value && last
          ? `Not getting live SafeGuardian CAT status. Discrepancy uses the status from ${last}.`
          : 'Not getting live SafeGuardian CAT status. Army sectors show Thunderstorm or Clear only.',
      )
    }
  }
  return warnings
})

// ---- Test storm ---------------------------------------------------------------------------

/** Replays the recorded storm with matching radar, so strikes, overlay and clusters can be tried. */
function startTestStorm() {
  void props.feed.useFixture()
  void props.monitor.useStormFrame()
}

function exitTestStorm() {
  void props.feed.leaveFixture()
  props.monitor.leaveTestMode()
}

// ---- Toolbar ------------------------------------------------------------------------------

const toolbarTime = computed(() => {
  const newest = props.feed.newestStrikeTime.value
  const strike =
    newest === null
      ? 'no strikes in 30 min'
      : `newest strike ${formatAgo(strikeAgeMinutes({ time: newest }, props.now))}`
  return `${formatClock(props.now)} · ${strike}`
})

const layerSummary = computed(() => {
  const parts: string[] = []
  if (layers.value.sectors !== 'off')
    parts.push(`${layers.value.sectors === 'army' ? 'Army' : 'Towns'}${forecastOn.value ? ' + forecast' : ''}`)
  if (layers.value.cg || layers.value.cc) parts.push('Strikes')
  if (layers.value.rings) parts.push('Rings')
  if (layers.value.radarOpacity > 0) parts.push('Radar')
  return parts.join(' · ') || 'Base map only'
})

watch(
  () => props.route.focus,
  (focus) => {
    if (focusedLocation.value) selectedId.value = focus
  },
  { immediate: true },
)
</script>

<template>
  <AlertBanner
    v-if="notifications.sounding.discrepancy"
    label="DISCREPANCY ALERT"
    :alert="notifications.sounding.discrepancy"
    @acknowledge="notifications.stopTone('discrepancy')"
  />
  <div class="live-workspace">
    <section class="map-panel live-map-panel">
      <div class="map-toolbar">
        <div class="live-toolbar-left">
          <span class="toolbar-label">LIVE · LIGHTNING + RADAR</span>
          <strong>{{ toolbarTime }}</strong>
        </div>
        <div class="live-toolbar-right">
          <button v-if="feed.testMode.value" class="test-storm-badge" type="button" @click="exitTestStorm">
            TEST STORM · EXIT
          </button>
          <button v-else class="test-storm-button" type="button" @click="startTestStorm">Test storm</button>
          <span class="toolbar-note">STRIKES UPDATE EVERY 2 MIN</span>
        </div>
      </div>
      <ul v-if="dataWarnings.length" class="data-warnings" role="status">
        <li v-for="warning in dataWarnings" :key="warning">{{ warning }}</li>
      </ul>

      <LiveMap
        :locations="mapLocations"
        :ring-states="ringStates"
        :strikes="feed.strikes.value"
        :now="now"
        :layers="layers"
        :sectors="layers.sectors === 'off' ? [] : mapSectors"
        :clusters="clusters"
        :radar-url="monitor.visibleOverlay.value"
        :focus="mapCentre"
        :focus-key="focusKey"
        :selected-id="selectedId"
        :draggable-id="draft?.id ?? null"
        :placing="panel === 'place'"
        @select="selectedId = $event"
        @move="moveDraft"
        @map-click="onMapClick"
      >
        <div v-if="panel === 'place'" class="drawing-hint">
          {{ draft ? 'Drag the pin, or click again to move it' : 'Click the map to place the location' }}
        </div>
        <div class="map-top-left">
          <div class="mobile-layers">
            <button class="layers-button" type="button" @click="layersOpen = !layersOpen">Layers</button>
            <span class="layers-chip">{{ layerSummary }}</span>
          </div>
          <div v-if="chip" class="alert-chip" role="status">
            <div>
              <small>FROM ALERT{{ chip.time ? ` · ${chip.time}` : '' }}</small>
              <strong>{{ chip.text }}</strong>
            </div>
            <button type="button" class="chip-dismiss" aria-label="Dismiss" @click="dismissChip">✕</button>
          </div>
        </div>
        <LayersPanel
          :layers="layers"
          :collapsed="state.live.layersCollapsed"
          :class="{ open: layersOpen }"
          @forecast-settings="openForecastSettings"
          @close="layersOpen = false"
          @toggle-collapsed="state.live.layersCollapsed = !state.live.layersCollapsed"
        />
      </LiveMap>

      <div class="legend-row live-legend">
        <StrikeColorBar />
        <div class="ring-legend">
          <span><i class="ring-key clear" /> Clear</span>
          <span><i class="ring-key active" /> Strike inside</span>
        </div>
        <div v-if="forecastOn" class="sector-legend">
          <span v-for="cls in legendClasses" :key="cls">
            <i class="sector-key" :style="{ '--key': SECTOR_CLASS_COLORS[cls] }" />
            {{ SECTOR_CLASS_LABELS[cls] }}
          </span>
        </div>
      </div>
    </section>

    <aside class="control-panel live-panel" :class="`panel-${panel}`">
      <LocationStatus
        v-if="panel === 'status'"
        :locations="state.liveLocations"
        :ring-states="ringStates"
        :strikes="feed.strikes.value"
        :now="now"
        :settings="state.live"
        @setup="panel = 'setup'"
        @add="addLocation"
        @select="selectedId = $event"
      />
      <LiveAlertSettings
        v-if="panel === 'status'"
        :state="state"
        :notifications="notifications"
        :forecast-on="forecastOn"
      />

      <section v-else-if="panel === 'place'" class="location-setup">
        <header class="section-heading">
          <div>
            <p class="eyebrow">New location</p>
            <h2>Locations</h2>
          </div>
        </header>
        <div class="drawing-card">
          <span class="step-number">01</span>
          <h3>Place your location</h3>
          <p>Click the map where the location is. Its alert ring follows the pin.</p>
          <strong>{{ draft ? `Pin placed at ${draft.lat.toFixed(4)}, ${draft.lon.toFixed(4)}` : 'No pin yet' }}</strong>
          <div class="button-row">
            <button class="secondary-button" type="button" @click="cancelDraft">Cancel</button>
            <button class="primary-button" type="button" :disabled="!draft" @click="panel = 'edit'">
              Continue
            </button>
          </div>
        </div>
      </section>

      <section v-else-if="panel === 'setup'" class="location-setup">
        <header class="section-heading">
          <div>
            <p class="eyebrow">Setup</p>
            <h2>Locations</h2>
          </div>
          <button class="text-button" type="button" @click="panel = 'status'">Done</button>
        </header>
        <button
          v-for="location in state.liveLocations"
          :key="location.id"
          class="area-summary-row"
          type="button"
          @click="editLocation(location)"
        >
          <i class="ring-dot" :class="ringStates[location.id] ?? 'clear'" />
          <span>
            <strong>{{ location.name }}</strong>
            <small>{{ location.radiusKm }} km ring · {{ location.countCloudToCloud ? 'ground + cloud' : 'ground only' }}</small>
          </span>
          <em>EDIT</em>
        </button>
        <button class="primary-button add-location" type="button" @click="addLocation">+ Add location</button>
      </section>

      <LocationEditor
        v-else-if="panel === 'edit' && draft"
        :draft="draft"
        :is-new="draftIsNew"
        @cancel="cancelDraft"
        @save="saveDraft"
        @delete="deleteDraft"
      />

      <ForecastSettingsPanel
        v-else-if="panel === 'forecast'"
        :draft="forecastDraft"
        :preview="forecastPreview"
        @back="panel = 'status'"
        @reset="resetForecast"
        @save="saveForecast"
      />
    </aside>
  </div>
</template>
