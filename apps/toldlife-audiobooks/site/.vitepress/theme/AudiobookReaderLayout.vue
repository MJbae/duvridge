<script setup lang="ts">
import { computed, onMounted, provide, ref } from 'vue'
import { Content, useData, withBase } from 'vitepress'
import ReaderIcon from '@duvridge/reader-ui/components/ReaderIcon.vue'
import WorkHome, { type WorkRow } from '@duvridge/reader-ui/components/WorkHome.vue'
import { episodeName, episodeThumb, progressPercent } from '@duvridge/reader-ui/series/work-rows.mjs'
import { imageSrcset } from '@duvridge/reader-ui/images/create-image-sources.mjs'
import { listenAction } from '../shared/playback-selection.mjs'
import AudiobookPlayer from './components/AudiobookPlayer.vue'
import TheaterPlayer from './components/TheaterPlayer.vue'
import SceneArt from './components/SceneArt.vue'
import { episodePath, followsHere, narrationFor, narrationKey, useNarration, type NarrationMode } from './lib/narration-controller'
import { catalog, episodeImage } from './lib/reader-catalog'
import { migrateCompleted, migrateReading } from '../shared/reading-history.mjs'
const { frontmatter, page, params, site } = useData()
const isMissing = computed(() => Boolean(page.value.isNotFound))
const view = computed(() => {
  if (isMissing.value) return 'missing'
  if (frontmatter.value.layout === 'home') return 'listen-home'
  if (frontmatter.value.layout === 'watch-home') return 'watch-home'
  if (frontmatter.value.kind === 'redirect') return 'redirect'
  if (frontmatter.value.kind === 'watch') return 'watch'
  return frontmatter.value.kind === 'episode' ? 'listen' : 'missing'
})
const mode = computed<NarrationMode>(() => (view.value === 'watch' || view.value === 'watch-home' ? 'watch' : 'listen'))
const pageEpisode = computed(() => {
  if (view.value === 'watch') return String(params.value?.id || frontmatter.value.pageId || '')
  return view.value === 'listen' ? String(frontmatter.value.pageId || '') : ''
})
const narrationAudio = ref<HTMLAudioElement>()
const completed = ref<string[]>([])
const narration = useNarration({ audio: narrationAudio, page: pageEpisode, mode, onFinish: markCompleted })
provide(narrationKey, narration)
const { state } = narration
const pendingEpisode = computed(() => (view.value === 'listen' && !narrationFor(pageEpisode.value) ? catalog.readingOrder.find(entry => entry.id === pageEpisode.value) : undefined))
function writeStorage(key: string, value: string) { try { localStorage.setItem(key, value) } catch { /* optional */ } }
function readJson(key: string) { try { return JSON.parse(localStorage.getItem(key) || 'null') } catch { return null } }
// Hearing an episode to its end marks it heard, also when the next episode starts on its own.
function markCompleted(id: string) {
  if (completed.value.includes(id)) return
  completed.value = [...completed.value, id]
  writeStorage('family-library:completed', JSON.stringify(completed.value))
}

