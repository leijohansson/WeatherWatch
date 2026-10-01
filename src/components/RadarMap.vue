<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import baseMapUrl from '../../assets/map_240km_v2.jpg'
import {
  clampView,
  clientToNormalized,
  FULL_VIEW,
  pointsAttribute,
  viewToMap,
  zoomView,
  type MapView,
} from '@/lib/geometry'
import type { AlertArea, Point } from '@/types'

const props = defineProps<{
  areas: AlertArea[]
  selectedId: string | null
  drawing: boolean
  draft: Point[]
  overlayUrl: string | null
  overlayOpacity: number
  rainyAreaIds: Set<string>
}>()

const emit = defineEmits<{
  select: [id: string]
  deselect: []
  'map-click': [point: Point]
  'move-vertex': [areaId: string, index: number, point: Point]
  'move-vertex-end': [areaId: string]
}>()

const map = ref<HTMLElement>()
const dragging = ref<{ areaId: string; index: number } | null>(null)
let pendingPoint: Point | null = null
let moveFrame: number | undefined

// Zoom and pan. Areas stay in 0–1 map positions; only what's on screen changes.
const view = ref<MapView>(FULL_VIEW)
let pan: { x: number; y: number; center: Point } | null = null
// A drag that panned the map shouldn't also count as a click.
let suppressClick = false

/** The 0–1 viewport position of a pointer. */
function viewportPoint(event: { clientX: number; clientY: number }) {
  const rect = map.value?.getBoundingClientRect()
  return rect ? clientToNormalized(event.clientX, event.clientY, rect) : null
}

/** The 0–1 map position under a pointer. */
function normalized(event: PointerEvent | MouseEvent) {
  const point = viewportPoint(event)
  return point ? viewToMap(point, view.value) : null
}

function zoomBy(factor: number, anchor?: Point) {
  view.value = zoomView(view.value, factor, anchor)
}

function resetZoom() {
  view.value = FULL_VIEW
}

function onWheel(event: WheelEvent) {
  const anchor = viewportPoint(event)
  if (!anchor) return
  event.preventDefault()
  zoomBy(event.deltaY < 0 ? 1.25 : 1 / 1.25, anchor)
}

function startPan(event: PointerEvent) {
  if (event.button !== 0 || view.value.scale === 1) return
  pan = { x: event.clientX, y: event.clientY, center: view.value.center }
}

function movePan(event: PointerEvent) {
  const rect = map.value?.getBoundingClientRect()
  if (!pan || !rect?.width) return
  const dx = event.clientX - pan.x
  const dy = event.clientY - pan.y
  if (!suppressClick && Math.hypot(dx, dy) < 4) return
  suppressClick = true
  view.value = clampView({
    scale: view.value.scale,
    center: {
      x: pan.center.x - dx / rect.width / view.value.scale,
      y: pan.center.y - dy / rect.height / view.value.scale,
    },
  })
}

// The images move with a CSS transform; the SVG shows the same window through its viewBox.
const imageTransform = computed(() => {
  const { scale, center } = view.value
  return `translate(${(0.5 - center.x * scale) * 100}%, ${(0.5 - center.y * scale) * 100}%) scale(${scale})`
})
const viewBox = computed(() => {
  const { scale, center } = view.value
  const size = 100 / scale
  return `${center.x * 100 - size / 2} ${center.y * 100 - size / 2} ${size} ${size}`
})

function onAreaClick(id: string) {
  if (suppressClick) return
  emit('select', id)
}

function onMapClick(event: MouseEvent) {
  if (suppressClick) {
    suppressClick = false
    return
  }
  if (dragging.value) return
  if (!props.drawing) {
    emit('deselect')
    return
  }
  const point = normalized(event)
  if (point) emit('map-click', point)
}

function startDrag(event: PointerEvent, areaId: string, index: number) {
  event.preventDefault()
  event.stopPropagation()
  dragging.value = { areaId, index }
  ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
}

