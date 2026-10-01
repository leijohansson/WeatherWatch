<script setup lang="ts">
import { computed } from 'vue'
import type { LiveLocation } from '@/types'

const props = defineProps<{ draft: LiveLocation; isNew: boolean }>()
const emit = defineEmits<{ cancel: []; save: []; delete: [] }>()

const valid = computed(
  () =>
    props.draft.name.trim().length > 0 &&
    Number.isFinite(props.draft.lat) &&
    Number.isFinite(props.draft.lon) &&
    Math.abs(props.draft.lat) <= 90 &&
    Math.abs(props.draft.lon) <= 180 &&
    props.draft.radiusKm > 0,
)
</script>

<template>
  <section class="location-editor">
    <header class="section-heading">
      <div>
        <p class="eyebrow">Location setup</p>
        <h2>{{ isNew ? 'New location' : draft.name || 'Location' }}</h2>
      </div>
    </header>

    <div class="field">
      <label for="location-name">Name</label>
      <input id="location-name" v-model="draft.name" autocomplete="off" />
    </div>

    <div class="field">
      <span class="field-label">Position</span>
      <div class="split-field even">
        <label>
          <span class="visually-hidden">Latitude</span>
          <input v-model.number="draft.lat" type="number" step="0.0001" aria-label="Latitude" />
        </label>
        <label>
          <span class="visually-hidden">Longitude</span>
          <input v-model.number="draft.lon" type="number" step="0.0001" aria-label="Longitude" />
        </label>
      </div>
      <p>Drag the pin, or click the map, to move it.</p>
    </div>

    <div class="field">
      <label for="location-radius">
        Alert ring radius
        <span class="field-value">{{ draft.radiusKm }} km</span>
      </label>
      <input id="location-radius" v-model.number="draft.radiusKm" type="range" min="1" max="30" step="0.5" />
    </div>

    <label class="toggle-row">
      <span>
        <strong>Count cloud-to-cloud strikes</strong>
        <small>When off, only cloud-to-ground strikes change the ring</small>
      </span>
      <input v-model="draft.countCloudToCloud" type="checkbox" aria-label="Count cloud-to-cloud strikes" />
    </label>
    <label class="toggle-row">
      <span>
        <strong>All-clear countdown</strong>
        <small>Show the countdown for this location</small>
      </span>
      <input v-model="draft.showCountdown" type="checkbox" aria-label="All-clear countdown for this location" />
    </label>
    <label class="toggle-row">
      <span>
        <strong>Notify: strike in ring</strong>
        <small>When a counted strike lands inside the ring</small>
      </span>
      <input v-model="draft.notifyStrike" type="checkbox" aria-label="Notify on strike in ring" />
    </label>
    <label class="toggle-row">
      <span>
        <strong>Notify: all-clear</strong>
        <small>When the countdown runs out</small>
      </span>
      <input v-model="draft.notifyAllClear" type="checkbox" aria-label="Notify on all-clear" />
    </label>

    <div class="button-row">
      <button class="secondary-button" type="button" @click="emit('cancel')">Cancel</button>
      <button class="primary-button" type="button" :disabled="!valid" @click="emit('save')">Save location</button>
    </div>
    <button v-if="!isNew" class="danger-button" type="button" @click="emit('delete')">Delete location</button>
  </section>
</template>