// The audiobook and the video share one place in the story: where the narration stopped.
const verb = computed(() => (mode.value === 'watch' ? '보기' : '듣기'))
const position = computed(() => (state.active ? { id: state.episodeId, time: state.time } : state.saved))
const action = computed(() => {
  const found = listenAction({ readingOrder: catalog.readingOrder, narration: catalog.narration ?? {}, saved: position.value, completed: completed.value })
  if (!found) return { label: '준비 중', id: '', current: false }
  const episode = catalog.readingOrder.find(entry => entry.id === found.id)!
  const label = { resume: `${episode.label} 이어 ${verb.value}`, next: `${episode.label} ${verb.value}`, start: `처음부터 ${verb.value}`, again: `처음부터 다시 ${verb.value}` }[found.kind]
  return { label, id: found.id, current: found.kind === 'resume' || found.kind === 'next' }
})
const rows = computed<WorkRow[]>(() => catalog.readingOrder.map(entry => {
  const track = narrationFor(entry.id)
  const resume = position.value?.id === entry.id
  const heard = completed.value.includes(entry.id)
  return {
    id: entry.episodeId || entry.id,
    name: episodeName(entry),
    href: track ? episodePath(entry.id, mode.value) : undefined,
    thumb: episodeThumb(catalog.illustrations, entry.episodeId || entry.id, withBase),
    progress: heard && !resume ? 100 : resume && track ? progressPercent(position.value!.time / track.duration) : 0,
    current: action.value.current && action.value.id === entry.id,
    actionLabel: resume ? `이어 ${verb.value}` : verb.value,
  }
}))
const art = computed(() => {
  const cover = catalog.work.cover
  if (!cover) return undefined
  const fallback = cover.src || cover.sources.find(source => source.width === 720)?.src || cover.sources.at(-1)?.src || ''
  return {
    src: withBase(fallback), srcset: imageSrcset(cover.sources, site.value.base),
    webpSrcset: cover.webpSources?.length ? imageSrcset(cover.webpSources, site.value.base) : undefined,
    alt: cover.alt, width: cover.width, height: cover.height,
  }
})
/** Opening an episode plays it at once, inside the same tap; a link opened elsewhere leaves playback alone. */
function openAction(event: MouseEvent) { if (action.value.id && followsHere(event)) narration.open(action.value.id) }
function openRow(event: MouseEvent, row: WorkRow) {
  const entry = catalog.readingOrder.find(candidate => (candidate.episodeId || candidate.id) === row.id)
  if (entry && followsHere(event)) narration.open(entry.id)
}

onMounted(() => {
  completed.value = migrateCompleted(catalog, readJson('family-library:completed'))
  // Earlier visits kept a finished episode only with the reading position; it still counts once.
  const legacy = migrateReading(catalog, readJson('family-library:reading'))
  if (legacy?.finished && !completed.value.includes(legacy.id)) completed.value = [...completed.value, legacy.id]
  writeStorage('family-library:completed', JSON.stringify(completed.value))
})
</script>
<template>
  <div class="library page-theater">
    <a class="skip-link" href="#main">본문으로 건너뛰기</a>
    <audio ref="narrationAudio" class="narration-audio" preload="none" />
    <WorkHome v-if="view === 'listen-home' || view === 'watch-home'" :key="view" :series="mode === 'watch' ? 'video' : 'audio'" :title="catalog.work.title" :art="art"
      :action="{ label: action.label, href: action.id ? episodePath(action.id, mode) : undefined }" :rows="rows" @action="openAction" @select="openRow" />
    <TheaterPlayer v-else-if="view === 'watch'" :key="pageEpisode" :episode-id="pageEpisode" />
    <AudiobookPlayer v-else-if="view === 'listen' && !pendingEpisode" :key="pageEpisode" :episode-id="pageEpisode" />
    <div v-else-if="pendingEpisode" class="listen-page">
      <header class="listen-bar">
        <a class="listen-icon" :href="`${withBase('/')}#episode-${pendingEpisode.episodeId || pendingEpisode.id}`" aria-label="작품 홈으로"><ReaderIcon name="chevron-down" :size="24" :stroke="1.9" /></a>
        <span class="listen-label">{{ pendingEpisode.label }}</span><span class="listen-icon" aria-hidden="true" />
      </header>
      <main id="main" tabindex="-1" class="listen-main">
        <SceneArt class="listen-art" :image="episodeImage(pendingEpisode.id)" sizes="(min-width: 720px) 640px, calc(100vw - 40px)" eager />
        <div class="listen-heading"><h1>{{ pendingEpisode.title }}</h1><p>{{ catalog.work.title }}</p></div>
        <div class="listen-spacer" />
        <button type="button" class="big-button is-pending" disabled><ReaderIcon name="headphones" :size="20" :stroke="1.9" />{{ pendingEpisode.label }} 듣기 · 준비 중</button>
      </main>
    </div>
    <main v-else-if="view === 'redirect'" id="main" class="not-found"><h1>이 이야기의 주소가 바뀌었습니다.</h1><Content /><a class="text-link" :href="withBase(frontmatter.redirect)">이 이야기 듣기</a></main>
    <main v-else id="main" tabindex="-1" class="not-found"><h1>이야기를 찾지 못했습니다.</h1><a class="text-link" :href="withBase('/')">작품 홈으로</a></main>
  </div>
</template>
