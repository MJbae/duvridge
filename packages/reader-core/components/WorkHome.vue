<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useData, withBase } from 'vitepress'
import type { ReaderCatalog, ReaderEpisode } from '../catalog'
import { portraitAlt } from '../shared/portrait.mjs'
import Icon from '@duvridge/reader-core/components/Icon.vue'
import ReadingLink from '@duvridge/reader-core/components/ReadingLink.vue'
import ResponsiveImage from '@duvridge/reader-core/components/ResponsiveImage.vue'
import { coverImageSizes, coverImageSources, imageSrcset } from '../shared/image-sources.mjs'

type NodeState = 'read' | 'current' | 'unread'
const props = withDefaults(defineProps<{ catalog: ReaderCatalog; lastId: string | null; lastFinished: boolean; completed: string[]; showReadingAction?: boolean; returning?: boolean; completedLabel?: string; currentAria?: 'location' | 'true'; unavailableIds?: string[] }>(), { showReadingAction: true, completedLabel: '읽은 회차', currentAria: 'location', returning: undefined, unavailableIds: () => [] })
const catalog = props.catalog
const emit = defineEmits<{ resume: []; episode: [event: MouseEvent, episode: ReaderEpisode] }>()
const hasHistory = computed(() => props.returning ?? Boolean(props.lastId))
const synopsisOpen = ref(false)
watch(() => props.lastId, () => { synopsisOpen.value = false })
// The cover reuses the shared watercolor, so the link preview and the home open on the same painting.
const { site } = useData()
const coverSrcset = (format: 'webp' | 'jpg') =>
  imageSrcset(coverImageSources(format), site.value.base)

const episodes = catalog.readingOrder
// Each place heading of the manuscript becomes a signpost before the first episode under it.
const rows = episodes.map((episode, index) => ({
  episode,
  place: episode.place && episode.place.year !== episodes[index - 1]?.place?.year ? episode.place : null,
}))

const action = computed(() => {
  const index = catalog.readingOrder.findIndex(e => e.id === props.lastId)
  if (index < 0) {
    return { label: '처음부터 읽기', episode: catalog.readingOrder[0], resume: false }
  }
  const last = catalog.readingOrder[index]
  if (!props.lastFinished) {
    return { label: '이어서 읽기', episode: last, resume: true }
  }
  const next = catalog.readingOrder[index + 1]
  if (next) return { label: '다음 화 읽기', episode: next, resume: false }
  const unread = catalog.readingOrder.find(e => !props.completed.includes(e.id))
  return { label: unread ? '아직 읽지 않은 이야기' : '처음부터 다시 읽기', episode: unread || catalog.readingOrder[0], resume: false }
})

// A reread keeps its check; the ring marks only an episode being read for the first time.
// A finished last read counts as read even when a legacy ID kept it out of the completed list.
function nodeState(id: string): NodeState {
  if (props.completed.includes(id)) return 'read'
  if (id !== props.lastId) return 'unread'
  return props.lastFinished ? 'read' : 'current'
}

// The rail is filled between read episodes and up to the one in progress, without a percentage.
// One rail runs through every signpost, from the prologue to the side story.
function railClasses(index: number) {
  const state = nodeState(episodes[index].id)
  const previous = episodes[index - 1]
  const next = episodes[index + 1]
  return {
    'rail-start': !previous,
    'rail-end': !next,
    'rail-before-done': Boolean(previous) && nodeState(previous.id) === 'read' && state !== 'unread',
    'rail-after-done': Boolean(next) && state === 'read' && nodeState(next.id) !== 'unread',
  }
}

// A signpost's diamond fills once its first episode is read or in progress;
// its rail fills with the line into that episode, so the three rail pieces never disagree.
function placeClasses(index: number) {
  return { 'place-reached': nodeState(episodes[index].id) !== 'unread', 'place-rail-done': railClasses(index)['rail-before-done'] }
}
</script>

