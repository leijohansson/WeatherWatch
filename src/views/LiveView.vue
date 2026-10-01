<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import ForecastSettingsPanel from '@/components/ForecastSettings.vue'
import LayersPanel from '@/components/LayersPanel.vue'
import LiveMap, { type MapSector } from '@/components/LiveMap.vue'
import LocationEditor from '@/components/LocationEditor.vue'
import LocationStatus from '@/components/LocationStatus.vue'
import StrikeColorBar from '@/components/StrikeColorBar.vue'
import { useGeoLayers } from '@/composables/useGeoLayers'
import type { useLightningFeed } from '@/composables/useLightningFeed'
import { useOfficialForecast } from '@/composables/useOfficialForecast'
import { defaultLiveSettings, newLiveLocation, type AppState } from '@/composables/usePersistence'
import type { useRadarMonitor } from '@/composables/useRadarMonitor'
import { routeHash, type Route } from '@/composables/useRoute'
import { formatClock, parseCompactTimestamp } from '@/lib/alertText'
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
import { centroid, LAT0, LON0, normalizedToLatLon } from '@/lib/geo'
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
}>()
const emit = defineEmits<{ navigate: [hash: string] }>()

const layers = computed(() => props.state.live.layers)

// ---- Panels -------------------------------------------------------------------------------

type Panel = 'status' | 'setup' | 'edit' | 'forecast'
const panel = ref<Panel>('status')
const layersOpen = ref(false)
const selectedId = ref<string | null>(null)

// ---- Location setup -----------------------------------------------------------------------

const draft = ref<LiveLocation | null>(null)
const draftIsNew = ref(false)

function editLocation(location: LiveLocation) {
  draft.value = { ...location }
  draftIsNew.value = false
  selectedId.value = location.id
  panel.value = 'edit'
}

function addLocation() {
  const centre = mapCentre.value
  draft.value = newLiveLocation({
    name: `Location ${props.state.liveLocations.length + 1}`,
    lat: Number(centre.lat.toFixed(4)),
    lon: Number(centre.lon.toFixed(4)),
  })
  draftIsNew.value = true
  selectedId.value = draft.value.id
  panel.value = 'edit'
}

function saveDraft() {
  if (!draft.value) return
  const index = props.state.liveLocations.findIndex((l) => l.id === draft.value?.id)
  if (index >= 0) props.state.liveLocations.splice(index, 1, { ...draft.value })
  else props.state.liveLocations.push({ ...draft.value })
  draft.value = null
  panel.value = 'setup'
}

function deleteDraft() {
  const id = draft.value?.id
  props.state.liveLocations = props.state.liveLocations.filter((l) => l.id !== id)
  draft.value = null
  panel.value = 'setup'
}

function cancelDraft() {
  draft.value = null
  panel.value = 'setup'
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

const focusedArea = computed(() => props.state.areas.find((a) => a.id === props.route.focus) ?? null)
const focusedLocation = computed(
  () => props.state.liveLocations.find((l) => l.id === props.route.focus) ?? null,
)

const mapCentre = computed<LatLon>(() => {
  if (focusedLocation.value) return focusedLocation.value
  if (focusedArea.value) {
    const c = centroid(focusedArea.value.vertices.map(normalizedToLatLon))
    if (c) return c
  }
  return centroid(props.state.liveLocations) ?? { lat: LAT0, lon: LON0 }
})
const focusKey = computed(() => `${props.route.focus ?? ''}|${props.route.fromAlert}`)

const chip = computed(() => {
  if (!props.route.fromAlert) return null
  if (focusedLocation.value) {
    const inRing = latestStrikeInRing(focusedLocation.value, props.feed.strikes.value)
    if (!inRing) return { time: null, text: `${focusedLocation.value.name} · no strike inside the ring now` }
    return {
      time: formatClock(inRing.strike.time),
      text: `${STRIKE_TYPE_LABELS[inRing.strike.type]} strike ${formatKm(inRing.distanceKm)} from ${focusedLocation.value.name}`,
    }
  }
  if (focusedArea.value) {
    const event = props.state.history.find(
      (e) => e.reason === 'lightning' && e.areaId === focusedArea.value?.id,
    )
    if (event?.reason !== 'lightning') return { time: null, text: focusedArea.value.name }
    const date = parseCompactTimestamp(event.timestamp)
    return {
      time: date ? formatClock(date) : null,
      text: event.nearestKm
        ? `${STRIKE_TYPE_LABELS[event.nearestType]} strike ${formatKm(event.nearestKm)} from ${event.areaName}`
        : `${STRIKE_TYPE_LABELS[event.nearestType]} strike inside ${event.areaName}`,
    }
  }
  return null
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

function classify(set: SectorSet, settings: ForecastSettings): Record<string, SectorClass> {
  const frame = props.monitor.visibleFrame.value
  const clusterSet =
    settings === props.state.live.forecast ? clusters.value : frame ? findRadarClusters(frame, settings.radar) : []
  const inputs = geometryFor(set).map((sector) => ({
    id: sector.id,
    rings: sector.rings,
    forecastLightning:
      set === 'town'
        ? forecastExpectsLightning(official.twoHour.value?.byArea[sector.forecastArea])
        : catExpectsLightning(official.armyCat.value?.[sector.name]),
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
  const name = set === 'army' ? 'Army Cat1' : 'Townships'
  return `${name}: ${counts.discrepancy} discrepancy · ${counts.thunderstorm} thunderstorm · ${counts.clear} clear`
})

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
  <div class="live-workspace">
    <section class="map-panel live-map-panel">
      <div class="map-toolbar">
        <div class="live-toolbar-left">
          <span class="toolbar-label">LIVE · LIGHTNING + RADAR</span>
          <strong>{{ toolbarTime }}</strong>
        </div>
        <div class="live-toolbar-right">
          <button v-if="feed.testMode.value" class="test-storm-badge" type="button" @click="feed.leaveFixture">
            TEST STORM · EXIT
          </button>
          <span class="toolbar-note">STRIKES UPDATE EVERY 2 MIN</span>
        </div>
      </div>
      <p v-if="feed.lastError.value" class="status-message live-error">{{ feed.lastError.value }}</p>

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
        @select="selectedId = $event"
        @move="moveDraft"
        @map-click="draft && moveDraft(draft.id, $event)"
      >
        <div class="map-top-left">
          <div class="mobile-layers">
            <button class="layers-button" type="button" @click="layersOpen = !layersOpen">Layers</button>
            <span class="layers-chip">{{ layerSummary }}</span>
          </div>
          <div v-if="chip" class="alert-chip" role="status">
            <div>
              <small>FROM WATCH ALERT{{ chip.time ? ` · ${chip.time}` : '' }}</small>
              <strong>{{ chip.text }}</strong>
            </div>
            <button type="button" class="chip-dismiss" aria-label="Dismiss" @click="dismissChip">✕</button>
          </div>
        </div>
        <LayersPanel
          :layers="layers"
          :class="{ open: layersOpen }"
          @forecast-settings="openForecastSettings"
          @close="layersOpen = false"
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
      <p
        v-if="forecastOn && layers.sectors === 'army' && !official.armyConfigured.value"
        class="legend-note"
      >
        Army discrepancy needs SafeGuardian, which isn't configured on this server.
      </p>
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
        @select="selectedId = $event"
      />

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
