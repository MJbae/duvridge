<script setup lang="ts">
import { computed, inject, nextTick, ref, watch } from 'vue'
import { clock } from '../../shared/narration-cues.mjs'
import { narrationKey } from '../lib/narration'
import { cueElements } from '../lib/narration-page'
import Icon from '@duvridge/reader-core/components/Icon.vue'

const narration = inject(narrationKey)!
const { state, pageTrack } = narration
const position = ref<{ top: number; left: number } | null>(null)
// The offer reads this page's recording, also while another episode is the one playing.
const time = computed(() => pageTrack.value?.cues[state.pick]?.[0] ?? 0)

// The offer sits above the first line of the tapped sentence and scrolls with the text.
watch(() => state.pick, async index => {
  position.value = null
  if (index < 0) return
  await nextTick()
  const line = cueElements(index)[0]?.getClientRects()[0]
  const main = document.querySelector('.reader-main')?.getBoundingClientRect()
  if (!line || !main) return
  position.value = { top: line.top - main.top, left: Math.max(16, Math.min(line.left - main.left - 6, main.width - 236)) }
})
</script>

<template>
  <div v-if="position && state.pick >= 0" class="narration-pick" :style="{ top: `${position.top}px`, left: `${position.left}px` }">
    <button type="button" @click="narration.playFrom(state.pick)">
      <span class="narration-pick-icon" aria-hidden="true"><Icon name="play" :size="14" filled :stroke="1.6" /></span>
      여기부터 듣기<span class="narration-pick-time">{{ clock(time) }}</span>
    </button>
  </div>
</template>
