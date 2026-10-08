<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter, withBase } from 'vitepress'
import { clock, listeningMinutes } from '../../shared/narration-cues.mjs'
import { minutesLeft, playerTarget, type PlayerMode } from '../../shared/playback-selection.mjs'
import { catalog, startIllustration, startImageSrc } from '../lib/reader-catalog'
import { narrationFor, narrationKey } from '../lib/narration-controller'
import ReaderIcon from '@duvridge/story-reader/components/ReaderIcon.vue'
import AudiobookPlayerSheet from './AudiobookPlayerSheet.vue'

const props = defineProps<{ completed: string[] }>()
const narration = inject(narrationKey)!
const { state } = narration
const router = useRouter()
const sheet = ref<InstanceType<typeof AudiobookPlayerSheet>>()
// The button keeps its place and size in every state; only its words change.
const actions: Record<PlayerMode, { label: string; icon?: string }> = {
  idle: { label: '듣기', icon: 'play' },
  resume: { label: '이어 듣기', icon: 'play' },
  replay: { label: '다시 듣기', icon: 'play' },
  playing: { label: '일시 정지', icon: 'pause' },
  paused: { label: '이어 듣기', icon: 'play' },
  error: { label: '다시 시도', icon: 'retry' },
  unavailable: { label: '준비 중' },
}

const target = computed(() => playerTarget({
  readingOrder: catalog.readingOrder,
  narration: catalog.narration ?? {},
  page: narration.page.value,
  session: state.active ? { id: state.episodeId, playing: state.playing, failed: state.failed } : null,
  saved: state.saved,
  completed: props.completed,
}))
const episode = computed(() => catalog.readingOrder.find(entry => entry.id === target.value?.id))
const duration = computed(() => (target.value ? narrationFor(target.value.id)?.duration ?? 0 : 0))
const action = computed(() => (target.value ? actions[target.value.mode] : actions.idle))
const nextComing = computed(() => target.value?.mode === 'playing' && narration.closing.value && state.autoplay &&
  Boolean(narration.nextTrack.value))
const info = computed(() => {
  const current = target.value
  if (!current) return ''
  if (current.mode === 'playing' || current.mode === 'paused') {
    return nextComing.value ? `${narration.countdown.value}초 후 다음 화` : `${clock(state.time)} / ${clock(duration.value)}`
  }
  if (current.mode === 'resume') return `${clock(current.time ?? 0)}부터 · ${minutesLeft(duration.value, current.time ?? 0)}분 남음`
  if (current.mode === 'error') return '재생하지 못했어요'
  if (current.mode === 'replay') return '재생 완료'
  if (current.mode === 'unavailable') return '준비 중'
  return `${listeningMinutes(duration.value)}분`
})
const progress = computed(() => {
  const current = target.value
  if (!current || !duration.value) return null
  const time = current.mode === 'playing' || current.mode === 'paused' ? state.time : current.mode === 'resume' ? current.time ?? 0 : null
  return time === null ? null : `${Math.min(100, Math.max(0, (time / duration.value) * 100))}%`
})
// On its own page an episode's painting is already loading for the text, so the bar reuses that
// file instead of fetching another size of the same picture.
// Null means the page has no painting to share; empty means it is still loading. The server-rendered
// page leaves the thumbnail empty, so no second size of the painting is fetched before the text's own.
const pageImage = ref<string | null>(null)
const mounted = ref(false)
let pageFigure: HTMLElement | null = null
/** Follows the page's painting through its fallback file and a reload; one that failed leaves the bar its own copy. */
function capturePageImage(event?: Event) {
  const image = pageFigure?.querySelector('img')
  const failed = event?.type === 'error' || Boolean(image?.complete && !image.naturalWidth)
  pageImage.value = failed ? null : image?.complete ? image.currentSrc : ''
}
function unwatchPageImage() {
  pageFigure?.removeEventListener('load', capturePageImage, true)
  pageFigure?.removeEventListener('error', capturePageImage, true)
}
function watchPageImage() {
  mounted.value = true
  unwatchPageImage()
  const start = startIllustration(narration.page.value)
  pageFigure = start ? document.querySelector<HTMLElement>(`[data-illustration="${start.id}"]`) : null
  if (!pageFigure) return void (pageImage.value = null)
  // Image events do not bubble, but the figure hears them first, also from an image made again on retry.
  pageFigure.addEventListener('load', capturePageImage, true)
  pageFigure.addEventListener('error', capturePageImage, true)
  capturePageImage()
}
onMounted(watchPageImage)
watch(() => narration.page.value, () => void nextTick(watchPageImage))
onBeforeUnmount(unwatchPageImage)
const thumb = computed(() => {
  if (!target.value || !mounted.value) return ''
  if (target.value.id === narration.page.value && pageImage.value !== null) return pageImage.value
  return withBase(startImageSrc(target.value.id, 360))
})
const returning = computed(() => narration.onPage.value && !state.follow && state.away !== 0)
const tip = computed(() => !state.tipSeen && narration.onPage.value && state.playing)

