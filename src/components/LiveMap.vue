<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useGeoLayers } from '@/composables/useGeoLayers'
import { SECTOR_CLASS_COLORS, type RadarClusterShape, type SectorClass } from '@/lib/forecast'
import { project, RADAR_BOUNDS, unproject } from '@/lib/geo'
import { FRESH_STRIKE_MIN, strikeAgeColor, strikeAgeMinutes } from '@/lib/lightning'
import { featurePolygons, pathKm } from '@/lib/mapGeometry'
import { strikePath } from '@/lib/strikeShapes'
import type { LatLon, LiveLayers, LiveLocation, Point, RingState, Strike } from '@/types'

export interface MapSector {
  id: string
  name: string
  /** SVG path in projected km. */
  path: string
  anchor: Point | null
  cls: SectorClass | null
  showLabel: boolean
}

const props = defineProps<{
  locations: LiveLocation[]
  ringStates: Record<string, RingState>
  strikes: Strike[]
  now: number
  layers: LiveLayers
  sectors: MapSector[]
  clusters: RadarClusterShape[]
  radarUrl: string | null
  focus: LatLon | null
  focusKey: string
  selectedId: string | null
  draggableId: string | null
}>()

const emit = defineEmits<{
  select: [id: string]
  move: [id: string, position: LatLon]
  'move-end': [id: string]
  'map-click': [position: LatLon]
}>()

const SEA = '#d9dedd'
const LAND = '#fbfbf9'
const MIN_SCALE = 3
const MAX_SCALE = 60
// The map can't pan beyond the area the coastline was clipped to (scripts/build_geo.py).
const PAN_NW = project(2.1, 103.0)
const PAN_SE = project(0.6, 104.7)

const { coast } = useGeoLayers()
const container = ref<HTMLElement>()
const size = ref({ w: 800, h: 600 })
const scale = ref(12)
const center = ref<Point>({ x: 0, y: 0 })

let observer: ResizeObserver | undefined

function defaultScale() {
  return size.value.w <= 680 ? 6.5 : 12
}

function recentre() {
  if (props.focus) center.value = project(props.focus.lat, props.focus.lon)
  scale.value = defaultScale()
}

onMounted(() => {
  const element = container.value
  if (element) {
    const rect = element.getBoundingClientRect()
    if (rect.width && rect.height) size.value = { w: rect.width, h: rect.height }
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(([entry]) => {
        if (entry) size.value = { w: entry.contentRect.width, h: entry.contentRect.height }
      })
      observer.observe(element)
    }
  }
  recentre()
})
onBeforeUnmount(() => observer?.disconnect())
watch(() => props.focusKey, recentre)

function clampCenter(point: Point): Point {
  return {
    x: Math.max(PAN_NW.x, Math.min(PAN_SE.x, point.x)),
    y: Math.max(PAN_NW.y, Math.min(PAN_SE.y, point.y)),
  }
}

const transform = computed(() => {
  const s = scale.value
  return `translate(${size.value.w / 2 - center.value.x * s} ${size.value.h / 2 - center.value.y * s}) scale(${s})`
})

function toScreen(lat: number, lon: number): Point {
  const p = project(lat, lon)
  return {
    x: (p.x - center.value.x) * scale.value + size.value.w / 2,
    y: (p.y - center.value.y) * scale.value + size.value.h / 2,
  }
}

function toLatLon(clientX: number, clientY: number): LatLon {
  const rect = container.value?.getBoundingClientRect()
  const sx = clientX - (rect?.left ?? 0)
  const sy = clientY - (rect?.top ?? 0)
  return unproject({
    x: (sx - size.value.w / 2) / scale.value + center.value.x,
    y: (sy - size.value.h / 2) / scale.value + center.value.y,
  })
}

// Layer 1: base map. Land polygons on a sea background, or sea polygons on land.
const coastKind = computed(() => coast.value?.features[0]?.properties.kind ?? 'land')
const coastPath = computed(() =>
  (coast.value?.features ?? []).map((feature) => pathKm(featurePolygons(feature))).join(''),
)
const coastSource = computed(() => {
  const source = String(coast.value?.features[0]?.properties.source ?? '')
  return /goas/i.test(source) ? 'Marine Regions (CC BY)' : 'Natural Earth'
})

