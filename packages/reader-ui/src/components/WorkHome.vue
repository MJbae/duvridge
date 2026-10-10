<script setup lang="ts">
import { computed, onMounted } from 'vue'
import ReaderIcon from './ReaderIcon.vue'
import { seriesHomeHref, seriesIcons, seriesLinks, type FormatLink, type SeriesKey } from '../series/series-tabs.mjs'
import type { Thumb } from '../series/work-rows.mjs'

export type WorkArt = { src: string; srcset: string; webpSrcset?: string; alt: string; width: number; height: number }
export type WorkRow = {
  id: string
  /** '3화', '프롤로그'; empty for a page without one. */
  label: string
  title: string
  /** No address means the episode is not out in this format yet. */
  href?: string
  thumb?: Thumb
  progress: number
  current: boolean
  actionLabel: string
}
/** `ariaLabel` names where the button goes when its text is only the format or the verb. */
export type WorkAction = { label: string; href?: string; ariaLabel?: string }
/** The film a reader arrived from, named above the work it was made from. */
export type WorkOrigin = { title: string; image: string; href: string }
/** `formats` switches the same work page between its novel and its audiobook; the list and the button follow it. */
const props = defineProps<{ series: SeriesKey; title: string; art?: WorkArt; action: WorkAction; formats?: FormatLink[]; origin?: WorkOrigin; rows: WorkRow[] }>()
const emit = defineEmits<{ action: [event: MouseEvent]; select: [event: MouseEvent, row: WorkRow] }>()
const icon = computed(() => seriesIcons[props.series])
const iconSize = computed(() => (props.series === 'video' ? 18 : 20))
const links = computed(() => seriesLinks(props.series))
// Every row shows its painting, or none does: one list never mixes the two looks.
const pictured = computed(() => props.rows.length > 0 && props.rows.every(row => row.thumb))

/** Back from an episode, the address names its row; that row comes to the middle of the screen. */
function centerReturnedRow() {
  const id = location.hash.match(/^#episode-([A-Za-z0-9_-]+)$/)?.[1]
  const row = id ? document.getElementById(`episode-${id}`) : null
  row?.scrollIntoView({ block: 'center', behavior: 'instant' })
}
// VitePress scrolls an address's anchor to the top once the page renders; centring follows it.
onMounted(() => requestAnimationFrame(() => requestAnimationFrame(centerReturnedRow)))
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
      <a v-if="origin" class="work-origin" :href="origin.href" target="_self">
        <span class="work-origin-thumb"><img :src="origin.image" alt="" width="80" height="45" /><ReaderIcon name="play" :size="16" :stroke="1.9" /></span>
        <span class="work-origin-text">{{ origin.title }}<span>의 원작</span></span>
      </a>
      <section class="work-hero" aria-labelledby="work-title">
        <picture v-if="art" class="work-art">
          <source v-if="art.webpSrcset" type="image/webp" :srcset="art.webpSrcset" sizes="100vw" />
          <img :src="art.src" :srcset="art.srcset" sizes="100vw" :width="art.width" :height="art.height" :alt="art.alt" fetchpriority="high" />
        </picture>
        <a class="work-back" :href="seriesHomeHref(series)" target="_self" aria-label="홈으로"><ReaderIcon name="chevron-left" :size="22" :stroke="1.9" /></a>
        <div class="work-copy">
          <h1 id="work-title">{{ title }}</h1>
          <nav v-if="formats" class="format-switch" aria-label="형식">
            <a v-for="link in formats" :key="link.key" :href="link.href" target="_self" :aria-current="link.current ? 'page' : undefined">{{ link.label }}</a>
          </nav>
          <div class="work-action">
            <a v-if="action.href" class="big-button" :href="action.href" :aria-label="action.ariaLabel" @click="emit('action', $event)"><ReaderIcon :name="icon" :size="iconSize" :stroke="1.9" />{{ action.label }}</a>
            <button v-else type="button" class="big-button is-pending" disabled><ReaderIcon :name="icon" :size="iconSize" :stroke="1.9" />{{ action.label }}</button>
          </div>
        </div>
      </section>
      <section class="work-episodes" aria-labelledby="episodes-title">
        <h2 id="episodes-title">회차</h2>
        <div class="episode-list" :class="pictured ? 'is-pictured' : 'is-text'">
          <template v-for="row in rows" :key="row.id">
            <a v-if="row.href" :id="`episode-${row.id}`" class="episode-item" :class="{ 'is-current': row.current, 'is-done': row.progress >= 100 }" :href="row.href"
              :aria-current="row.current ? 'true' : undefined" @click="emit('select', $event, row)">
              <span v-if="pictured && row.thumb" class="episode-thumb">
                <picture>
                  <source v-if="row.thumb.webpSrcset" type="image/webp" :srcset="row.thumb.webpSrcset" sizes="(min-width: 900px) 240px, 128px" />
                  <img :src="row.thumb.src" :srcset="row.thumb.srcset" sizes="(min-width: 900px) 240px, 128px" :alt="row.thumb.alt" loading="lazy" decoding="async" width="360" height="203" />
                </picture>
                <span class="episode-progress" aria-hidden="true"><span :style="{ width: `${row.progress}%` }" /></span>
              </span>
              <span class="episode-line">
                <span class="episode-text"><span v-if="row.label" class="episode-label">{{ row.label }}</span><span class="episode-title">{{ row.title }}<span class="sr-only">, {{ row.actionLabel }}</span></span></span>
                <span v-if="row.current" class="round-action is-current" aria-hidden="true"><ReaderIcon :name="icon" :size="iconSize" :stroke="1.9" /></span>
              </span>
              <span v-if="!pictured && row.current" class="episode-progress" aria-hidden="true"><span :style="{ width: `${row.progress}%` }" /></span>
            </a>
            <div v-else :id="`episode-${row.id}`" class="episode-item is-waiting">
              <span v-if="pictured && row.thumb" class="episode-thumb">
                <picture>
                  <source v-if="row.thumb.webpSrcset" type="image/webp" :srcset="row.thumb.webpSrcset" sizes="(min-width: 900px) 240px, 128px" />
                  <img :src="row.thumb.src" :srcset="row.thumb.srcset" sizes="(min-width: 900px) 240px, 128px" :alt="row.thumb.alt" loading="lazy" decoding="async" width="360" height="203" />
                </picture>
              </span>
              <span class="episode-line">
                <span class="episode-text"><span v-if="row.label" class="episode-label">{{ row.label }}</span><span class="episode-title">{{ row.title }}</span></span>
                <span class="pending-pill">준비 중</span>
              </span>
            </div>
          </template>
        </div>
      </section>
    </main>
    <footer class="series-footer"><span>© 2026 duvridge</span><a href="mailto:contact@duvridge.com">문의하기</a></footer>
  </div>
</template>
