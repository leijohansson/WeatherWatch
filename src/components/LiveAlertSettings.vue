<script setup lang="ts">
import type { AppState } from '@/composables/usePersistence'
import type { useNotifications } from '@/composables/useNotifications'

defineProps<{
  state: AppState
  notifications: ReturnType<typeof useNotifications>
  forecastOn: boolean
}>()
</script>

<template>
  <section class="live-alert-settings">
    <p class="eyebrow">Alerts</p>
    <label class="toggle-row">
      <span>
        <strong>Lightning alerts</strong>
        <small>Strike inside a ring (plays once), and all-clear, per each location's setup</small>
      </span>
      <input v-model="state.alertTypes.lightning" type="checkbox" aria-label="Lightning alerts" />
    </label>
    <label class="toggle-row" :class="{ disabled: !forecastOn }">
      <span>
        <strong>Discrepancy alerts</strong>
        <small>
          {{ forecastOn
            ? 'A sector turns Discrepancy; sounds until acknowledged'
            : 'Only while Recommended forecast is on in Layers' }}
        </small>
      </span>
      <input v-model="state.alertTypes.discrepancy" type="checkbox" aria-label="Discrepancy alerts" />
    </label>
    <label class="toggle-row">
      <span>
        <strong>Alert sounds</strong>
        <small>Play tones for alerts that are on</small>
      </span>
      <input v-model="state.soundAlerts" type="checkbox" aria-label="Alert sounds" />
    </label>
    <div class="sound-volume-control">
      <label for="live-sound-volume">
        Alert volume
        <output for="live-sound-volume">{{ state.soundVolume }}%</output>
      </label>
      <input
        id="live-sound-volume"
        v-model.number="state.soundVolume"
        type="range"
        min="0"
        max="100"
        step="5"
        aria-label="Alert volume"
        @input="notifications.previewTone('lightning')"
      />
      <small>Adjust to preview the lightning alert tone.</small>
    </div>
    <p class="page-alert-note">Alerts only notify and sound while Live is open.</p>
  </section>
</template>
