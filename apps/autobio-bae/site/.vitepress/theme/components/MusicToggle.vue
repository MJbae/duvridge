<script setup lang="ts">
import { computed } from 'vue'
import type { MusicStatus } from '../lib/background-music'
import Icon from '@duvridge/reader-core/components/Icon.vue'

const props = defineProps<{ enabled: boolean; status: MusicStatus }>()
const emit = defineEmits<{ change: [enabled: boolean]; retry: [] }>()
// Steady states stay short beside the title; states that need an action keep a full sentence.
const message = computed(() => {
  if (!props.enabled) return '꺼짐'
  if (props.status === 'playing') return '재생 중'
  if (props.status === 'loading') return '준비 중'
  if (props.status === 'error') return '음악을 불러오지 못했어요'
  if (props.status === 'blocked') return '재생을 눌러 음악을 시작해 주세요'
  return '일시정지'
})
</script>

<template>
  <section class="music-setting" aria-labelledby="music-setting-title">
    <div class="music-setting-copy">
      <h3 id="music-setting-title"><Icon name="music" :size="18" />배경음악</h3>
      <p id="music-setting-status" role="status">{{ message }}</p>
      <button v-if="enabled && ['blocked', 'error', 'paused'].includes(status)" type="button" class="music-retry text-link" @click="emit('retry')">
        {{ status === 'error' ? '음악 다시 재생' : '음악 재생' }}
      </button>
    </div>
    <button type="button" class="music-toggle" role="switch" aria-label="배경음악" :aria-checked="enabled" aria-describedby="music-setting-status" @click="emit('change', !enabled)">
      <span class="switch-track" aria-hidden="true"><span /></span>
    </button>
  </section>
</template>
