<script setup lang="ts">
import { computed } from 'vue'
import type { MonitoringStatus } from '@/types'

const props = withDefaults(
  defineProps<{ status: MonitoringStatus; testMode: boolean; subject?: 'radar' | 'lightning' }>(),
  { subject: 'radar' },
)

const label = computed(() => {
  if (props.testMode) return 'Test mode'
  const lightning = props.subject === 'lightning'
  return {
    idle: 'Monitoring paused',
    checking: lightning ? 'Checking lightning' : 'Checking radar',
    monitoring: 'Live monitoring',
    offline: 'Offline',
    'cors-blocked': 'Live analysis blocked',
    error: lightning ? 'Lightning feed unavailable' : 'Radar unavailable',
  }[props.status]
})
</script>

<template>
  <span class="status-pill" :class="[status, { test: testMode }]">
    <i aria-hidden="true" />
    {{ label }}
  </span>
</template>
