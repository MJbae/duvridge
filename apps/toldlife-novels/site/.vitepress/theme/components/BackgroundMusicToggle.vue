<script setup lang="ts">
import type { MusicStatus } from '../lib/background-music'

defineProps<{ enabled: boolean; status: MusicStatus }>()
const emit = defineEmits<{ change: [enabled: boolean]; retry: [] }>()
</script>

<template>
  <section class="switch-row music-setting" aria-labelledby="music-setting-title">
    <div class="switch-row-copy">
      <h3 id="music-setting-title" class="switch-row-title">배경음악</h3>
      <!-- Only a failure needs words; playing, paused and loading show in the switch alone. -->
      <p v-if="enabled && status === 'error'" id="music-setting-status" class="switch-row-note" role="status">음악을 불러오지 못했어요 <button type="button" class="music-retry" @click="emit('retry')">다시 재생</button></p>
    </div>
    <button type="button" class="switch music-toggle" role="switch" aria-label="배경음악" :aria-checked="enabled" @click="emit('change', !enabled)"><span /></button>
  </section>
</template>
