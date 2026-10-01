<script setup lang="ts">
import { computed } from 'vue'
import { INTENSITIES, type AlertArea, type AreaReading, type Intensity } from '@/types'
import { formatClock, strikeCountText } from '@/lib/alertText'
import { formatKm, type AreaLightningReading } from '@/lib/lightning'
import { INTENSITY_LABELS, INTENSITY_RANK } from '@/lib/palette'

const props = defineProps<{
  area: AlertArea
  reading: AreaReading | undefined
  lightning?: AreaLightningReading | undefined
}>()
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
    <div class="lightning-settings">
      <label class="toggle-row">
        <span>
          <strong>Alert on observed lightning</strong>
          <small>Strikes inside the area or its buffer</small>
        </span>
        <input
          v-model="area.lightningEnabled"
          type="checkbox"
          aria-label="Alert on observed lightning"
          @change="emit('change')"
        />
      </label>
      <template v-if="area.lightningEnabled">
        <div class="field">
          <label for="lightning-buffer">
            Lightning buffer
            <span class="field-value">{{ area.lightningBufferKm }} km</span>
          </label>
          <input
            id="lightning-buffer"
            v-model.number="area.lightningBufferKm"
            type="range"
            min="0"
            max="20"
            step="1"
            @change="emit('change')"
          />
          <p>Drawn as a dashed ring around the area.</p>
        </div>
        <div class="field">
          <label for="lightning-types">Strike types</label>
          <select id="lightning-types" v-model="area.lightningTypes" @change="emit('change')">
            <option value="cg">Cloud-to-ground only</option>
            <option value="cg+cc">Ground + cloud</option>
          </select>
          <div v-if="lightning && lightning.groundCount + lightning.cloudCount > 0" class="reading-summary act">
            <strong>{{ strikeCountText(lightning.groundCount, lightning.cloudCount) }} inside buffer</strong>
            <span>
              Nearest {{ formatKm(lightning.nearestKm ?? 0) }}
              <template v-if="lightning.latestTime"> · {{ formatClock(lightning.latestTime) }}</template>
            </span>
          </div>
          <div v-else-if="lightning" class="reading-summary met">
            <strong>No strikes inside buffer</strong>
            <span>Last 15 min</span>
          </div>
        </div>
        <label class="toggle-row">
          <span>
            <strong>Open Live on alert</strong>
            <small>The notification opens Live, centred on this area</small>
          </span>
          <input
            v-model="area.openLiveOnAlert"
            type="checkbox"
            aria-label="Open Live on alert"
            @change="emit('change')"
          />
        </label>
      </template>
    </div>
    <button class="danger-button" type="button" @click="emit('delete')">Delete area</button>
  </section>
</template>
