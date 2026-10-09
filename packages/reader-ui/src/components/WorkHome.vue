<script setup lang="ts">
import { computed, ref } from 'vue'
import ReaderIcon from './ReaderIcon.vue'
import { seriesHomeHref, seriesIcons, seriesLinks, type SeriesKey } from '../series/series-tabs.mjs'
import { episodeWindow, type Thumb } from '../series/work-rows.mjs'

export type WorkArt = { src: string; srcset: string; webpSrcset?: string; alt: string; width: number; height: number }
export type WorkRow = {
  id: string
  name: string
  /** No address means the episode is not out in this format yet. */
  href?: string
  thumb?: Thumb
  progress: number
  current: boolean
  actionLabel: string
}
export type WorkAction = { label: string; href?: string }

const props = defineProps<{ series: SeriesKey; title: string; art?: WorkArt; action: WorkAction; rows: WorkRow[] }>()
const emit = defineEmits<{ action: [event: MouseEvent]; select: [event: MouseEvent, row: WorkRow] }>()
const icon = computed(() => seriesIcons[props.series])
const iconSize = computed(() => (props.series === 'video' ? 18 : 20))
const links = computed(() => seriesLinks(props.series))
const expanded = ref(false)
const currentIndex = computed(() => props.rows.findIndex(row => row.current))
const range = computed(() => episodeWindow(props.rows.length, currentIndex.value))
const folded = computed(() => !expanded.value && props.rows.length > range.value.end - range.value.start)
const shown = (index: number) => !folded.value || (index >= range.value.start && index < range.value.end)
</script>

<template>
  <div class="work-home">
    <header class="series-header">
      <a class="series-wordmark" href="/" target="_self">인생원작<span>.</span></a>
      <nav class="series-tabs" aria-label="시리즈">
        <a v-for="link in links" :key="link.key" :href="link.href" target="_self" :aria-current="link.current ? 'page' : undefined">{{ link.label }}</a>
      </nav>
    </header>
    <main id="main" tabindex="-1">
      <section class="work-hero" aria-labelledby="work-title">
        <picture v-if="art" class="work-art">
          <source v-if="art.webpSrcset" type="image/webp" :srcset="art.webpSrcset" sizes="100vw" />
          <img :src="art.src" :srcset="art.srcset" sizes="100vw" :width="art.width" :height="art.height" :alt="art.alt" fetchpriority="high" />
        </picture>
        <a class="work-back" :href="seriesHomeHref(series)" target="_self" aria-label="홈으로"><ReaderIcon name="chevron-left" :size="22" :stroke="1.9" /></a>
        <div class="work-copy">
          <h1 id="work-title">{{ title }}</h1>
          <div class="work-action">
            <a v-if="action.href" class="big-button" :href="action.href" @click="emit('action', $event)"><ReaderIcon :name="icon" :size="iconSize" :stroke="1.9" />{{ action.label }}</a>
            <button v-else type="button" class="big-button is-pending" disabled><ReaderIcon :name="icon" :size="iconSize" :stroke="1.9" />{{ action.label }}</button>
          </div>
        </div>
      </section>
      <section class="work-episodes" aria-labelledby="episodes-title">
        <h2 id="episodes-title">회차</h2>
        <div class="episode-list">
          <template v-for="(row, index) in rows" :key="row.id">
            <a v-if="row.href" :id="`episode-${row.id}`" class="episode-item" :href="row.href" :hidden="!shown(index) || undefined"
              :aria-current="row.current ? 'true' : undefined" @click="emit('select', $event, row)">
              <span class="episode-thumb">
                <picture v-if="row.thumb">
                  <source v-if="row.thumb.webpSrcset" type="image/webp" :srcset="row.thumb.webpSrcset" sizes="(min-width: 900px) 240px, 96px" />
                  <img :src="row.thumb.src" :srcset="row.thumb.srcset" sizes="(min-width: 900px) 240px, 96px" :alt="row.thumb.alt" loading="lazy" decoding="async" width="360" height="203" />
                </picture>
                <span class="episode-progress" aria-hidden="true"><span :style="{ width: `${row.progress}%` }" /></span>
              </span>
              <span class="episode-line">
                <span class="episode-name">{{ row.name }}<span class="sr-only">, {{ row.actionLabel }}</span></span>
                <span class="round-action" :class="{ 'is-current': row.current }" aria-hidden="true"><ReaderIcon :name="icon" :size="iconSize" :stroke="1.9" /></span>
              </span>
            </a>
            <div v-else :id="`episode-${row.id}`" class="episode-item is-waiting" :hidden="!shown(index) || undefined">
              <span class="episode-thumb">
                <picture v-if="row.thumb">
                  <source v-if="row.thumb.webpSrcset" type="image/webp" :srcset="row.thumb.webpSrcset" sizes="(min-width: 900px) 240px, 96px" />
                  <img :src="row.thumb.src" :srcset="row.thumb.srcset" sizes="(min-width: 900px) 240px, 96px" :alt="row.thumb.alt" loading="lazy" decoding="async" width="360" height="203" />
                </picture>
              </span>
              <span class="episode-line">
                <span class="episode-name">{{ row.name }}</span>
                <span class="pending-pill">준비 중</span>
              </span>
            </div>
          </template>
        </div>
        <button v-if="folded" type="button" class="episodes-more" @click="expanded = true">전체 회차 보기</button>
      </section>
    </main>
    <footer class="series-footer"><span>© 2026 duvridge</span><a href="mailto:contact@duvridge.com">문의하기</a></footer>
  </div>
</template>
