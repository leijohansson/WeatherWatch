<script setup lang="ts">
import { computed } from 'vue'
import type { MonitoringStatus } from '@/types'

const props = defineProps<{ status: MonitoringStatus; testMode: boolean }>()

const label = computed(() => {
  if (props.testMode) return 'Test mode'
  return {
    idle: 'Monitoring paused',
    checking: 'Checking radar',
    monitoring: 'Live monitoring',
    offline: 'Offline',
    'cors-blocked': 'Live analysis blocked',
    error: 'Radar unavailable',
  }[props.status]
})
</script>

<template>
  <span class="status-pill" :class="[status, { test: testMode }]">
    <i aria-hidden="true" />
    {{ label }}
  </span>
</template>
