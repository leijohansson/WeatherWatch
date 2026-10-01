<script setup lang="ts">
import type { LiveLayers, SectorSet } from '@/types'

const props = defineProps<{ layers: LiveLayers; collapsed: boolean }>()
const emit = defineEmits<{ 'forecast-settings': []; close: []; 'toggle-collapsed': [] }>()

const sectorOptions: { value: SectorSet; label: string }[] = [
  { value: 'town', label: 'Townships' },
  { value: 'army', label: 'Army Sectors' },
  { value: 'off', label: 'Off' },
]

function openForecastSettings() {
  if (props.layers.sectors !== 'off') emit('forecast-settings')
}
</script>

<template>
  <section class="layers-panel" :class="{ collapsed }" aria-label="Map layers">
    <header>
      <p class="eyebrow">Layers</p>
      <button
        class="text-button layers-minimise"
        type="button"
        :aria-expanded="!collapsed"
        :aria-label="collapsed ? 'Expand layers' : 'Minimise layers'"
        @click="emit('toggle-collapsed')"
      >
        {{ collapsed ? '+' : '−' }}
      </button>
      <button class="text-button layers-close" type="button" aria-label="Close layers" @click="emit('close')">
        ✕
      </button>
    </header>

    <div class="layers-body">
      <div class="layer-group">
        <p class="layer-group-title">Sectors</p>
        <div class="segmented" role="radiogroup" aria-label="Sectors">
          <label v-for="option in sectorOptions" :key="option.value" :class="{ selected: layers.sectors === option.value }">
            <input v-model="layers.sectors" type="radio" name="sectors" :value="option.value" />
            {{ option.label }}
          </label>
        </div>
      </div>

      <div class="layer-group">
        <!-- With sectors off the stored choice is kept, so picking a set again restores it. -->
        <label class="layer-check" :class="{ disabled: layers.sectors === 'off' }">
          <input
            type="checkbox"
            :checked="layers.sectors !== 'off' && layers.forecast"
            :disabled="layers.sectors === 'off'"
            aria-label="Recommended forecast"
            @change="layers.forecast = ($event.target as HTMLInputElement).checked"
          />
          <span>
            <strong>Recommended forecast</strong>
            <small>{{ layers.sectors === 'off' ? 'Pick a sector set to use' : 'Fill sectors by forecast' }}</small>
          </span>
        </label>
        <a
          class="layer-link"
          :class="{ disabled: layers.sectors === 'off' }"
          href="#"
          :tabindex="layers.sectors === 'off' ? -1 : undefined"
          :aria-disabled="layers.sectors === 'off' ? 'true' : undefined"
          @click.prevent="openForecastSettings"
        >
          Forecast settings →
        </a>
      </div>

      <div class="layer-group">
        <label class="layer-check">
          <input v-model="layers.clusters" type="checkbox" />
          <span><strong>Radar clusters</strong></span>
        </label>
      </div>

      <div class="layer-group" role="group" aria-label="Lightning">
        <p class="layer-group-title">Lightning</p>
        <label class="layer-check">
          <input v-model="layers.cg" type="checkbox" />
          <span><strong>Cloud-to-ground</strong></span>
        </label>
        <label class="layer-check">
          <input v-model="layers.cc" type="checkbox" />
          <span><strong>Cloud-to-cloud</strong></span>
        </label>
      </div>

      <div class="layer-group">
        <label class="layer-check">
          <input v-model="layers.rings" type="checkbox" />
          <span><strong>Alert rings</strong></span>
        </label>
      </div>

      <div class="layer-group">
        <label class="layer-range">
          <span>Radar <output>{{ Math.round(layers.radarOpacity * 100) }}%</output></span>
          <input
            v-model.number="layers.radarOpacity"
            type="range"
            min="0"
            max="1"
            step="0.05"
            aria-label="Radar opacity"
          />
        </label>
      </div>
    </div>
  </section>
</template>
