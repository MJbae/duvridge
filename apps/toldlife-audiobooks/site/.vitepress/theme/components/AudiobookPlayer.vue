<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { withBase } from 'vitepress'
import ReaderIcon from '@duvridge/reader-ui/components/ReaderIcon.vue'
import EpisodeNext from '@duvridge/reader-ui/components/EpisodeNext.vue'
import { episodeName } from '@duvridge/reader-ui/series/work-rows.mjs'
import { clock, cueIndexAt, spokenTime } from '../../shared/narration-cues.mjs'
import { lyricLines, sceneAt, sleepLabel } from '../../shared/playback-selection.mjs'
import { catalog, episodeImage, sceneImage } from '../lib/reader-catalog'
import { episodePath, followsHere, narrationFor, narrationKey } from '../lib/narration-controller'
import SceneArt from './SceneArt.vue'
import EpisodeSheet from './EpisodeSheet.vue'
import EpisodeReactions from './EpisodeReactions.vue'

const props = defineProps<{ episodeId: string }>()
const narration = inject(narrationKey)!
const { state } = narration
const sheet = ref<InstanceType<typeof EpisodeSheet>>()
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
const lines = computed(() => lyricLines(texts.value, cue.value))
const image = computed(() => sceneImage(sceneAt(track.value?.scenes ?? [], cue.value)) ?? episodeImage(props.episodeId))
const homeHref = computed(() => `${withBase('/')}#episode-${episode.value?.episodeId || props.episodeId}`)
const previous = computed(() => order.slice(0, Math.max(0, index.value)).reverse().find(entry => narrationFor(entry.id)))
const next = computed(() => order[index.value + 1])
const nextPlayable = computed(() => (next.value && narrationFor(next.value.id) ? next.value : undefined))
const rateLabel = computed(() => `${state.rate.toFixed(state.rate * 100 % 10 ? 2 : 1)}×`)
// The last three sentences stay on the end screen, the final one bright.
const closing = computed(() => texts.value.map((text, position) => ({ text, position })).filter(entry => entry.text).slice(-3))
const nextCard = computed(() => (next.value ? { name: episodeName(next.value), image: episodeImage(next.value.id) } : undefined))
const nextAction = computed(() => {
  if (!next.value) return { label: '전체 회차 보기', href: withBase('/') }
  return nextPlayable.value
    ? { label: `${next.value.label} 듣기`, href: episodePath(next.value.id, 'listen') }
    : { label: `${next.value.label} 듣기 · 준비 중` }
})

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
</script>

<template>
  <div class="listen-page">
    <header class="listen-bar">
      <a class="listen-icon" :href="homeHref" aria-label="플레이어 접기"><ReaderIcon name="chevron-down" :size="24" :stroke="1.9" /></a>
      <span class="listen-label">{{ episode.label }}</span>
      <button v-if="!ended" type="button" class="listen-icon" aria-label="회차 목록" aria-haspopup="dialog" @click="sheet?.open()"><ReaderIcon name="contents" :size="22" :stroke="1.9" /></button>
      <span v-else class="listen-icon" aria-hidden="true" />
    </header>
    <main id="main" tabindex="-1" class="listen-main">
      <template v-if="!ended">
        <SceneArt class="listen-art" :image="image" sizes="(min-width: 720px) 640px, calc(100vw - 40px)" eager />
        <div class="listen-heading"><h1>{{ episode.title }}</h1><p>{{ catalog.work.title }}</p></div>
        <section class="lyrics" aria-label="낭독 문장">
          <button v-if="lines.previous >= 0" type="button" class="lyric-line" @click="narration.playCue(episodeId, lines.previous)">{{ texts[lines.previous] }}</button>
          <p v-if="lines.current >= 0" class="lyric-current" aria-current="true">{{ texts[lines.current] }}</p>
          <button v-if="lines.next >= 0" type="button" class="lyric-line" @click="narration.playCue(episodeId, lines.next)">{{ texts[lines.next] }}</button>
        </section>
        <div class="listen-spacer" />
        <div class="listen-seek">
          <input class="seek-range" type="range" min="0" :max="duration" step="0.1" :value="time" aria-label="재생 위치" :aria-valuetext="spokenTime(time)"
            :style="{ '--seek': `${duration ? (time / duration) * 100 : 0}%` }" @input="seekTo" />
          <span class="seek-times"><span>{{ clock(time) }}</span><span>{{ clock(duration) }}</span></span>
        </div>
        <div class="transport">
          <a v-if="previous" class="transport-step" :href="episodePath(previous.id, 'listen')" aria-label="이전 회차" @click="goEpisode($event, previous.id)"><ReaderIcon name="previous" :size="22" :stroke="1.9" /></a>
          <span v-else class="transport-step is-off" aria-hidden="true"><ReaderIcon name="previous" :size="22" :stroke="1.9" /></span>
          <button type="button" class="transport-skip" aria-label="10초 뒤로" @click="skip(-10)"><ReaderIcon name="back-10" :size="30" :stroke="1.6" /><span aria-hidden="true">10</span></button>
          <button type="button" class="transport-play" :aria-label="failed ? '다시 시도' : playing ? '일시 정지' : '재생'" @click="togglePlay">
            <ReaderIcon :name="failed ? 'retry' : playing ? 'pause' : 'play'" :size="26" :stroke="2" />
          </button>
          <button type="button" class="transport-skip" aria-label="10초 앞으로" @click="skip(10)"><ReaderIcon name="forward-10" :size="30" :stroke="1.6" /><span aria-hidden="true">10</span></button>
          <a v-if="nextPlayable" class="transport-step" :href="episodePath(nextPlayable.id, 'listen')" aria-label="다음 회차" @click="goEpisode($event, nextPlayable.id)"><ReaderIcon name="next" :size="22" :stroke="1.9" /></a>
          <span v-else class="transport-step is-off" aria-hidden="true"><ReaderIcon name="next" :size="22" :stroke="1.9" /></span>
        </div>
        <div class="listen-tools">
          <button type="button" class="listen-tool" :aria-label="`재생 속도 ${rateLabel}`" @click="narration.cycleRate()"><strong>{{ rateLabel }}</strong><span aria-hidden="true">재생 속도</span></button>
          <button type="button" class="listen-tool" :class="{ 'is-on': state.sleep !== 0 }" :aria-label="`타이머 ${sleepLabel(state.sleep)}`" @click="narration.cycleSleep()"><ReaderIcon name="moon" :size="18" :stroke="1.9" /><span aria-hidden="true">{{ sleepLabel(state.sleep) }}</span></button>
        </div>
      </template>
      <template v-else>
        <section class="lyrics is-closing" aria-label="마지막 낭독 문장">
          <p v-for="(entry, position) in closing" :key="entry.position" :class="position === closing.length - 1 ? 'lyric-current' : 'lyric-line'">{{ entry.text }}</p>
        </section>
        <div class="listen-spacer" @pointerdown="narration.cancelAdvance()" />
        <div class="listen-end" @pointerdown="narration.cancelAdvance()">
          <EpisodeReactions :page-id="episodeId" />
          <EpisodeNext series="audio" :next="nextCard" :action="nextAction" :counting="state.advanceAt > 0" @go="goNext" />
        </div>
      </template>
    </main>
    <EpisodeSheet ref="sheet" :current="episodeId" mode="listen" @choose="id => narration.open(id)" />
  </div>
</template>