<template>
  <main id="main" tabindex="-1" class="home-main">
    <section class="home-intro" aria-label="작품 소개">
      <ResponsiveImage class="home-cover" :src="withBase('/images/home-cover-720.jpg')"
        :srcset="coverSrcset('jpg')" :webp-srcset="coverSrcset('webp')" :sizes="coverImageSizes"
        :width="1280" :height="720" :alt="portraitAlt" loading="eager" fetchpriority="high" />
      <header class="home-heading">
        <div class="home-heading-tools"><p class="home-subtitle"><slot name="subtitle">{{ catalog.work.subtitle }}</slot></p><slot name="settings" /></div>
        <h1>{{ catalog.work.title }}</h1>
        <slot name="meta" />
        <p v-if="catalog.work.schedule" class="home-note">{{ catalog.work.schedule }}</p>
      </header>

      <div v-if="hasHistory" class="synopsis-disclosure">
        <button type="button" class="synopsis-toggle" :aria-expanded="synopsisOpen" aria-controls="work-synopsis" @click="synopsisOpen = !synopsisOpen">
          {{ synopsisOpen ? '작품 소개 접기' : '작품 소개 보기' }}<Icon name="chevron" :size="16" />
        </button>
      </div>
      <div id="work-synopsis" class="work-synopsis" :hidden="hasHistory && !synopsisOpen">
        <p v-for="(paragraph, index) in catalog.work.synopsis" :key="paragraph" :class="{ 'synopsis-quote': index === 0 }">{{ paragraph }}</p>
      </div>

      <ReadingLink
        v-if="showReadingAction"
        class="resume-link"
        :href="withBase(action.episode.url)"
        :label="action.label"
        :subtitle="lastId ? `${action.episode.label} ${action.episode.title}` : undefined"
        @click="action.resume && emit('resume')"
      />
    </section>

    <nav class="chapter-list" aria-label="회차 목록">
      <div class="chapter-list-heading"><h2>목차</h2><span>전체 {{ catalog.readingOrder.length }}편</span></div>
      <template v-for="({ episode, place }, index) in rows" :key="episode.id">
        <div v-if="place" class="place-sign" :class="placeClasses(index)">
          <span class="place-rail" aria-hidden="true"><span class="place-mark" /></span>
          <!-- The name stays plain text after the year so the heading reads "1977 남양만 간척지";
               wrapping it in its own element on a new line, or making the heading flex, drops the space. -->
          <h3 :id="`place-${place.year}`" class="place-heading"><span class="place-year">{{ place.year }}</span> {{ place.name }}</h3>
          <slot name="place-status" :place="place" :episodes="episodes.filter(entry => entry.place?.year === place.year)" />
        </div>
        <a
          :id="`episode-${episode.episodeId}`"
          class="chapter-row"
          :class="[
            { 'is-read': completed.includes(episode.id), 'is-current': episode.id === lastId, 'is-unavailable': unavailableIds.includes(episode.id) },
            railClasses(index),
          ]"
          :href="withBase(episode.url)"
          :aria-current="episode.id === lastId ? currentAria : undefined"
          @click="emit('episode', $event, episode); episode.id === lastId && !lastFinished && emit('resume')"
        >
          <span class="chapter-body">
            <span class="chapter-copy">
              <span class="chapter-title">
                <span class="episode-label">{{ episode.label }}</span> {{ episode.title }}
              </span>
              <span class="episode-time">{{ episode.time }}</span>
            </span>
            <slot name="chapter-status" :episode="episode">
            <span class="reading-status">
              <span v-if="episode.id === lastId" class="current-label">{{ lastFinished ? '최근 본 화' : '읽는 중' }}</span>
              <Icon class="chapter-chevron" name="chevron" :size="16" />
            </span>
            </slot>
          </span>
          <!-- The rail is drawn first but read last, so link names still start with the title. -->
          <span class="chapter-rail">
            <span v-if="nodeState(episode.id) === 'read'" class="chapter-node node-read read-label" role="img" :aria-label="completedLabel">
              <Icon name="check" :size="14" :stroke="3" />
            </span>
            <span v-else class="chapter-node" :class="`node-${nodeState(episode.id)}`" aria-hidden="true" />
          </span>
        </a>
      </template>
    </nav>

    <section
      v-if="catalog.documents.length"
      class="documents-section"
      aria-labelledby="documents-title"
    >
      <h2 id="documents-title">함께 읽을 글</h2>
      <a
        v-for="doc in catalog.documents"
        :key="doc.id"
        :href="withBase(doc.url)"
        class="document-row"
      >
        <span>{{ doc.title }}</span><Icon name="chevron" :size="16" />
      </a>
    </section>
  </main>
</template>
