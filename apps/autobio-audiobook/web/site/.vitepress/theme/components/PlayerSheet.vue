<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { withBase } from 'vitepress'
import { clock, spokenTime } from '../../shared/narration-cues.mjs'
import type { PlayerMode } from '../../shared/player.mjs'
import { catalog, startImageSrc, type Episode } from '../lib/catalog'
import { narrationFor, narrationKey, narrationRates } from '../lib/narration'
import Icon from '@duvridge/reader-core/components/Icon.vue'

const props = defineProps<{ episode: Episode; mode: PlayerMode; actionLabel: string; actionIcon?: string }>()
const emit = defineEmits<{ act: [] }>()
const narration = inject(narrationKey)!
const { state } = narration
const dialog = ref<HTMLDialogElement>()
const notice = ref('')
// The painting loads when the sheet first opens, not with every page.
const opened = ref(false)
const duration = computed(() => narrationFor(props.episode.id)?.duration ?? 0)
// Sentence steps and the position bar work on the recording in use.
const current = computed(() => state.active && state.episodeId === props.episode.id)
const time = computed(() => (current.value ? state.time : props.mode === 'resume' ? state.saved?.time ?? 0 : 0))
const art = computed(() => withBase(startImageSrc(props.episode.id, 720)))

function open() {
  opened.value = true
  dialog.value?.showModal()
}
function close() { dialog.value?.close() }
function closeOnBackdrop(event: MouseEvent) {
  if (event.target !== dialog.value) return
  const rect = dialog.value!.getBoundingClientRect()
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close()
}
function seek(event: Event) { narration.seek(Number((event.target as HTMLInputElement).value)) }
/** Phones open their share sheet, so family can pass an episode on in a messenger; others copy the address. */
async function share() {
  const url = new URL(withBase(props.episode.url), location.origin).href
  const title = `${props.episode.label} ${props.episode.title} · ${catalog.work.title}`
  try {
    if (navigator.share) await navigator.share({ title, url })
    else {
      await navigator.clipboard.writeText(url)
      notice.value = '주소를 복사했어요'
    }
  } catch { /* Closing the share sheet is not a failure. */ }
}
defineExpose({ open, close })
</script>

<template>
  <dialog ref="dialog" class="player-sheet" aria-label="펼친 플레이어" @click="closeOnBackdrop" @close="notice = ''">
    <div class="dialog-body">
      <div class="dialog-handle" aria-hidden="true" />
      <header class="player-sheet-heading">
        <button type="button" class="player-sheet-tool" @click="close"><Icon name="chevron-down" :size="22" :stroke="2" />접기</button>
        <button type="button" class="player-sheet-tool is-share" @click="share"><Icon name="share" :size="20" />공유</button>
      </header>
      <p v-if="notice" class="player-sheet-notice" role="status">{{ notice }}</p>
      <img v-if="opened" class="player-sheet-art" :src="art" alt="" width="720" height="405">
      <span v-else class="player-sheet-art" aria-hidden="true" />
      <p class="player-sheet-label">{{ episode.place ? `${episode.place.label} · ` : '' }}{{ episode.label }}</p>
      <h2 class="player-sheet-title">{{ episode.title }}</h2>
      <p class="player-sheet-author">{{ catalog.work.subtitle }}</p>
      <input class="player-sheet-position" type="range" min="0" :max="duration" step="1" :value="time" :disabled="!current" aria-label="재생 위치" :aria-valuetext="`${spokenTime(duration)} 중 ${spokenTime(time)}`" @input="seek">
      <div class="player-sheet-times" aria-hidden="true"><span>{{ clock(time) }}</span><span>{{ clock(duration) }}</span></div>
      <div class="player-sheet-controls">
        <button type="button" :disabled="!current" @click="narration.previousSentence()"><Icon name="replay" :size="28" /><span>이전 문장</span></button>
        <button type="button" class="player-sheet-main" :disabled="mode === 'unavailable'" @click="emit('act')">
          <Icon v-if="actionIcon" :name="actionIcon" :size="18" :filled="actionIcon === 'play'" :stroke="actionIcon === 'pause' ? 3 : 2" />{{ actionLabel }}
        </button>
        <button type="button" :disabled="!current" @click="narration.nextSentence()"><Icon name="forward" :size="28" /><span>다음 문장</span></button>
      </div>
      <p id="player-rate-label" class="settings-label">재생 속도</p>
      <div class="player-options" role="group" aria-labelledby="player-rate-label">
        <button v-for="rate in narrationRates" :key="rate.value" type="button" :class="{ selected: state.rate === rate.value }" :aria-pressed="state.rate === rate.value" :aria-label="`${rate.value}배 ${rate.label}`" @click="narration.setRate(rate.value)">
          <strong>{{ rate.value }}배</strong><span>{{ rate.label }}</span>
        </button>
      </div>
      <section class="player-switch-row" aria-labelledby="player-autoplay-title">
        <div>
          <h3 id="player-autoplay-title">다음 화 자동으로 듣기</h3>
          <p id="player-autoplay-note">한 화가 끝나면 다음 화를 자동으로 들려 드려요</p>
        </div>
        <button type="button" class="player-switch" role="switch" aria-labelledby="player-autoplay-title" aria-describedby="player-autoplay-note" :aria-checked="state.autoplay" @click="narration.setAutoplay(!state.autoplay)">
          <span class="switch-track" aria-hidden="true"><span /></span>
        </button>
      </section>
    </div>
  </dialog>
</template>
