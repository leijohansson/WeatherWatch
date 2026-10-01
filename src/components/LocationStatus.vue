<script setup lang="ts">
import { computed } from 'vue'
import {
  allClearRemaining,
  formatAgo,
  formatCountdown,
  formatKm,
  latestStrikeInRing,
  nearestStrike,
  STRIKE_TYPE_LABELS,
  strikeAgeMinutes,
  strikeCounts,
} from '@/lib/lightning'
import type { LiveLocation, LiveSettings, RingState, Strike } from '@/types'

const props = defineProps<{
  locations: LiveLocation[]
  ringStates: Record<string, RingState>
  strikes: Strike[]
  now: number
  settings: LiveSettings
}>()
const emit = defineEmits<{ setup: []; add: []; select: [id: string] }>()

const cards = computed(() =>
  props.locations
    .map((location) => {
      const state = props.ringStates[location.id] ?? 'clear'
      const inRing = latestStrikeInRing(location, props.strikes)
      const remaining =
        state === 'active'
          ? allClearRemaining(location, props.strikes, props.now, props.settings.allClearMinutes)
          : null
      return { location, state, meta: meta(location, inRing), remaining }
    })
    // Active locations first, so the one that matters sits at the top (and first in the mobile sheet).
    .sort((a, b) => Number(b.state === 'active') - Number(a.state === 'active')),
)

const anyActive = computed(() => cards.value.some((card) => card.state === 'active'))

function meta(location: LiveLocation, inRing: ReturnType<typeof latestStrikeInRing>) {
  const ago = (strike: Strike) => formatAgo(strikeAgeMinutes(strike, props.now))
  if (inRing && strikeAgeMinutes(inRing.strike, props.now) < props.settings.allClearMinutes) {
    return `${STRIKE_TYPE_LABELS[inRing.strike.type]} strike ${formatKm(inRing.distanceKm)} away, inside the ${location.radiusKm} km ring · ${ago(inRing.strike)}`
  }
  const nearest = nearestStrike(location, props.strikes)
  if (!nearest) return `No strikes in the last 30 min`
  return `Nearest ${STRIKE_TYPE_LABELS[nearest.strike.type].toLowerCase()} strike ${formatKm(nearest.distanceKm)} away · ${ago(nearest.strike)}`
}

const counts = computed(() => strikeCounts(props.strikes, props.now))

const setupSummary = computed(() => {
  const n = props.locations.length
  const noun = `${n} ${n === 1 ? 'location' : 'locations'}`
  return props.locations.some((l) => l.notifyStrike)
    ? `${noun} · alerts for strikes in ring`
    : `${noun} · no alerts`
})

function progress(remaining: number) {
  return `${Math.max(0, Math.min(100, (remaining / (props.settings.allClearMinutes * 60_000)) * 100))}%`
}
</script>

<template>
  <section class="location-status" :class="{ 'all-clear': !anyActive }">
    <header class="section-heading">
      <div>
        <p class="eyebrow">Live status</p>
        <h2>Your locations</h2>
      </div>
      <button class="add-button" type="button" @click="emit('add')">+ Add location</button>
    </header>

    <label class="toggle-row countdown-toggle">
      <span>
        <strong>All-clear countdown</strong>
        <small>{{ settings.allClearMinutes }} min without a strike inside a ring</small>
      </span>
      <input v-model="settings.allClearEnabled" type="checkbox" aria-label="All-clear countdown" />
    </label>

    <p v-if="!anyActive && locations.length" class="sheet-all-clear">All clear</p>

    <p v-if="!locations.length" class="empty-locations">
      No locations yet. Add one in setup to get rings and all-clear countdowns.
    </p>

    <ol class="location-cards">
      <li
        v-for="card in cards"
        :key="card.location.id"
        class="location-card"
        :class="card.state"
        @click="emit('select', card.location.id)"
      >
        <div class="location-card-head">
          <span class="ring-dot" :class="card.state" aria-hidden="true" />
          <strong>{{ card.location.name }}</strong>
          <em class="ring-badge" :class="card.state">{{ card.state === 'active' ? 'ACTIVE' : 'CLEAR' }}</em>
        </div>
        <p class="location-meta">{{ card.meta }}</p>
        <div
          v-if="card.remaining !== null && settings.allClearEnabled && card.location.showCountdown"
          class="countdown"
        >
          <div class="countdown-row">
            <output class="countdown-time" :aria-label="`${formatCountdown(card.remaining)} to all-clear`">
              {{ formatCountdown(card.remaining) }}
            </output>
            <span>
              to all-clear<br />
              <small>restarts on each strike inside {{ card.location.radiusKm }} km</small>
            </span>
          </div>
          <div class="countdown-bar"><i :style="{ width: progress(card.remaining) }" /></div>
        </div>
      </li>
    </ol>

    <div class="strike-table-wrap">
      <p class="eyebrow">Strikes, last 30 min</p>
      <table class="strike-table">
        <thead>
          <tr><th scope="col"><span class="visually-hidden">Type</span></th><th scope="col">&lt;5 min</th><th scope="col">5–15</th><th scope="col">15–30</th></tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Ground</th>
            <td>{{ counts.cg.lt5 }}</td><td>{{ counts.cg.lt15 }}</td><td>{{ counts.cg.lt30 }}</td>
          </tr>
          <tr>
            <th scope="row">Cloud</th>
            <td>{{ counts.cc.lt5 }}</td><td>{{ counts.cc.lt15 }}</td><td>{{ counts.cc.lt30 }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="setup-summary">
      <div>
        <p class="eyebrow">Setup</p>
        <small>{{ setupSummary }}</small>
      </div>
      <button class="secondary-button" type="button" @click="emit('setup')">Edit setup</button>
    </div>
  </section>
</template>
