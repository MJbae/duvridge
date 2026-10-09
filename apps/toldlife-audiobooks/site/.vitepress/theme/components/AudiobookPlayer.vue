<script setup lang="ts">
import { computed, inject, nextTick, onMounted, ref, watch } from 'vue'
import ReaderIcon from '@duvridge/reader-ui/components/ReaderIcon.vue'
import EpisodeNav from '@duvridge/reader-ui/components/EpisodeNav.vue'
import { clock, cueIndexAt, spokenTime } from '../../shared/narration-cues.mjs'
import { lyricLines, sceneAt, sleepLabel } from '../../shared/playback-selection.mjs'
import { useCatalogHelpers } from '../lib/reader-catalog'
import { followsHere, narrationKey } from '../lib/narration-controller'
import SceneArt from './SceneArt.vue'
import EpisodeReactions from './EpisodeReactions.vue'
const { catalog, episodeImage, sceneImage, workHome, episodePath, narrationFor } = useCatalogHelpers()

const props = defineProps<{ episodeId: string }>()
const narration = inject(narrationKey)!
const { state } = narration
const order = catalog.readingOrder
const index = computed(() => order.findIndex(entry => entry.id === props.episodeId))
const episode = computed(() => order[index.value])
const track = computed(() => narrationFor(props.episodeId))
const texts = computed(() => track.value?.texts ?? [])
const duration = computed(() => track.value?.duration ?? 0)
// The page shows its own episode: the one playing, or where the listener left it.
const isCurrent = computed(() => state.active && state.episodeId === props.episodeId)
const time = computed(() => (isCurrent.value ? state.time : state.saved?.id === props.episodeId ? state.saved.time : 0))
const cue = computed(() => (track.value ? cueIndexAt(track.value.cues, time.value) : -1))
const playing = computed(() => isCurrent.value && state.playing)
const failed = computed(() => isCurrent.value && state.failed)
const ended = computed(() => state.ended === props.episodeId)
const current = computed(() => lyricLines(texts.value, cue.value).current)
const image = computed(() => sceneImage(sceneAt(track.value?.scenes ?? [], cue.value)) ?? episodeImage(props.episodeId))
const homeHref = computed(() => workHome(episode.value?.episodeId || props.episodeId))
const previous = computed(() => order.slice(0, Math.max(0, index.value)).reverse().find(entry => narrationFor(entry.id)))
const next = computed(() => order[index.value + 1])
const nextPlayable = computed(() => (next.value && narrationFor(next.value.id) ? next.value : undefined))
const rateLabel = computed(() => `${state.rate.toFixed(state.rate * 100 % 10 ? 2 : 1)}×`)
// The whole episode is on screen as lines; at the end the last one stays bright.
const spoken = computed(() => texts.value.map((text, position) => ({ text, position })).filter(entry => entry.text))
const lastSpoken = computed(() => spoken.value.at(-1)?.position ?? -1)
// 다음 화 waits dashed until it is recorded; there is nothing before the first episode or after the last.
const nextLink = computed(() => (nextPlayable.value ? { href: episodePath(nextPlayable.value.id) } : next.value ? { pending: true } : undefined))
const previousLink = computed(() => (previous.value ? { href: episodePath(previous.value.id) } : undefined))

// The sentence being heard stays a third of the way down. A listener scrolling the text keeps it a moment.
const lyrics = ref<HTMLElement>()
let touchedAt = 0
function follow(smooth: boolean) {
  const box = lyrics.value
  const line = box?.querySelector<HTMLElement>('[aria-current="true"]')
  if (!box || !line || Date.now() - touchedAt < 4000) return
  box.scrollTo({ top: Math.max(0, line.offsetTop - box.clientHeight / 3), behavior: smooth ? 'smooth' : 'instant' })
}
function touched() { touchedAt = Date.now() }
watch(current, () => { void nextTick(() => follow(true)) })
watch(() => props.episodeId, () => { touchedAt = 0; void nextTick(() => follow(false)) })
watch(ended, value => { if (!value) void nextTick(() => follow(false)) })
onMounted(() => follow(false))

function togglePlay() {
  if (failed.value) return narration.retry()
  if (isCurrent.value) narration.toggle()
  else narration.open(props.episodeId)
}
function skip(seconds: number) {
  if (isCurrent.value) narration.seekBy(seconds)
  else narration.open(props.episodeId, Math.min(duration.value, Math.max(0, time.value + seconds)))
}
function seekTo(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  if (isCurrent.value) narration.seek(value)
  else narration.open(props.episodeId, value)
}
function goEpisode(event: MouseEvent, id: string) { if (followsHere(event)) narration.open(id) }
function goNext(event: MouseEvent) { if (nextPlayable.value) goEpisode(event, nextPlayable.value.id) }
function goPrevious(event: MouseEvent) { if (previous.value) goEpisode(event, previous.value.id) }
</script>