// Layer 2: radar underlay, placed with the same projection.
const radarBox = computed(() => {
  const nw = project(RADAR_BOUNDS.north, RADAR_BOUNDS.west)
  const se = project(RADAR_BOUNDS.south, RADAR_BOUNDS.east)
  return { x: nw.x, y: nw.y, width: se.x - nw.x, height: se.y - nw.y }
})

// Layer 3: sectors. Solid tints; clear sectors are fainter so storms stand out.
const SECTOR_FILL_OPACITY: Record<SectorClass, number> = { discrepancy: 0.3, thunderstorm: 0.26, clear: 0.1 }
const sectorLabels = computed(() =>
  props.sectors.flatMap((sector) => {
    if (!sector.showLabel || !sector.anchor) return []
    const s = scale.value
    return [{
      id: sector.id,
      name: sector.name,
      x: (sector.anchor.x - center.value.x) * s + size.value.w / 2,
      y: (sector.anchor.y - center.value.y) * s + size.value.h / 2,
    }]
  }),
)

// Layer 4: radar clusters, in screen space so the dashes stay 6 / 4 px.
const clusterShapes = computed(() =>
  props.layers.clusters
    ? props.clusters.map((cluster) => {
        const points = cluster.outline.map(({ lat, lon }) => toScreen(lat, lon))
        const top = points.reduce((a, b) => (b.y < a.y ? b : a), points[0] ?? { x: 0, y: 0 })
        return {
          id: cluster.id,
          label: cluster.label,
          d: `M${points.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('L')}Z`,
          labelAt: { x: top.x, y: top.y - 6 },
        }
      })
    : [],
)

// Layers 5 and 6: rings and pins.
const pins = computed(() =>
  props.locations.map((location) => ({
    location,
    ...toScreen(location.lat, location.lon),
    r: location.radiusKm * scale.value,
    state: props.ringStates[location.id] ?? 'clear',
  })),
)

// Layer 7: strikes, cloud-to-cloud under cloud-to-ground, oldest first so the newest sit on top.
const strikeMarks = computed(() =>
  props.strikes
    .filter((strike) => (strike.type === 'cg' ? props.layers.cg : props.layers.cc))
    .sort((a, b) => (a.type === b.type ? a.time - b.time : a.type === 'cc' ? -1 : 1))
    .flatMap((strike) => {
      const age = strikeAgeMinutes(strike, props.now)
      const color = strikeAgeColor(age)
      if (!color) return []
      const { x, y } = toScreen(strike.lat, strike.lon)
      if (x < -10 || y < -10 || x > size.value.w + 10 || y > size.value.h + 10) return []
      return [{ id: strike.id, color, d: strikePath(strike.type, x, y, age < FRESH_STRIKE_MIN) }]
    }),
)

// Pan, zoom and pin dragging.
type Gesture =
  | { kind: 'pan'; startX: number; startY: number; origin: Point; moved: boolean }
  | { kind: 'pin'; id: string }
let gesture: Gesture | null = null

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0) return
  gesture = { kind: 'pan', startX: event.clientX, startY: event.clientY, origin: center.value, moved: false }
  ;(event.currentTarget as Element).setPointerCapture?.(event.pointerId)
}

function onPinDown(event: PointerEvent, id: string) {
  event.stopPropagation()
  emit('select', id)
  if (props.draggableId !== id) return
  gesture = { kind: 'pin', id }
  container.value?.setPointerCapture?.(event.pointerId)
}

function onPointerMove(event: PointerEvent) {
  if (!gesture) return
  if (gesture.kind === 'pin') {
    emit('move', gesture.id, toLatLon(event.clientX, event.clientY))
    return
  }
  const dx = event.clientX - gesture.startX
  const dy = event.clientY - gesture.startY
  if (Math.hypot(dx, dy) > 3) gesture.moved = true
  center.value = clampCenter({
    x: gesture.origin.x - dx / scale.value,
    y: gesture.origin.y - dy / scale.value,
  })
}

function onPointerUp(event: PointerEvent) {
  if (gesture?.kind === 'pin') emit('move-end', gesture.id)
  else if (gesture && !gesture.moved) emit('map-click', toLatLon(event.clientX, event.clientY))
  gesture = null
}

