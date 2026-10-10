<script setup lang="ts">
import { computed } from 'vue'
import { withBase } from 'vitepress'
import ReaderIcon from '@duvridge/reader-ui/components/ReaderIcon.vue'
import { seriesHomeHref, seriesWorkHref } from '@duvridge/reader-ui/series/series-tabs.mjs'
import EpisodeReactions from './EpisodeReactions.vue'
import { useCatalog } from '../lib/reader-catalog'

const props = defineProps<{ filmId: string }>()
const catalog = useCatalog()
const film = computed(() => catalog.films.find(entry => entry.id === props.filmId))
// A film leads back to its whole original work, never to one episode: the novel page, told where the reader came from.
const originHref = computed(() => `${seriesWorkHref('novel', catalog.work.id)}?from=${encodeURIComponent(props.filmId)}`)
const cover = computed(() => {
  const sources = catalog.work.cover?.sources ?? []
  const source = sources.find(entry => entry.width >= 360) ?? sources[0]
  return source ? withBase(source.src) : undefined
})
</script>

<template>
  <div v-if="film" class="film-page">
    <header class="film-bar">
      <a class="film-back" :href="seriesHomeHref('video')" target="_self" aria-label="영상 홈으로"><ReaderIcon name="chevron-left" :size="22" :stroke="1.9" /></a>
    </header>
    <main id="main" tabindex="-1" class="film-main">
      <div class="film-frame" :class="{ 'is-tall': film.height > film.width }">
        <video class="film-video" :src="withBase(film.src)" :poster="withBase(film.poster.src)" :width="film.width" :height="film.height"
          controls playsinline preload="metadata" />
      </div>
      <div class="film-copy">
        <h1 class="film-title">{{ film.title }}</h1>
        <EpisodeReactions :page-id="`film-${film.id}`" />
        <section class="film-origin" aria-labelledby="film-origin-title">
          <h2 id="film-origin-title">원작</h2>
          <a class="film-origin-card" :href="originHref" target="_self">
            <img v-if="cover" class="film-origin-cover" :src="cover" alt="" width="72" height="108" loading="lazy" />
            <span class="film-origin-title">{{ catalog.work.title }}</span>
            <ReaderIcon name="chevron" :size="22" :stroke="1.9" />
          </a>
        </section>
      </div>
    </main>
  </div>
  <main v-else id="main" tabindex="-1" class="not-found"><h1>영상을 찾지 못했습니다.</h1><a class="text-link" :href="seriesHomeHref('video')" target="_self">영상 홈으로</a></main>
</template>