function moveDrag(event: PointerEvent) {
  movePan(event)
  if (!dragging.value) return
  const point = normalized(event)
  if (!point) return
  pendingPoint = point
  if (moveFrame !== undefined) return
  moveFrame = requestAnimationFrame(() => {
    moveFrame = undefined
    flushPendingMove()
  })
}

function flushPendingMove() {
  if (!dragging.value || !pendingPoint) return
  emit('move-vertex', dragging.value.areaId, dragging.value.index, pendingPoint)
  pendingPoint = null
}

function endDrag() {
  pan = null
  if (moveFrame !== undefined) cancelAnimationFrame(moveFrame)
  moveFrame = undefined
  flushPendingMove()
  if (dragging.value) emit('move-vertex-end', dragging.value.areaId)
  dragging.value = null
}

onBeforeUnmount(() => {
  if (moveFrame !== undefined) cancelAnimationFrame(moveFrame)
})

const draftPoints = computed(() => pointsAttribute(props.draft))
</script>

<template>
  <div
    ref="map"
    class="radar-map"
    :class="{ drawing, zoomed: view.scale > 1 }"
    data-testid="radar-map"
    @click="onMapClick"
    @pointerdown="startPan"
    @wheel="onWheel"
    @pointermove="moveDrag"
    @pointerup="endDrag"
    @pointercancel="endDrag"
  >
    <div class="radar-map-images" :style="{ transform: imageTransform }">
      <img :src="baseMapUrl" alt="Regional map centred on Singapore" class="base-map" />
      <img
        v-if="overlayUrl"
        :src="overlayUrl"
        alt="Latest rain radar overlay"
        class="radar-overlay"
        :style="{ opacity: overlayOpacity }"
        crossorigin="anonymous"
      />
      <!-- Counter-scaled so the label stays the same size while the map zooms. -->
      <div class="map-label" :style="{ transform: `scale(${1 / view.scale})` }">SINGAPORE</div>
    </div>
    <svg :viewBox="viewBox" preserveAspectRatio="none" aria-label="Alert areas">
      <g v-for="area in areas" :key="area.id" :class="{ disabled: !area.enabled }">
        <polygon
          class="area-shape"
          :points="pointsAttribute(area.vertices)"
          :fill="area.color"
          :stroke="area.color"
          :class="{
            selected: selectedId === area.id,
            rainy: rainyAreaIds.has(area.id),
          }"
          @click.stop="onAreaClick(area.id)"
        />
        <template v-if="selectedId === area.id && !drawing">
          <circle
            v-for="(vertex, index) in area.vertices"
            :key="index"
            :cx="vertex.x * 100"
            :cy="vertex.y * 100"
            :r="1.45 / view.scale"
            :fill="area.color"
            class="vertex"
            @pointerdown="startDrag($event, area.id, index)"
            @click.stop
          />
        </template>
      </g>
      <polyline v-if="draft.length" :points="draftPoints" class="draft-line" />
      <circle
        v-for="(vertex, index) in draft"
        :key="`draft-${index}`"
        :cx="vertex.x * 100"
        :cy="vertex.y * 100"
        :r="0.9 / view.scale"
        class="draft-point"
      />
    </svg>
    <div v-if="drawing" class="drawing-hint">Click to place corners · 3 minimum</div>
    <div class="map-zoom" @pointerdown.stop @click.stop @wheel.stop>
      <button type="button" aria-label="Zoom in" @click="zoomBy(1.5)">+</button>
      <button type="button" aria-label="Zoom out" @click="zoomBy(1 / 1.5)">−</button>
      <button type="button" aria-label="Show the whole map" :disabled="view.scale === 1" @click="resetZoom">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="4.5" />
          <path d="M8 1v3M8 12v3M1 8h3M12 8h3" />
        </svg>
      </button>
    </div>
  </div>
</template>