function zoomBy(factor: number, anchor?: { clientX: number; clientY: number }) {
  const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale.value * factor))
  if (anchor) {
    // Keep the point under the cursor where it is.
    const rect = container.value?.getBoundingClientRect()
    const dx = anchor.clientX - (rect?.left ?? 0) - size.value.w / 2
    const dy = anchor.clientY - (rect?.top ?? 0) - size.value.h / 2
    center.value = clampCenter({
      x: center.value.x + dx / scale.value - dx / next,
      y: center.value.y + dy / scale.value - dy / next,
    })
  }
  scale.value = next
}

function onWheel(event: WheelEvent) {
  event.preventDefault()
  zoomBy(event.deltaY < 0 ? 1.15 : 1 / 1.15, event)
}

defineExpose({ recentre, zoomBy })
</script>

<template>
  <div
    ref="container"
    class="live-map"
    data-testid="live-map"
    :style="{ background: coastKind === 'land' ? SEA : LAND }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @wheel="onWheel"
  >
    <svg :width="size.w" :height="size.h" class="live-map-svg" aria-label="Live lightning map">
      <g :transform="transform">
        <!-- 1. Base map -->
        <path
          v-if="coastPath"
          :d="coastPath"
          :fill="coastKind === 'land' ? LAND : SEA"
          class="coast"
          fill-rule="evenodd"
        />
        <!-- 2. Radar underlay -->
        <image
          v-if="radarUrl && layers.radarOpacity > 0"
          :href="radarUrl"
          v-bind="radarBox"
          preserveAspectRatio="none"
          :opacity="layers.radarOpacity"
          class="radar-underlay"
        />
        <!-- 3. Sectors -->
        <g v-if="layers.sectors !== 'off'" class="sectors">
          <path
            v-for="sector in sectors"
            :key="sector.id"
            :d="sector.path"
            fill-rule="evenodd"
            :class="sector.cls ? `sector forecast ${sector.cls}` : 'sector plain'"
            :fill="sector.cls ? SECTOR_CLASS_COLORS[sector.cls] : 'none'"
            :fill-opacity="sector.cls ? SECTOR_FILL_OPACITY[sector.cls] : undefined"
            :stroke="sector.cls ? SECTOR_CLASS_COLORS[sector.cls] : '#47666d'"
          >
            <title>{{ sector.name }}</title>
          </path>
        </g>
      </g>

      <!-- Sector labels (Army Cat1) -->
      <text
        v-for="label in sectorLabels"
        :key="`label-${label.id}`"
        :x="label.x"
        :y="label.y"
        class="sector-label"
      >
        {{ label.name }}
      </text>

      <!-- 4. Radar clusters -->
      <g v-for="cluster in clusterShapes" :key="cluster.id" class="cluster">
        <path :d="cluster.d" />
        <text :x="cluster.labelAt.x" :y="cluster.labelAt.y">{{ cluster.label }}</text>
      </g>

      <!-- 5. Alert rings -->
      <template v-if="layers.rings">
        <circle
          v-for="pin in pins"
          :key="`ring-${pin.location.id}`"
          :cx="pin.x"
          :cy="pin.y"
          :r="pin.r"
          class="alert-ring"
          :class="pin.state"
        />
      </template>

      <!-- 6. Location pins -->
      <circle
        v-for="pin in pins"
        :key="`pin-${pin.location.id}`"
        :cx="pin.x"
        :cy="pin.y"
        r="4.5"
        class="location-pin"
        :class="{ selected: pin.location.id === selectedId, draggable: pin.location.id === draggableId }"
        :data-location="pin.location.id"
        @pointerdown="onPinDown($event, pin.location.id)"
      >
        <title>{{ pin.location.name }}</title>
      </circle>

      <!-- 7. Strikes -->
      <path v-for="mark in strikeMarks" :key="mark.id" :d="mark.d" :fill="mark.color" class="strike-mark" />
    </svg>

    <div class="map-zoom" @pointerdown.stop>
      <button type="button" aria-label="Zoom in" @click="zoomBy(1.4)">+</button>
      <button type="button" aria-label="Zoom out" @click="zoomBy(1 / 1.4)">−</button>
      <button type="button" aria-label="Recentre map" @click="recentre">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="4.5" />
          <path d="M8 1v3M8 12v3M1 8h3M12 8h3" />
        </svg>
      </button>
    </div>

    <div class="map-overlays" @pointerdown.stop @wheel.stop>
      <slot />
    </div>

    <small class="map-attribution">
      Coastline {{ coastSource }} · Radar weather.gov.sg · Lightning data.gov.sg
    </small>
  </div>
</template>
