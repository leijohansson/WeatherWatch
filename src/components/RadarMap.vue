<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import baseMapUrl from '../../assets/map_240km_v2.jpg'
import { clientToNormalized, pointsAttribute } from '@/lib/geometry'
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

function normalized(event: PointerEvent | MouseEvent) {
  const rect = map.value?.getBoundingClientRect()
  return rect ? clientToNormalized(event.clientX, event.clientY, rect) : null
}

function onMapClick(event: MouseEvent) {
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
    :class="{ drawing }"
    data-testid="radar-map"
    @click="onMapClick"
    @pointermove="moveDrag"
    @pointerup="endDrag"
    @pointercancel="endDrag"
  >
    <img :src="baseMapUrl" alt="Regional map centred on Singapore" class="base-map" />
    <img
      v-if="overlayUrl"
      :src="overlayUrl"
      alt="Latest rain radar overlay"
      class="radar-overlay"
      :style="{ opacity: overlayOpacity }"
      crossorigin="anonymous"
    />
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Alert areas">
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
          @click.stop="emit('select', area.id)"
        />
        <template v-if="selectedId === area.id && !drawing">
          <circle
            v-for="(vertex, index) in area.vertices"
            :key="index"
            :cx="vertex.x * 100"
            :cy="vertex.y * 100"
            r="1.45"
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
        r="0.9"
        class="draft-point"
      />
    </svg>
    <div v-if="drawing" class="drawing-hint">Click to place corners · 3 minimum</div>
    <div class="map-label">SINGAPORE</div>
  </div>
</template>
