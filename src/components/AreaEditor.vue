<script setup lang="ts">
import { computed } from 'vue'
import { INTENSITIES, type AlertArea, type AreaReading, type Intensity } from '@/types'
import { INTENSITY_LABELS, INTENSITY_RANK } from '@/lib/palette'

const props = defineProps<{ area: AlertArea; reading: AreaReading | undefined }>()
const emit = defineEmits<{ delete: []; change: [] }>()

const intensityValue = computed({
  get: () => INTENSITY_RANK[props.area.intensityThreshold],
  set: (value: number) => {
    props.area.intensityThreshold = INTENSITIES[value - 1] as Intensity
  },
})
</script>

<template>
  <section class="area-editor">
    <div class="field split-field">
      <label>
        <span>Area name</span>
        <input v-model="area.name" aria-label="Area name" @change="emit('change')" />
      </label>
      <label class="color-field">
        <span>Colour</span>
        <input v-model="area.color" type="color" aria-label="Area colour" @change="emit('change')" />
      </label>
    </div>

    <div class="field">
      <label for="intensity">Alert from</label>
      <div class="intensity-scale">
        <output for="intensity">{{ INTENSITY_LABELS[area.intensityThreshold] }} rain</output>
        <input
          id="intensity"
          v-model.number="intensityValue"
          class="intensity-slider"
          type="range"
          min="1"
          max="4"
          step="1"
          aria-label="Minimum rain intensity"
          :aria-valuetext="`${INTENSITY_LABELS[area.intensityThreshold]} rain`"
          @change="emit('change')"
        />
        <div class="intensity-labels" aria-hidden="true">
          <span v-for="intensity in INTENSITIES" :key="intensity">
            {{ INTENSITY_LABELS[intensity] }}
          </span>
        </div>
      </div>
    </div>

    <div class="field">
      <label for="pixels">
        Minimum rain pixels
        <span class="field-value">{{ area.pixelThreshold }}</span>
      </label>
      <input
        id="pixels"
        v-model.number="area.pixelThreshold"
        type="range"
        min="1"
        max="250"
        @change="emit('change')"
      />
      <p>Only pixels at or above the selected rain level count.</p>
      <div v-if="reading" class="reading-summary" :class="{ met: reading.rainy }">
        <strong>{{ reading.qualifyingPixels }} qualifying pixels</strong>
        <span>
          {{ reading.rainy ? 'Threshold met' : `${area.pixelThreshold} required` }}
        </span>
      </div>
    </div>

    <label class="toggle-row">
      <span>
        <strong>Area enabled</strong>
        <small>Include this shape in monitoring</small>
      </span>
      <input v-model="area.enabled" type="checkbox" aria-label="Area enabled" @change="emit('change')" />
    </label>
    <label class="toggle-row">
      <span>
        <strong>Alert for new cells</strong>
        <small>Notify when separate rain appears nearby</small>
      </span>
      <input
        v-model="area.notifyNewCell"
        type="checkbox"
        aria-label="Alert for new cells"
        @change="emit('change')"
      />
    </label>
    <button class="danger-button" type="button" @click="emit('delete')">Delete area</button>
  </section>
</template>
