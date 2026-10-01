<script setup lang="ts">
import { lightningDetail, liveHref, parseCompactTimestamp, rainDetail, REASON_LABELS } from '@/lib/alertText'
import type { AlertEvent } from '@/types'

defineProps<{ events: AlertEvent[] }>()
defineEmits<{ clear: [] }>()

function detail(event: AlertEvent) {
  return event.reason === 'lightning'
    ? lightningDetail(event)
    : `${rainDetail(event)} · ${event.pixelCount} px`
}

function formatTime(timestamp: string) {
  const date = parseCompactTimestamp(timestamp)
  if (!date) return timestamp
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
          <strong>{{ event.source === 'test' ? 'Test · ' : '' }}{{ REASON_LABELS[event.reason] }}</strong>
          <p>{{ event.areaName }} · {{ detail(event) }}</p>
          <a v-if="event.reason === 'lightning'" class="event-link" :href="liveHref(event.areaId)">
            Open in Live →
          </a>
        </div>
        <time>{{ formatTime(event.timestamp) }}</time>
      </li>
    </ol>
  </section>
</template>
