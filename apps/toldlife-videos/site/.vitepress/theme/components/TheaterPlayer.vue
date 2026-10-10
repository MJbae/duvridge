<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { withBase } from 'vitepress'
import ReaderIcon from '@duvridge/reader-ui/components/ReaderIcon.vue'
import EpisodeNav from '@duvridge/reader-ui/components/EpisodeNav.vue'
import { episodeThumb } from '@duvridge/reader-ui/series/work-rows.mjs'
import { seriesWorkHref } from '@duvridge/reader-ui/series/series-tabs.mjs'
import { sceneStarts } from '../../shared/playback-selection.mjs'
import { episodeNeighbours, sceneCountLabel } from '../../shared/video-navigation.mjs'
import { useCatalogHelpers } from '../lib/reader-catalog'
import { followsHere, narrationKey, videoElementKey } from '../lib/narration-controller'
import SceneArt from './SceneArt.vue'
import EpisodeReactions from './EpisodeReactions.vue'
import OriginalSeriesCard from './OriginalSeriesCard.vue'
import VideoControls from './VideoControls.vue'
const { catalog, episodeImage, sceneImage, workHome, episodePath, narrationFor } = useCatalogHelpers()

const props = defineProps<{ episodeId: string }>()
const narration = inject(narrationKey)!
const video = inject(videoElementKey)!
const { state } = narration
const episode = computed(() => catalog.readingOrder.find(entry => entry.id === props.episodeId)!)
const track = computed(() => narrationFor(props.episodeId))
const duration = computed(() => track.value?.duration ?? 0)
const isCurrent = computed(() => state.active && state.episodeId === props.episodeId)
const time = computed(() => (isCurrent.value ? state.time : state.saved?.id === props.episodeId ? state.saved.time : 0))
const playing = computed(() => isCurrent.value && state.playing)
const failed = computed(() => isCurrent.value && state.failed)
const ended = computed(() => state.ended === props.episodeId)
// Until it plays, the video shows the episode's painting; its subtitles are already in the picture.
const poster = computed(() => episodeImage(props.episodeId)?.src)
const homeHref = computed(() => workHome(episode.value.episodeId || props.episodeId))
const originHref = computed(() => seriesWorkHref('novel', catalog.work.id))
const sceneTitle = (id: string) => (id === 'cover' ? catalog.work.title : (sceneImage(id)?.alt ?? '').replace(/^수채화로 그린\s*/, ''))
const scenes = computed(() => (track.value ? sceneStarts(track.value.scenes, track.value.cues) : []).map(scene => ({ ...scene, title: sceneTitle(scene.image) })))
const sceneIndex = computed(() => scenes.value.reduce((found, scene, position) => (scene.start <= time.value ? position : found), 0))
const scenesOpen = ref(false)
const neighbours = computed(() => episodeNeighbours(catalog.readingOrder, props.episodeId, id => Boolean(narrationFor(id))))
const previous = computed(() => neighbours.value.previous)
const next = computed(() => neighbours.value.next)
const nextPlayable = computed(() => neighbours.value.nextPlayable)
const nextThumb = computed(() => next.value ? episodeThumb(catalog.illustrations, next.value.episodeId || next.value.id, withBase) : undefined)
const nextLink = computed(() => (nextPlayable.value ? { href: episodePath(nextPlayable.value.id) } : next.value ? { pending: true } : undefined))
const previousLink = computed(() => (previous.value ? { href: episodePath(previous.value.id) } : undefined))
function bindVideo(element: unknown) { video.value = element instanceof HTMLVideoElement ? element : undefined }

const stage = ref<HTMLElement>()
const fullRequested = ref(false)
const turned = ref(false)
const full = computed(() => fullRequested.value || turned.value)
let turnQuery: MediaQueryList | undefined
watch(() => props.episodeId, () => { scenesOpen.value = false })

