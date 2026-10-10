<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { withBase } from 'vitepress'
import ReaderIcon from '@duvridge/reader-ui/components/ReaderIcon.vue'
import { seriesHomeHref, seriesWorkHref } from '@duvridge/reader-ui/series/series-tabs.mjs'
import EpisodeReactions from './EpisodeReactions.vue'
import OriginalSeriesCard from './OriginalSeriesCard.vue'
import VideoControls from './VideoControls.vue'
import { useCatalog } from '../lib/reader-catalog'

const props = defineProps<{ filmId: string }>()
const catalog = useCatalog()
const film = computed(() => catalog.films.find(entry => entry.id === props.filmId))
// A film leads back to its whole original work, never to one episode: the novel page, told where the reader came from.
const originHref = computed(() => `${seriesWorkHref('novel', catalog.work.id)}?from=${encodeURIComponent(props.filmId)}`)
// Opening a film tries to play with sound. If the browser requires a tap, keep sound enabled
// and let the viewer start it with the playback controls.
const media = ref<HTMLVideoElement>()
const frame = ref<HTMLElement>()
const playing = ref(false)
const failed = ref(false)
const time = ref(0)
const mediaDuration = ref(0)
const duration = computed(() => mediaDuration.value || film.value?.duration || 0)
const fullRequested = ref(false)
const turned = ref(false)
const full = computed(() => fullRequested.value || turned.value)
let startAttempt = 0
let pendingSeek: number | undefined
let turnQuery: MediaQueryList | undefined

async function autoplay() {
  const attempt = ++startAttempt
  const video = media.value
  if (!video) return
  video.muted = false
  try {
    await video.play()
  } catch {
    if (attempt !== startAttempt || video !== media.value) return
    playing.value = false
    failed.value = Boolean(video.error)
  }
}
function syncTime() { time.value = media.value?.currentTime ?? 0 }
function syncMetadata() {
  const video = media.value
  if (!video) return
  mediaDuration.value = Number.isFinite(video.duration) ? video.duration : 0
  if (pendingSeek !== undefined) { seekTo(pendingSeek); pendingSeek = undefined }
  syncTime()
}
function syncPlaying() { playing.value = true; failed.value = false }
function mediaFailed() { playing.value = false; failed.value = true }
function seekTo(value: number) {
  const video = media.value
  if (!video || !Number.isFinite(value)) return
  const position = Math.min(duration.value, Math.max(0, value))
  video.currentTime = position
  time.value = position
}
function skip(seconds: number) { seekTo(time.value + seconds) }
function togglePlay() {
  const video = media.value
  if (!video) return
  ++startAttempt
  if (failed.value) {
    pendingSeek = time.value
    failed.value = false
    video.load()
  } else if (!video.paused) {
    video.pause()
    return
  }
  void video.play().catch(() => { failed.value = Boolean(video.error) })
}
/** Phones turn sideways for full screen where the browser allows it. */
async function enterFull() {
  fullRequested.value = true
  try { await frame.value?.requestFullscreen?.() } catch { /* The page itself fills the window instead. */ }
  try { await (screen.orientation as ScreenOrientation & { lock?: (orientation: string) => Promise<void> })?.lock?.('landscape') } catch { /* Not every device turns on request. */ }
}
async function leaveFull() {
  fullRequested.value = false
  turned.value = false
  try { if (document.fullscreenElement) await document.exitFullscreen() } catch { /* Already left. */ }
  try { screen.orientation?.unlock?.() } catch { /* Nothing locked. */ }
}
function toggleFull() { if (full.value) void leaveFull(); else void enterFull() }
function onFullscreenChange() {
  if (document.fullscreenElement) return
  fullRequested.value = false
  try { screen.orientation?.unlock?.() } catch { /* Nothing locked. */ }
}
function onTurn(event: MediaQueryListEvent) { turned.value = event.matches }

watch(() => props.filmId, async () => {
  ++startAttempt
  playing.value = false
  failed.value = false
  time.value = 0
  mediaDuration.value = 0
  pendingSeek = undefined
  await nextTick()
  void autoplay()
})
onMounted(() => {
  turnQuery = window.matchMedia('(orientation: landscape) and (max-height: 500px)')
  turned.value = turnQuery.matches
  turnQuery.addEventListener('change', onTurn)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  void autoplay()
})
onBeforeUnmount(() => {
  ++startAttempt
  turnQuery?.removeEventListener('change', onTurn)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  if (fullRequested.value) void leaveFull()
})
</script>

<template>
  <div v-if="film" class="film-page" :class="{ 'is-full': full }">
    <header class="film-bar">
      <a class="film-back" :href="seriesHomeHref('video')" target="_self" aria-label="영상 홈으로"><ReaderIcon name="chevron-left" :size="22" :stroke="1.9" /></a>
    </header>
    <main id="main" tabindex="-1" class="film-main">
      <section ref="frame" class="film-frame" :class="{ 'is-tall': film.height > film.width }" aria-label="영상 플레이어">
        <video ref="media" class="film-video" :src="withBase(film.src)" :poster="withBase(film.poster.src)" :width="film.width" :height="film.height"
          playsinline preload="auto" @loadedmetadata="syncMetadata" @durationchange="syncMetadata" @timeupdate="syncTime"
          @play="syncPlaying" @playing="syncPlaying" @pause="playing = false" @ended="playing = false" @error="mediaFailed" />
        <VideoControls :playing="playing" :failed="failed" :time="time" :duration="duration" :full="full" :reset-key="filmId"
          @play="togglePlay" @skip="skip" @seek="seekTo" @fullscreen="toggleFull" />
      </section>
      <div class="film-copy">
        <h1 class="film-title">{{ film.title }}</h1>
        <EpisodeReactions :page-id="`film-${film.id}`" />
        <OriginalSeriesCard :href="originHref" title-id="film-origin-title" />
      </div>
    </main>
  </div>
  <main v-else id="main" tabindex="-1" class="not-found"><h1>영상을 찾지 못했습니다.</h1><a class="text-link" :href="seriesHomeHref('video')" target="_self">영상 홈으로</a></main>
</template>