/** Episodes start where the listener left off; from another page the bar takes them to its text. */
function act() {
  const current = target.value
  if (!current) return
  if (current.mode === 'playing') return narration.pause()
  if (current.mode === 'paused') return narration.play()
  if (current.mode === 'error') return narration.retry()
  if (current.mode === 'unavailable') return
  narration.open(current.id, current.mode === 'resume' ? undefined : 0)
  if (current.id === narration.page.value || !episode.value) return
  // The text is what the listener goes there for, so the expanded player steps aside.
  sheet.value?.close()
  void router.go(withBase(episode.value.url))
}
</script>

<template>
  <section v-if="target && episode" class="player-bar" aria-label="오디오북 플레이어">
    <div class="player-float">
      <div v-if="tip" class="player-tip" role="note">
        <p>듣고 있는 문장이 파랗게 표시돼요. 다른 문장을 누르면 그 문장부터 들려 드려요.</p>
        <button type="button" @click="narration.dismissTip()">알겠어요</button>
      </div>
      <button v-if="returning" type="button" class="player-return" @click="narration.returnToCue()">
        <ReaderIcon :name="state.away < 0 ? 'up' : 'down'" :size="18" :stroke="2" />지금 듣는 곳으로
      </button>
    </div>
    <div v-if="progress" class="player-progress" aria-hidden="true"><span :style="{ width: progress }" /></div>
    <div class="player-handle" aria-hidden="true" />
    <div class="player-row">
      <button type="button" class="player-expand" aria-haspopup="dialog" :aria-label="`${episode.label} ${episode.title}, 플레이어 펼치기`" @click="sheet?.open()">
        <img v-if="thumb" class="player-thumb" :src="thumb" alt="" width="48" height="48">
        <span v-else class="player-thumb" aria-hidden="true" />
        <span class="player-copy">
          <span class="player-title">{{ episode.label }} {{ episode.title }}</span>
          <span class="player-info" :class="{ 'is-next': nextComing, 'is-error': target.mode === 'error' }">{{ info }}</span>
        </span>
      </button>
      <button type="button" class="player-action" :disabled="target.mode === 'unavailable'" :aria-busy="state.waiting && state.playing" @click="act">
        <span v-if="target.mode === 'playing' && state.waiting" class="player-spinner" aria-hidden="true" />
        <ReaderIcon v-else-if="action.icon" :name="action.icon" :size="16" :filled="action.icon === 'play'" :stroke="action.icon === 'pause' ? 3 : 2" />{{ action.label }}
      </button>
    </div>
    <AudiobookPlayerSheet ref="sheet" :episode="episode" :mode="target.mode" :action-label="action.label" :action-icon="action.icon" @act="act" />
  </section>
</template>
