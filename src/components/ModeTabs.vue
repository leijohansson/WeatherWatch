<script setup lang="ts">
import type { Mode } from '@/composables/useRoute'

defineProps<{ mode: Mode; strikesInRing: boolean }>()
const emit = defineEmits<{ select: [mode: Mode] }>()
</script>

<template>
  <nav class="mode-tabs" aria-label="Mode">
    <a
      class="mode-tab"
      :class="{ selected: mode === 'watch' }"
      href="#/watch"
      :aria-current="mode === 'watch' ? 'page' : undefined"
      @click.prevent="emit('select', 'watch')"
    >
      <svg class="mode-icon" viewBox="0 0 18 18" aria-hidden="true">
        <circle cx="9" cy="9" r="7.5" />
        <circle cx="9" cy="9" r="4.5" />
        <circle cx="9" cy="9" r="1.5" />
        <path d="M9 9 L14.3 3.7" />
      </svg>
      <span class="mode-text">
        <strong>Watch</strong>
        <small>Hands-off · alerts for your areas</small>
      </span>
    </a>
    <a
      class="mode-tab"
      :class="{ selected: mode === 'live' }"
      href="#/live"
      :aria-current="mode === 'live' ? 'page' : undefined"
      @click.prevent="emit('select', 'live')"
    >
      <svg class="mode-icon" viewBox="0 0 18 18" aria-hidden="true">
        <path d="M10.5 1.5 L4 10 H8.5 L7.5 16.5 L14 8 H9.5 Z" />
      </svg>
      <span class="mode-text">
        <strong>Live monitoring</strong>
        <small>Hands-on · storm in progress</small>
      </span>
      <i v-if="strikesInRing" class="live-dot" role="img" aria-label="Strikes inside a ring" />
    </a>
  </nav>
</template>
