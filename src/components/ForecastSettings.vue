<script setup lang="ts">
import { computed } from 'vue'
import { formatRate, RADAR_LEVEL_CHOICES, radarColorCss } from '@/lib/radarScale'
import type { ForecastSettings } from '@/types'

const props = defineProps<{ draft: ForecastSettings; preview: string }>()
const emit = defineEmits<{ back: []; reset: []; save: [] }>()

// The slider moves between the selectable radar colours; the track shows every colour they span.
const first = RADAR_LEVEL_CHOICES[0].index
const choice = computed({
  get: () => Math.max(0, RADAR_LEVEL_CHOICES.findIndex((c) => c.index === props.draft.radar.minLevel)),
  set: (position: number) => {
    props.draft.radar.minLevel = RADAR_LEVEL_CHOICES[position]?.index ?? first
  },
})
const selected = computed(() => RADAR_LEVEL_CHOICES[choice.value] ?? RADAR_LEVEL_CHOICES[0])
// Every radar colour from the first to the last choice, placed so each choice sits under its stop.
const last = RADAR_LEVEL_CHOICES[RADAR_LEVEL_CHOICES.length - 1]!.index
const trackStops = Array.from(
  { length: last - first + 1 },
  (_, i) => `${radarColorCss(first + i)} ${((i / (last - first)) * 100).toFixed(1)}%`,
)
const trackStyle = { '--radar-track': `linear-gradient(90deg, ${trackStops.join(', ')})` }
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
        <div class="intensity-scale radar-level-scale">
          <output for="fc-intensity">
            <i class="radar-swatch" :style="{ background: radarColorCss(selected.index) }" />
            {{ selected.name }} · {{ formatRate(selected.index) }} and heavier
          </output>
          <input
            id="fc-intensity"
            v-model.number="choice"
            class="intensity-slider radar-level-slider"
            :style="trackStyle"
            type="range"
            min="0"
            :max="RADAR_LEVEL_CHOICES.length - 1"
            step="1"
            aria-label="Minimum radar intensity"
            :aria-valuetext="`${selected.name}, ${formatRate(selected.index)}`"
          />
          <div class="intensity-labels" aria-hidden="true">
            <span v-for="level in RADAR_LEVEL_CHOICES" :key="level.index">{{ formatRate(level.index) }}</span>
          </div>
        </div>
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
          <option value="cg">CG</option>
          <option value="cg+cc">CG + CC</option>
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