<template>
  <div class="listen-page">
    <header class="listen-bar">
      <a class="listen-icon" :href="homeHref" aria-label="플레이어 접기"><ReaderIcon name="chevron-down" :size="24" :stroke="1.9" /></a>
      <span class="listen-label">{{ episode.label }}</span>
      <span class="listen-icon" aria-hidden="true" />
    </header>
    <main id="main" tabindex="-1" class="listen-main">
      <template v-if="!ended">
        <div class="listen-heading">
          <SceneArt class="listen-art" :image="image" sizes="112px" eager />
          <div class="listen-titles"><h1>{{ episode.title }}</h1><p>{{ catalog.work.title }}</p></div>
        </div>
        <section ref="lyrics" class="lyrics" aria-label="낭독 문장" @wheel.passive="touched" @touchmove.passive="touched">
          <template v-for="line in spoken" :key="line.position">
            <p v-if="line.position === current" class="lyric-current" aria-current="true">{{ line.text }}</p>
            <button v-else type="button" class="lyric-line" @click="narration.playCue(episodeId, line.position)">{{ line.text }}</button>
          </template>
        </section>
        <div class="listen-seek">
          <input class="seek-range" type="range" min="0" :max="duration" step="0.1" :value="time" aria-label="재생 위치" :aria-valuetext="spokenTime(time)"
            :style="{ '--seek': `${duration ? (time / duration) * 100 : 0}%` }" @input="seekTo" />
          <span class="seek-times"><span>{{ clock(time) }}</span><span>{{ clock(duration) }}</span></span>
        </div>
        <div class="transport">
          <a v-if="previous" class="transport-step" :href="episodePath(previous.id)" aria-label="이전 회차" @click="goEpisode($event, previous.id)"><ReaderIcon name="previous" :size="22" :stroke="1.9" /></a>
          <span v-else class="transport-step is-off" aria-hidden="true"><ReaderIcon name="previous" :size="22" :stroke="1.9" /></span>
          <button type="button" class="transport-skip" aria-label="10초 뒤로" @click="skip(-10)"><ReaderIcon name="back-10" :size="30" :stroke="1.6" /><span aria-hidden="true">10</span></button>
          <button type="button" class="transport-play" :aria-label="failed ? '다시 시도' : playing ? '일시 정지' : '재생'" @click="togglePlay">
            <ReaderIcon :name="failed ? 'retry' : playing ? 'pause' : 'play'" :size="26" :stroke="2" />
          </button>
          <button type="button" class="transport-skip" aria-label="10초 앞으로" @click="skip(10)"><ReaderIcon name="forward-10" :size="30" :stroke="1.6" /><span aria-hidden="true">10</span></button>
          <a v-if="nextPlayable" class="transport-step" :href="episodePath(nextPlayable.id)" aria-label="다음 회차" @click="goEpisode($event, nextPlayable.id)"><ReaderIcon name="next" :size="22" :stroke="1.9" /></a>
          <span v-else class="transport-step is-off" aria-hidden="true"><ReaderIcon name="next" :size="22" :stroke="1.9" /></span>
        </div>
        <div class="listen-tools">
          <button type="button" class="listen-tool" :aria-label="`재생 속도 ${rateLabel}`" @click="narration.cycleRate()"><strong>{{ rateLabel }}</strong><span aria-hidden="true">재생 속도</span></button>
          <button type="button" class="listen-tool" :class="{ 'is-on': state.sleep !== 0 }" :aria-label="`타이머 ${sleepLabel(state.sleep)}`" @click="narration.cycleSleep()"><ReaderIcon name="moon" :size="18" :stroke="1.9" /><span aria-hidden="true">{{ sleepLabel(state.sleep) }}</span></button>
        </div>
      </template>
      <template v-else>
        <section class="lyrics is-closing" aria-label="마지막 낭독 문장">
          <p v-for="line in spoken" :key="line.position" :class="line.position === lastSpoken ? 'lyric-current' : 'lyric-line'">{{ line.text }}</p>
        </section>
        <div class="listen-end" @pointerdown="narration.cancelAdvance()">
          <EpisodeReactions :page-id="episodeId" />
          <EpisodeNav series="audio" :previous="previousLink" :next="nextLink" :counting="state.advanceAt > 0" @go="goNext" @back="goPrevious" />
        </div>
      </template>
    </main>
  </div>
</template>
