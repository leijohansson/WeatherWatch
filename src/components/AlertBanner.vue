<script setup lang="ts">
import type { SoundingAlert } from '@/composables/useNotifications'

defineProps<{ label: string; alert: SoundingAlert }>()
const emit = defineEmits<{ acknowledge: [] }>()
</script>

<template>
  <div class="alert-banner" role="alert">
    <span class="alert-banner-pulse" aria-hidden="true" />
    <div>
      <small>{{ label }}</small>
      <strong>{{ alert.title }}</strong>
      <p>{{ alert.body }}</p>
    </div>
    <button class="primary-button" type="button" @click="emit('acknowledge')">Acknowledge</button>
  </div>
</template>
