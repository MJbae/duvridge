<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ReaderIcon from '@duvridge/reader-ui/components/ReaderIcon.vue'
import EpisodeNext from '@duvridge/reader-ui/components/EpisodeNext.vue'
import { episodeName } from '@duvridge/reader-ui/series/work-rows.mjs'
import { clock, cueIndexAt, spokenTime } from '../../shared/narration-cues.mjs'
import { lyricLines, sceneAt, sceneStarts } from '../../shared/playback-selection.mjs'
import { useCatalogHelpers } from '../lib/reader-catalog'
import { followsHere, narrationKey } from '../lib/narration-controller'
import SceneArt from './SceneArt.vue'
import EpisodeReactions from './EpisodeReactions.vue'
const { catalog, episodeImage, sceneImage, workHome, episodePath, narrationFor } = useCatalogHelpers()

const props = defineProps<{ episodeId: string }>()
const narration = inject(narrationKey)!
const { state } = narration
const captionKey = 'family-library:captions'
const order = catalog.readingOrder
const index = computed(() => order.findIndex(entry => entry.id === props.episodeId))
const episode = computed(() => order[index.value])
const track = computed(() => narrationFor(props.episodeId))
const texts = computed(() => track.value?.texts ?? [])
const duration = computed(() => track.value?.duration ?? 0)
const isCurrent = computed(() => state.active && state.episodeId === props.episodeId)
const time = computed(() => (isCurrent.value ? state.time : state.saved?.id === props.episodeId ? state.saved.time : 0))
const cue = computed(() => (track.value ? cueIndexAt(track.value.cues, time.value) : -1))
const playing = computed(() => isCurrent.value && state.playing)
const failed = computed(() => isCurrent.value && state.failed)
const ended = computed(() => state.ended === props.episodeId)
const caption = computed(() => {
  // At the end the last sentence stays, as the picture stops on the last scene.
  const line = lyricLines(texts.value, ended.value ? texts.value.length - 1 : cue.value).current
  return line >= 0 ? texts.value[line] : ''
})
const imageId = computed(() => (ended.value ? track.value?.scenes.at(-1)?.[1] : sceneAt(track.value?.scenes ?? [], cue.value)))
const image = computed(() => sceneImage(imageId.value) ?? episodeImage(props.episodeId))
const percent = computed(() => (duration.value ? (ended.value ? 100 : (time.value / duration.value) * 100) : 0))
const homeHref = computed(() => workHome(episode.value?.episodeId || props.episodeId))
// The scene list names each painting by what it shows.
const sceneTitle = (id: string) => (id === 'cover' ? catalog.work.title : (sceneImage(id)?.alt ?? '').replace(/^수채화로 그린\s*/, ''))
const scenes = computed(() => (track.value ? sceneStarts(track.value.scenes, track.value.cues) : []).map(scene => ({ ...scene, title: sceneTitle(scene.image) })))
const sceneIndex = computed(() => scenes.value.reduce((found, scene, position) => (scene.start <= time.value ? position : found), 0))
const neighbours = computed(() => [order[index.value - 1], order[index.value], order[index.value + 1]].filter(Boolean).map(entry => ({
  id: entry.id, name: episodeName(entry), playable: Boolean(narrationFor(entry.id)), current: entry.id === props.episodeId,
})))
const next = computed(() => order[index.value + 1])
const nextPlayable = computed(() => (next.value && narrationFor(next.value.id) ? next.value : undefined))
const nextCard = computed(() => (next.value ? { name: episodeName(next.value), image: episodeImage(next.value.id) } : undefined))
const nextAction = computed(() => {
  if (!next.value) return { label: '전체 회차 보기', href: workHome() }
  return nextPlayable.value
    ? { label: `${next.value.label} 보기`, href: episodePath(next.value.id) }
    : { label: `${next.value.label} 보기 · 준비 중` }
})

// Controls appear on a tap and fade three seconds later while the video plays.
const stage = ref<HTMLElement>()
const controls = ref(true)
const captions = ref(true)
const fullRequested = ref(false)
const turned = ref(false)
const full = computed(() => fullRequested.value || turned.value)
let hideTimer: ReturnType<typeof setTimeout> | undefined
let turnQuery: MediaQueryList | undefined
function scheduleHide() {
  clearTimeout(hideTimer)
  if (playing.value) hideTimer = setTimeout(() => { controls.value = false }, 3000)
}
function toggleControls() { controls.value = !controls.value; if (controls.value) scheduleHide() }
function keepControls() { controls.value = true; scheduleHide() }
watch(playing, value => { if (value) scheduleHide(); else { clearTimeout(hideTimer); controls.value = true } })

