<script setup lang="ts">
import { computed } from 'vue'
import ReaderIcon from './ReaderIcon.vue'
import { seriesIcons, type SeriesKey } from '../series/series-tabs.mjs'
import type { Thumb } from '../series/work-rows.mjs'

export type NextEpisode = { name: string; image?: Thumb }
/** No address keeps the button in place, dashed and unpressable, until the episode comes out in this format. */
export type NextAction = { label: string; href?: string }
/** While counting, the button fills over the delay before the next episode starts by itself. */
const props = defineProps<{ series: SeriesKey; next?: NextEpisode; action: NextAction; counting?: boolean }>()
const emit = defineEmits<{ go: [event: MouseEvent] }>()
const icon = computed(() => seriesIcons[props.series])
const iconSize = computed(() => (props.series === 'video' ? 18 : 20))
</script>

<template>
  <div class="next-episode">
    <picture v-if="next?.image" class="next-art">
      <source v-if="next.image.webpSrcset" type="image/webp" :srcset="next.image.webpSrcset" sizes="(min-width: 720px) 680px, 100vw" />
      <img :src="next.image.src" :srcset="next.image.srcset" sizes="(min-width: 720px) 680px, 100vw" :alt="next.image.alt" loading="lazy" decoding="async" width="720" height="405" />
    </picture>
    <p v-if="next" class="next-title">{{ next.name }}</p>
    <a v-if="action.href" class="big-button" :class="{ 'is-counting': counting }" :href="action.href" @click="emit('go', $event)"><ReaderIcon :name="icon" :size="iconSize" :stroke="1.9" />{{ action.label }}</a>
    <button v-else type="button" class="big-button is-pending" disabled><ReaderIcon :name="icon" :size="iconSize" :stroke="1.9" />{{ action.label }}</button>
  </div>
</template>