function togglePlay() {
  if (failed.value) return narration.retry()
  if (ended.value) narration.open(props.episodeId, 0)
  else if (isCurrent.value) narration.toggle()
  else narration.open(props.episodeId)
}
function skip(seconds: number) {
  if (isCurrent.value && !ended.value) narration.seekBy(seconds)
  else narration.open(props.episodeId, Math.min(duration.value, Math.max(0, time.value + seconds)))
}
function seekTo(value: number) {
  if (isCurrent.value && !ended.value) narration.seek(value)
  else narration.open(props.episodeId, value)
}
// Phones also turn sideways where the browser allows it.
async function enterFull() {
  fullRequested.value = true
  try { await stage.value?.requestFullscreen?.() } catch { /* The page itself fills the window instead. */ }
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
function goEpisode(event: MouseEvent, id: string) { if (followsHere(event)) narration.open(id) }
function goNext(event: MouseEvent) { if (nextPlayable.value) goEpisode(event, nextPlayable.value.id) }
function goPrevious(event: MouseEvent) { if (previous.value) goEpisode(event, previous.value.id) }
function cancelAtEnd() { if (ended.value) narration.cancelAdvance() }

onMounted(() => {
  turnQuery = window.matchMedia('(orientation: landscape) and (max-height: 500px)')
  turned.value = turnQuery.matches
  turnQuery.addEventListener('change', onTurn)
  document.addEventListener('fullscreenchange', onFullscreenChange)
})
onBeforeUnmount(() => {
  turnQuery?.removeEventListener('change', onTurn)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  if (fullRequested.value) void leaveFull()
})
</script>

<template>
  <div class="theater-page" :class="{ 'is-full': full, 'is-ended': ended }">
    <header v-if="!full" class="film-bar">
      <a class="film-back" :href="homeHref" aria-label="작품 홈으로"><ReaderIcon name="chevron-left" :size="22" :stroke="1.9" /></a>
    </header>
    <section ref="stage" class="stage" aria-label="영상 플레이어">
      <video :ref="bindVideo" class="stage-video" playsinline webkit-playsinline preload="none" :poster="poster" />
      <template v-if="!ended">
        <VideoControls :playing="playing" :failed="failed" :time="time" :duration="duration" :full="full" :reset-key="episodeId"
          @play="togglePlay" @skip="skip" @seek="seekTo" @fullscreen="toggleFull" />
        <div v-if="full" class="stage-top">
          <button v-if="fullRequested" type="button" class="stage-icon" aria-label="세로 화면으로" @click="leaveFull"><ReaderIcon name="chevron-left" :size="22" :stroke="1.9" /></button>
          <a v-else class="stage-icon" :href="homeHref" aria-label="작품 홈으로"><ReaderIcon name="chevron-left" :size="22" :stroke="1.9" /></a>
          <span class="stage-title">{{ episode.label }} {{ episode.title }}</span>
        </div>
      </template>
      <div v-else-if="full" class="stage-end" @pointerdown="cancelAtEnd" @click="cancelAtEnd">
        <button v-if="fullRequested" type="button" class="stage-icon stage-end-back" aria-label="세로 화면으로" @click="leaveFull"><ReaderIcon name="chevron-left" :size="24" :stroke="2" /></button>
        <a v-else class="stage-icon stage-end-back" :href="homeHref" aria-label="작품 홈으로"><ReaderIcon name="chevron-left" :size="24" :stroke="2" /></a>
        <div class="stage-end-side">
          <EpisodeReactions :page-id="episodeId" />
          <button v-if="state.advanceAt > 0" type="button" class="theater-cancel" @pointerdown.stop @click.stop="narration.cancelAdvance()">자동 다음 화 취소</button>
          <EpisodeNav series="video" :previous="previousLink" :next="nextLink" :counting="state.advanceAt > 0" @go="goNext" @back="goPrevious" />
        </div>
      </div>
    </section>
    <main v-if="!full" id="main" tabindex="-1" class="theater-main">
      <div class="film-copy theater-copy" @pointerdown="cancelAtEnd" @click="cancelAtEnd">
        <div class="theater-heading"><p>{{ episode.label }}</p><h1 class="film-title">{{ episode.title }}</h1></div>
        <EpisodeReactions :page-id="episodeId" />
        <div v-if="ended" class="theater-end">
          <button v-if="state.advanceAt > 0" type="button" class="theater-cancel" @pointerdown.stop @click.stop="narration.cancelAdvance()">자동 다음 화 취소</button>
          <EpisodeNav series="video" :previous="previousLink" :next="nextLink" :counting="state.advanceAt > 0" @go="goNext" @back="goPrevious" />
        </div>
        <section v-if="scenes.length" class="theater-scenes" aria-label="장면 보기">
          <button type="button" class="scene-toggle" :aria-expanded="scenesOpen" aria-controls="scenes-grid" @click="scenesOpen = !scenesOpen">
            {{ sceneCountLabel(scenes.length) }}<ReaderIcon name="caret-down" :size="20" :stroke="2" />
          </button>
          <div v-show="scenesOpen" id="scenes-grid" class="scene-grid">
            <button v-for="(scene, position) in scenes" :key="`${scene.image}-${position}`" type="button" class="scene-card" :class="{ 'is-current': position === sceneIndex, 'is-past': position < sceneIndex }"
              :aria-current="position === sceneIndex ? 'true' : undefined" @click="seekTo(scene.start)">
              <span class="scene-thumb"><SceneArt :image="sceneImage(scene.image)" sizes="(min-width: 720px) 320px, 45vw" /><span class="scene-done" aria-hidden="true" /></span>
              <span class="scene-name">{{ position + 1 }} · {{ scene.title }}</span>
            </button>
          </div>
        </section>
        <section class="theater-next" aria-labelledby="theater-next-title">
          <h2 id="theater-next-title">다음 화</h2>
          <component :is="nextPlayable ? 'a' : 'div'" v-if="next" class="theater-next-card" :class="{ 'is-waiting': !nextPlayable }"
            :href="nextPlayable ? episodePath(nextPlayable.id) : undefined" :aria-disabled="!nextPlayable || undefined" @click="goNext">
            <span class="theater-next-thumb">
              <picture v-if="nextThumb">
                <source v-if="nextThumb.webpSrcset" type="image/webp" :srcset="nextThumb.webpSrcset" sizes="128px" />
                <img :src="nextThumb.src" :srcset="nextThumb.srcset" sizes="128px" alt="" loading="lazy" decoding="async" width="128" height="72" />
              </picture>
              <ReaderIcon v-else name="play" :size="24" />
            </span>
            <span class="theater-next-copy"><span class="episode-label">{{ next.label }}</span><span class="episode-title theater-next-name">{{ next.title }}</span><span v-if="!nextPlayable" class="theater-pending">준비 중</span></span>
            <ReaderIcon name="chevron" :size="22" :stroke="1.9" />
          </component>
          <p v-else class="theater-no-next">다음 화 없음</p>
          <nav class="theater-episode-links" aria-label="전체 회차와 이전 화">
            <a v-if="previous" :href="episodePath(previous.id)" @click="goPrevious"><ReaderIcon name="chevron-left" :size="18" :stroke="2" />이전 화</a>
            <button v-else type="button" disabled><ReaderIcon name="chevron-left" :size="18" :stroke="2" />이전 화 없음</button>
            <a :href="homeHref"><span>전체 회차</span><ReaderIcon name="chevron" :size="18" :stroke="2" /></a>
          </nav>
        </section>
        <OriginalSeriesCard :href="originHref" title-id="theater-origin-title" />
      </div>
    </main>
  </div>
</template>