function togglePlay() {
  keepControls()
  if (failed.value) return narration.retry()
  if (isCurrent.value) narration.toggle()
  else narration.open(props.episodeId)
}
function skip(seconds: number) {
  keepControls()
  if (isCurrent.value) narration.seekBy(seconds)
  else narration.open(props.episodeId, Math.min(duration.value, Math.max(0, time.value + seconds)))
}
function seekTo(value: number) {
  if (isCurrent.value) narration.seek(value)
  else narration.open(props.episodeId, value)
}
function onSeek(event: Event) { keepControls(); seekTo(Number((event.target as HTMLInputElement).value)) }
function toggleCaptions() {
  keepControls()
  captions.value = !captions.value
  try { localStorage.setItem(captionKey, captions.value ? '1' : '0') } catch { /* optional */ }
}
/** The whole screen goes to the video; phones also turn sideways where the browser allows it. */
async function enterFull() {
  fullRequested.value = true
  keepControls()
  try { await stage.value?.requestFullscreen?.() } catch { /* The page itself fills the window instead. */ }
  try { await (screen.orientation as ScreenOrientation & { lock?: (orientation: string) => Promise<void> })?.lock?.('landscape') } catch { /* Not every device turns on request. */ }
}
async function leaveFull() {
  fullRequested.value = false
  try { if (document.fullscreenElement) await document.exitFullscreen() } catch { /* already left */ }
  try { screen.orientation?.unlock?.() } catch { /* nothing locked */ }
}
function onFullscreenChange() { if (!document.fullscreenElement) fullRequested.value = false }
function onTurn(event: MediaQueryListEvent) { turned.value = event.matches }
function goEpisode(event: MouseEvent, id: string) { if (followsHere(event)) narration.open(id) }
function goNext(event: MouseEvent) { if (nextPlayable.value) goEpisode(event, nextPlayable.value.id) }

onMounted(() => {
  try { captions.value = localStorage.getItem(captionKey) !== '0' } catch { /* optional */ }
  turnQuery = window.matchMedia('(orientation: landscape) and (max-height: 500px)')
  turned.value = turnQuery.matches
  turnQuery.addEventListener('change', onTurn)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  scheduleHide()
})
onBeforeUnmount(() => {
  clearTimeout(hideTimer)
  turnQuery?.removeEventListener('change', onTurn)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
})
</script>

