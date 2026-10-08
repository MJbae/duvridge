<script setup lang="ts">
import { computed, inject } from 'vue'
import { listenState, type ListenState } from '../../shared/playback-selection.mjs'
import { catalog, type Episode } from '../lib/reader-catalog'
import { followsHere, narrationKey } from '../lib/narration-controller'
import StoryHome from '@duvridge/story-reader/components/StoryHome.vue'
import ReaderIcon from '@duvridge/story-reader/components/ReaderIcon.vue'

const props = defineProps<{ completed: string[] }>()
const narration = inject(narrationKey)!
const { state } = narration
const total = catalog.readingOrder.length
const ready = Object.keys(catalog.narration ?? {}).length
const meta = ready < total ? `${total}편 · 지금 ${ready}편 들을 수 있어요` : `${total}편`

// The episode being heard, or the one left partway, is the current one in the list.
const currentId = computed(() => (state.active ? state.episodeId : state.saved?.id ?? null))
const returning = computed(() => props.completed.length > 0 || currentId.value !== null)
const states = computed(() => {
  const session = state.active ? { id: state.episodeId, playing: state.playing, time: state.time } : null
  return Object.fromEntries(catalog.readingOrder.map(episode => [episode.id, listenState(episode.id, {
    narration: catalog.narration ?? {}, session, saved: state.saved, completed: props.completed,
  })])) as Record<string, ListenState>
})

function listenLabel(status: ListenState) {
  if (status.kind === 'playing') return '재생 중'
  if (status.kind === 'unavailable') return '준비 중'
  return status.kind === 'progress' ? `${status.minutes}분 남음` : `${status.minutes}분`
}

/** Opening an episode that has a recording plays it at once; the link then shows its text. */
function listen(event: MouseEvent, episode: Episode) { if (followsHere(event)) narration.open(episode.id) }
</script>

<template>
  <StoryHome :catalog="catalog" :last-id="currentId" :last-finished="false" :completed="completed"
    :unavailable-ids="catalog.readingOrder.filter(episode => states[episode.id].kind === 'unavailable').map(episode => episode.id)" :show-reading-action="false" :returning="returning" completed-label="재생 완료" current-aria="true" @episode="listen">
    <template #settings><slot name="settings" /></template>
    <template #subtitle>오디오북 · {{ catalog.work.subtitle }}</template>
    <template #meta><p class="home-meta">{{ meta }}</p></template>
    <template #place-status="{ episodes }"><span v-if="episodes.every(episode => completed.includes(episode.id))" class="part-done"><ReaderIcon name="check" :size="15" :stroke="2.4" />재생 완료</span></template>
    <template #chapter-status="{ episode }">
      <span class="chapter-status" :class="`is-${states[episode.id].kind}`">
        <ReaderIcon v-if="states[episode.id].kind === 'playing'" class="chapter-cue" name="wave" :size="18" :stroke="2" />
        <span class="chapter-listen">{{ listenLabel(states[episode.id]) }}</span>
        <ReaderIcon v-if="states[episode.id].kind === 'unavailable'" class="chapter-cue chapter-chevron" name="chevron" :size="16" />
        <span v-else-if="states[episode.id].kind !== 'playing'" class="chapter-cue chapter-play" aria-hidden="true"><ReaderIcon name="play" :size="12" filled :stroke="1.6" /></span>
      </span>
    </template>
  </StoryHome>
</template>
