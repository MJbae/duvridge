<script setup lang="ts">
import { computed } from 'vue'
import ReaderIcon from './ReaderIcon.vue'
import { seriesIcons, type SeriesKey } from '../series/series-tabs.mjs'

/**
 * An episode next to this one. No address with `pending` keeps the button dashed until that episode comes
 * out in this format; no address at all (the first or the last episode) leaves the button dimmed in place.
 */
export type EpisodeLink = { href?: string; pending?: boolean }
/** While counting, 다음 화 fills over the delay before the next episode starts by itself. */
const props = defineProps<{ series: SeriesKey; next?: EpisodeLink; previous?: EpisodeLink; counting?: boolean }>()
const emit = defineEmits<{ go: [event: MouseEvent]; back: [event: MouseEvent] }>()
const icon = computed(() => seriesIcons[props.series])
const iconSize = computed(() => (props.series === 'video' ? 18 : 20))
</script>

<template>
  <nav class="episode-nav" aria-label="회차 이동">
    <a v-if="next?.href" class="big-button" :class="{ 'is-counting': counting }" :href="next.href" @click="emit('go', $event)"><ReaderIcon :name="icon" :size="iconSize" :stroke="1.9" />다음 화</a>
    <button v-else-if="next?.pending" type="button" class="big-button is-pending" disabled><ReaderIcon :name="icon" :size="iconSize" :stroke="1.9" />다음 화 · 준비 중</button>
    <button v-else type="button" class="big-button is-off" disabled><ReaderIcon :name="icon" :size="iconSize" :stroke="1.9" />다음 화</button>
    <a v-if="previous?.href" class="episode-back" :href="previous.href" @click="emit('back', $event)"><ReaderIcon name="chevron-left" :size="18" :stroke="1.9" />이전 화</a>
    <button v-else type="button" class="episode-back" disabled><ReaderIcon name="chevron-left" :size="18" :stroke="1.9" />이전 화</button>
  </nav>
</template>