<template>
  <div class="theater-page" :class="{ 'is-full': full, 'is-ended': ended }">
    <section ref="stage" class="stage" aria-label="영상 플레이어">
      <div class="stage-frame" @click="toggleControls">
        <Transition name="scene"><SceneArt :key="imageId" class="stage-art" :class="{ 'is-moving': playing }" :image="image" sizes="100vw" eager /></Transition>
      </div>
      <template v-if="!ended">
        <div v-if="controls" class="stage-controls">
          <div class="stage-top">
            <button v-if="fullRequested" type="button" class="stage-icon" aria-label="세로 화면으로" @click="leaveFull"><ReaderIcon name="chevron-left" :size="26" :stroke="2" /></button>
            <a v-else class="stage-icon" :href="homeHref" aria-label="작품 홈으로"><ReaderIcon :name="full ? 'chevron-left' : 'chevron-down'" :size="26" :stroke="2" /></a>
            <span class="stage-title">{{ full ? `${episode.label} ${episode.title}` : '' }}</span>
            <button type="button" class="stage-cc" :aria-pressed="captions" :aria-label="captions ? '자막 끄기' : '자막 켜기'" @click="toggleCaptions">자막</button>
          </div>
          <div class="stage-middle">
            <button type="button" class="stage-skip" aria-label="10초 뒤로" @click="skip(-10)"><ReaderIcon name="back-10" :size="32" :stroke="1.7" /></button>
            <button type="button" class="stage-play" :aria-label="failed ? '다시 시도' : playing ? '일시 정지' : '재생'" @click="togglePlay"><ReaderIcon :name="failed ? 'retry' : playing ? 'pause' : 'play'" :size="30" :stroke="2" /></button>
            <button type="button" class="stage-skip" aria-label="10초 앞으로" @click="skip(10)"><ReaderIcon name="forward-10" :size="32" :stroke="1.7" /></button>
          </div>
          <div class="stage-bottom">
            <div class="stage-row">
              <span class="stage-time">{{ clock(time) }} / {{ clock(duration) }}</span>
              <button v-if="!full" type="button" class="stage-icon" aria-label="가로 전체 화면" @click="enterFull"><ReaderIcon name="expand" :size="22" :stroke="2" /></button>
              <button v-else-if="fullRequested" type="button" class="stage-icon" aria-label="전체 화면 끝내기" @click="leaveFull"><ReaderIcon name="shrink" :size="22" :stroke="2" /></button>
            </div>
            <input class="seek-range stage-seek" type="range" min="0" :max="duration" step="0.1" :value="time" aria-label="재생 위치" :aria-valuetext="spokenTime(time)" :style="{ '--seek': `${percent}%` }" @input="onSeek" />
          </div>
        </div>
        <span v-else class="stage-thin" aria-hidden="true"><span :style="{ width: `${percent}%` }" /></span>
        <p v-if="full && captions && caption" class="stage-caption" aria-live="polite"><span>{{ caption }}</span></p>
      </template>
      <div v-else-if="full" class="stage-end" @pointerdown="narration.cancelAdvance()">
        <button v-if="fullRequested" type="button" class="stage-icon stage-end-back" aria-label="세로 화면으로" @click="leaveFull"><ReaderIcon name="chevron-left" :size="24" :stroke="2" /></button>
        <a v-else class="stage-icon stage-end-back" :href="homeHref" aria-label="작품 홈으로"><ReaderIcon name="chevron-left" :size="24" :stroke="2" /></a>
        <SceneArt v-if="nextCard?.image" class="stage-end-art" :image="nextCard.image" sizes="45vw" />
        <div class="stage-end-side">
          <EpisodeReactions :page-id="episodeId" />
          <EpisodeNext series="video" :next="nextCard ? { name: nextCard.name } : undefined" :action="nextAction" :counting="state.advanceAt > 0" @go="goNext" />
        </div>
      </div>
      <a v-else class="stage-icon stage-end-collapse" :href="homeHref" aria-label="작품 홈으로"><ReaderIcon name="chevron-down" :size="26" :stroke="2" /></a>
    </section>
    <template v-if="!full">
      <div v-if="captions || ended" class="subtitle-band" aria-live="polite"><p>{{ caption }}</p></div>
      <main id="main" tabindex="-1" class="theater-main">
        <template v-if="!ended">
          <div class="theater-heading"><h1>{{ episode.title }}</h1><p>{{ catalog.work.title }} · {{ episode.label }}</p></div>
          <section v-if="scenes.length > 1" class="theater-section" aria-labelledby="scenes-title">
            <h2 id="scenes-title">장면</h2>
            <div class="scene-grid">
              <button v-for="(scene, position) in scenes" :key="scene.image" type="button" class="scene-card" :class="{ 'is-current': position === sceneIndex, 'is-past': position < sceneIndex }"
                :aria-current="position === sceneIndex ? 'true' : undefined" @click="seekTo(scene.start)">
                <span class="scene-thumb"><SceneArt :image="sceneImage(scene.image)" sizes="(min-width: 720px) 320px, 45vw" /><span class="scene-done" aria-hidden="true" /></span>
                <span class="scene-name">{{ position + 1 }} · {{ scene.title }}</span>
              </button>
            </div>
          </section>
          <section class="theater-section" aria-labelledby="theater-episodes-title">
            <h2 id="theater-episodes-title">회차</h2>
            <div class="theater-episodes">
              <template v-for="row in neighbours" :key="row.id">
                <span v-if="row.current" class="theater-episode is-current" aria-current="page">{{ row.name }}</span>
                <a v-else-if="row.playable" class="theater-episode" :href="episodePath(row.id)" @click="goEpisode($event, row.id)">{{ row.name }}</a>
                <span v-else class="theater-episode is-waiting"><span>{{ row.name }}</span><span class="pending-pill">준비 중</span></span>
              </template>
            </div>
          </section>
        </template>
        <div v-else class="theater-end" @pointerdown="narration.cancelAdvance()">
          <EpisodeReactions :page-id="episodeId" />
          <EpisodeNext series="video" :next="nextCard" :action="nextAction" :counting="state.advanceAt > 0" @go="goNext" />
        </div>
      </main>
    </template>
  </div>
</template>
