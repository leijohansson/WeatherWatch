<script setup lang="ts">
import { STRIKE_AGE_COLORS } from '@/lib/lightning'
import { strikePath } from '@/lib/strikeShapes'
</script>

<template>
  <div class="strike-legend">
    <div class="strike-color-bar" role="img" aria-label="Strike age: red under 2.5 minutes through blue at 30 minutes">
      <div class="strike-color-steps">
        <i v-for="color in STRIKE_AGE_COLORS" :key="color" :style="{ background: color }" />
      </div>
      <div class="strike-color-labels" aria-hidden="true">
        <span>0</span><span>10</span><span>20</span><span>30 min</span>
      </div>
    </div>
    <span class="strike-key">
      <svg viewBox="-8 -8 16 16" aria-hidden="true"><path :d="strikePath('cg', 0, 0, true)" /></svg>
      Ground
    </span>
    <span class="strike-key">
      <svg viewBox="-8 -8 16 16" aria-hidden="true"><path :d="strikePath('cc', 0, 0, true)" /></svg>
      Cloud
    </span>
  </div>
</template>
