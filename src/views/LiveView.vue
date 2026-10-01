<script setup lang="ts">
import type { AppState } from '@/composables/usePersistence'
import type { useLightningFeed } from '@/composables/useLightningFeed'
import type { useRadarMonitor } from '@/composables/useRadarMonitor'
import type { Route } from '@/composables/useRoute'
import type { RingState } from '@/types'

defineProps<{
  state: AppState
  monitor: ReturnType<typeof useRadarMonitor>
  feed: ReturnType<typeof useLightningFeed>
  ringStates: Record<string, RingState>
  now: number
  route: Route
}>()
defineEmits<{ navigate: [hash: string] }>()
</script>

<template>
  <div class="live-workspace">Live monitoring</div>
</template>
