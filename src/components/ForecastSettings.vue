<script setup lang="ts">
import { INTENSITY_LABELS } from '@/lib/palette'
import { INTENSITIES, type ForecastSettings } from '@/types'

defineProps<{ draft: ForecastSettings; preview: string }>()
const emit = defineEmits<{ back: []; reset: []; save: [] }>()
</script>

<template>
  <section class="forecast-settings">
    <header class="section-heading">
      <div>
        <p class="eyebrow">Recommended forecast</p>
        <h2>Forecast settings</h2>
      </div>
      <button class="text-button" type="button" @click="emit('back')">← Back</button>
    </header>
    <p class="settings-intro">
      A sector is <strong>Thunderstorm</strong> when radar or lightning meets these rules nearby,
      and <strong>Discrepancy</strong> when that happens but the published forecast isn't thundery.
    </p>

    <div class="settings-card">
      <h3>Radar</h3>
      <div class="field">
        <label for="fc-cluster">Minimum cluster size <span class="field-value">{{ draft.radar.minClusterKm2 }} km²</span></label>
        <input id="fc-cluster" v-model.number="draft.radar.minClusterKm2" type="range" min="1" max="100" step="1" />
      </div>
      <div class="field">
        <label for="fc-radar-distance">Distance to sector <span class="field-value">{{ draft.radar.distanceKm }} km</span></label>
        <input id="fc-radar-distance" v-model.number="draft.radar.distanceKm" type="range" min="0" max="30" step="1" />
      </div>
      <div class="field">
        <label for="fc-intensity">Minimum intensity</label>
        <select id="fc-intensity" v-model="draft.radar.minIntensity">
          <option v-for="intensity in INTENSITIES" :key="intensity" :value="intensity">
            {{ INTENSITY_LABELS[intensity] }}
          </option>
        </select>
      </div>
    </div>

    <div class="settings-card">
      <h3>Lightning</h3>
      <div class="field">
        <label for="fc-lightning-distance">Distance to sector <span class="field-value">{{ draft.lightning.distanceKm }} km</span></label>
        <input id="fc-lightning-distance" v-model.number="draft.lightning.distanceKm" type="range" min="0" max="30" step="1" />
      </div>
      <div class="field">
        <label for="fc-window">Strikes within the last <span class="field-value">{{ draft.lightning.windowMinutes }} min</span></label>
        <input id="fc-window" v-model.number="draft.lightning.windowMinutes" type="range" min="5" max="30" step="5" />
      </div>
      <div class="field">
        <label for="fc-types">Strike types</label>
        <select id="fc-types" v-model="draft.lightning.types">
          <option value="cg">Cloud-to-ground only</option>
          <option value="cg+cc">Ground + cloud</option>
        </select>
      </div>
    </div>

    <p class="settings-preview" role="status">{{ preview }}</p>
    <div class="button-row">
      <button class="secondary-button" type="button" @click="emit('reset')">Reset to defaults</button>
      <button class="primary-button" type="button" @click="emit('save')">Save</button>
    </div>
  </section>
</template>
