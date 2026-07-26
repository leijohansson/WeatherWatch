<script setup lang="ts">
import { INTENSITIES, type AlertArea, type AreaReading } from '@/types'
import { INTENSITY_LABELS } from '@/lib/palette'

defineProps<{ area: AlertArea; reading: AreaReading | undefined }>()
const emit = defineEmits<{ delete: []; change: [] }>()
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
      <select id="intensity" v-model="area.intensityThreshold" @change="emit('change')">
        <option v-for="intensity in INTENSITIES" :key="intensity" :value="intensity">
          {{ INTENSITY_LABELS[intensity] }} rain
        </option>
      </select>
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
