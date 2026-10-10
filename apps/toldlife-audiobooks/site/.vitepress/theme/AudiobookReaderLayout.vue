<script setup lang="ts">
import { workStorageKey, migrateWorkStorage } from '@duvridge/reader-ui/state/work-storage.mjs'
import { computed, onMounted, provide, ref, watch } from 'vue'
import { useData, withBase } from 'vitepress'
import ReaderIcon from '@duvridge/reader-ui/components/ReaderIcon.vue'
import WorkHome, { type WorkRow } from '@duvridge/reader-ui/components/WorkHome.vue'
import { episodeThumb, progressPercent } from '@duvridge/reader-ui/series/work-rows.mjs'
import { formatLinks } from '@duvridge/reader-ui/series/series-tabs.mjs'
import { imageSrcset } from '@duvridge/reader-ui/images/create-image-sources.mjs'
import { listenAction } from '../shared/playback-selection.mjs'
import AudiobookPlayer from './components/AudiobookPlayer.vue'
import SceneArt from './components/SceneArt.vue'
import { followsHere, narrationKey, useNarration, type NarrationMode } from './lib/narration-controller'
import { useCatalogHelpers } from './lib/reader-catalog'
import { migrateCompleted, migrateReading } from '../shared/reading-history.mjs'
const { catalog, episodeImage, workHome, episodePath, narrationFor } = useCatalogHelpers()
const key = (kind: string) => workStorageKey(catalog.work.id, kind)
const { frontmatter, page, site } = useData()
// This app owns audiobook playback; the video app owns its separate theater layout.
const mode = computed<NarrationMode>(() => 'listen')
const isMissing = computed(() => Boolean(page.value.isNotFound))
const view = computed(() => {
  if (isMissing.value) return 'missing'
  if (frontmatter.value.layout === 'home') return 'home'
  if (frontmatter.value.kind === 'redirect') return 'redirect'
  return frontmatter.value.kind === 'episode' ? 'episode' : 'missing'
})
const pageEpisode = computed(() => (view.value === 'episode' ? String(frontmatter.value.pageId || '') : ''))
const narrationAudio = ref<HTMLAudioElement>()
const completed = ref<string[]>([])
const narration = useNarration({ audio: narrationAudio, page: pageEpisode, mode, onFinish: markCompleted })
provide(narrationKey, narration)
const { state } = narration
const pendingEpisode = computed(() => (view.value === 'episode' && !narrationFor(pageEpisode.value) ? catalog.readingOrder.find(entry => entry.id === pageEpisode.value) : undefined))
function writeStorage(key: string, value: string) { try { localStorage.setItem(key, value) } catch { /* optional */ } }
function readJson(key: string) { try { return JSON.parse(localStorage.getItem(key) || 'null') } catch { return null } }
// Hearing an episode to its end marks it heard, also when the next episode starts on its own.
function markCompleted(id: string) {
  if (completed.value.includes(id)) return
  completed.value = [...completed.value, id]
  writeStorage(key('completed'), JSON.stringify(completed.value))
}

// The audiobook and the video share one place in the story: where the narration stopped.
const verb = computed(() => (mode.value === 'watch' ? '보기' : '듣기'))
const position = computed(() => (state.active ? { id: state.episodeId, time: state.time } : state.saved))
const action = computed(() => {
  const found = listenAction({ readingOrder: catalog.readingOrder, narration: catalog.narration ?? {}, saved: position.value, completed: completed.value })
  if (!found) return { label: '준비 중', spoken: '준비 중', id: '', current: false }
  const episode = catalog.readingOrder.find(entry => entry.id === found.id)!
  // The button says only the verb; the episode it opens stays in its spoken name and on the list.
  const label = { resume: `이어 ${verb.value}`, next: `이어 ${verb.value}`, start: verb.value, again: `다시 ${verb.value}` }[found.kind]
  const spoken = { resume: `${episode.label} 이어 ${verb.value}`, next: `${episode.label}부터 이어 ${verb.value}`, start: `처음부터 ${verb.value}`, again: `처음부터 다시 ${verb.value}` }[found.kind]
  return { label, spoken, id: found.id, current: found.kind === 'resume' || found.kind === 'next' }
})
// The audiobook is the other half of the work page; the switch leads back to the novel.
const formats = formatLinks(catalog.work.id, 'audio')
const rows = computed<WorkRow[]>(() => catalog.readingOrder.map(entry => {
  const track = narrationFor(entry.id)
  const resume = position.value?.id === entry.id
  const heard = completed.value.includes(entry.id)
  return {
    id: entry.episodeId || entry.id,
    label: entry.label,
    title: entry.title,
    href: track ? episodePath(entry.id) : undefined,
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

// Back on the episode list, the recording stops; its place is kept for 이어 듣기.
watch(view, value => { if (value === 'home' && state.active) narration.stop() })

onMounted(() => {
  try { migrateWorkStorage(localStorage, catalog.work) } catch { /* Browser storage is optional. */ }
  completed.value = migrateCompleted(catalog, readJson(key('completed')))
  // Earlier visits kept a finished episode only with the reading position; it still counts once.
  const legacy = migrateReading(catalog, readJson(key('reading')))
  if (legacy?.finished && !completed.value.includes(legacy.id)) completed.value = [...completed.value, legacy.id]
  writeStorage(key('completed'), JSON.stringify(completed.value))
})
</script>
<template>
  <div class="library page-theater">
    <a class="skip-link" href="#main">본문으로 건너뛰기</a>
    <audio ref="narrationAudio" class="narration-audio" preload="none" />
    <WorkHome v-if="view === 'home'" :series="mode === 'watch' ? 'video' : 'audio'" :title="catalog.work.title" :art="art" :formats="formats"
      :action="{ label: action.label, ariaLabel: action.spoken, href: action.id ? episodePath(action.id) : undefined }" :rows="rows" @action="openAction" @select="openRow" />
    <AudiobookPlayer v-else-if="view === 'episode' && !pendingEpisode" :key="pageEpisode" :episode-id="pageEpisode" />
    <div v-else-if="pendingEpisode" class="listen-page">
      <header class="listen-bar">
        <a class="listen-icon" :href="workHome(pendingEpisode.episodeId || pendingEpisode.id)" aria-label="작품 홈으로"><ReaderIcon name="chevron-down" :size="24" :stroke="1.9" /></a>
        <span class="listen-label">{{ pendingEpisode.label }}</span><span class="listen-icon" aria-hidden="true" />
      </header>
      <main id="main" tabindex="-1" class="listen-main">
        <div class="listen-heading">
          <SceneArt class="listen-art" :image="episodeImage(pendingEpisode.id)" sizes="112px" eager />
          <div class="listen-titles"><h1>{{ pendingEpisode.title }}</h1><p>{{ catalog.work.title }}</p></div>
        </div>
        <div class="listen-spacer" />
        <button type="button" class="big-button is-pending" disabled><ReaderIcon :name="mode === 'watch' ? 'play' : 'headphones'" :size="20" :stroke="1.9" />{{ pendingEpisode.label }} {{ verb }} · 준비 중</button>
      </main>
    </div>
    <main v-else-if="view === 'redirect'" id="main" class="not-found"><h1>홈으로 이동합니다.</h1><a class="text-link" :href="frontmatter.redirectTo" target="_self">홈으로</a></main>
    <main v-else id="main" tabindex="-1" class="not-found"><h1>이야기를 찾지 못했습니다.</h1><a class="text-link" :href="workHome()">작품 홈으로</a></main>
  </div>
</template>
