<script setup lang="ts">
import { INTENSITY_LABELS } from '@/lib/palette'
import type { AlertEvent } from '@/types'

defineProps<{ events: AlertEvent[] }>()
defineEmits<{ clear: [] }>()

function reason(event: AlertEvent) {
  return {
    entry: 'Rain entered',
    escalation: 'Intensity increased',
    'new-cell': 'New rain cell',
  }[event.reason]
}

function intensity(event: AlertEvent) {
  const threshold = event.thresholdIntensity ?? event.intensity
  return threshold === event.intensity
    ? `${INTENSITY_LABELS[threshold]} threshold`
    : `${INTENSITY_LABELS[threshold]} threshold · peak ${INTENSITY_LABELS[event.intensity]}`
}

function formatTime(timestamp: string) {
  const compact = timestamp.replace(/\D/g, '')
  if (compact.length < 12) return timestamp
  const date = new Date(
    `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}T${compact.slice(8, 10)}:${compact.slice(10, 12)}:00+08:00`,
  )
  return new Intl.DateTimeFormat('en-SG', {
    timeZone: 'Asia/Singapore',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
</script>

<template>
  <section class="history-panel">
    <header class="section-heading">
      <div>
        <p class="eyebrow">Activity</p>
        <h2>Alert history</h2>
      </div>
      <button v-if="events.length" class="text-button" type="button" @click="$emit('clear')">
        Clear
      </button>
    </header>
    <div v-if="!events.length" class="empty-history">
      <span aria-hidden="true">↗</span>
      <p>No alerts yet</p>
      <small>Rain events will appear here and stay on this device.</small>
    </div>
    <ol v-else class="event-list">
      <li v-for="event in events" :key="event.id">
        <span class="event-icon" :class="event.reason">●</span>
        <div>
          <strong>{{ event.source === 'test' ? 'Test · ' : '' }}{{ reason(event) }}</strong>
          <p>{{ event.areaName }} · {{ intensity(event) }} · {{ event.pixelCount }} px</p>
        </div>
        <time>{{ formatTime(event.timestamp) }}</time>
      </li>
    </ol>
  </section>
</template>
