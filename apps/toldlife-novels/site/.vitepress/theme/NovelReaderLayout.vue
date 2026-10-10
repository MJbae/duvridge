<script setup lang="ts">
import { workStorageKey, migrateWorkStorage } from '@duvridge/reader-ui/state/work-storage.mjs'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Content, useData, useRoute, useRouter, withBase } from 'vitepress'
import ReaderIcon from '@duvridge/reader-ui/components/ReaderIcon.vue'
import ReaderSheet from '@duvridge/reader-ui/components/ReaderSheet.vue'
import ReaderSettingsButton from '@duvridge/reader-ui/components/ReaderSettingsButton.vue'
import WorkHome, { type WorkRow } from '@duvridge/reader-ui/components/WorkHome.vue'
import { episodeName, episodeThumb, progressPercent } from '@duvridge/reader-ui/series/work-rows.mjs'
import { formatLinks } from '@duvridge/reader-ui/series/series-tabs.mjs'
import { imageSrcset } from '@duvridge/reader-ui/images/create-image-sources.mjs'
import NovelEpisodeEnd from './components/NovelEpisodeEnd.vue'
import BackgroundMusicToggle from './components/BackgroundMusicToggle.vue'
import { useBackgroundMusic } from './lib/background-music'
import { useCatalog, type Episode } from './lib/reader-catalog'
import { migrateReading, migrateCompleted, type SavedReading } from '../shared/reading-history.mjs'
const catalog = useCatalog()
const key = (kind: string) => workStorageKey(catalog.work.id, kind)
const { frontmatter, page, site } = useData()
const route = useRoute()
const router = useRouter()
const previousBeforeLoad = router.onBeforePageLoad
const isHome = computed(() => frontmatter.value.layout === 'home')
const isMissing = computed(() => Boolean(page.value.isNotFound))
// Every page read as text (episodes, and any document a book adds) is paper or night.
const isReading = computed(() => !isHome.value && !isMissing.value && frontmatter.value.kind !== 'redirect')
const isEpisode = computed(() => isReading.value && frontmatter.value.kind === 'episode')
// Music belongs to reading; the work page stays quiet.
const musicTrack = computed(() => (isEpisode.value ? catalog.music?.episodes[String(frontmatter.value.episodeId || '')] : undefined))
const { audio: musicAudio, enabled: musicEnabled, status: musicStatus, setEnabled: setMusicEnabled, retry: retryMusic } = useBackgroundMusic(musicTrack)
const pageId = computed(() => String(frontmatter.value.pageId || ''))
const episode = computed(() => catalog.readingOrder.find(entry => entry.id === pageId.value))
const barTitle = computed(() => (episode.value ? episodeName(episode.value) : String(frontmatter.value.title || '이야기')))
// The work's home is its folder; the series root itself belongs to the platform home.
const workHome = withBase(`/${catalog.work.id}/`)
const homeHref = computed(() => workHome + (frontmatter.value.episodeId ? `#episode-${frontmatter.value.episodeId}` : ''))
const fontSize = ref(1)
const screenMode = ref('auto')
const prefersNight = ref(false)
const isNight = computed(() => screenMode.value === 'dark' || (screenMode.value === 'auto' && prefersNight.value))
const lastRead = ref<SavedReading | null>(null)
const completed = ref<string[]>([])
const lastFinished = computed(() => lastRead.value?.finished ?? completed.value.includes(lastRead.value?.id || ''))
const chrome = ref(true)
const progress = ref(0)
const settings = ref<InstanceType<typeof ReaderSheet>>()
const storageKey = key('reading')
let activeEpisode: Episode | undefined, activeScroll = 0, activeFinished = false, version = 0
let saveTimer: ReturnType<typeof setTimeout> | undefined
let mounted = false
let nightQuery: MediaQueryList | undefined
function readStorage(key: string) { try { return localStorage.getItem(key) } catch { return null } }
function writeStorage(key: string, value: string) { try { localStorage.setItem(key, value) } catch { /* optional */ } }
function readJson(key: string) { try { return JSON.parse(readStorage(key) || 'null') } catch { return null } }
function restoreReading(key: string) {
  const migrated = migrateReading(catalog, readJson(key))
  if (!migrated) return null
  const saved = { ...migrated, url: withBase(migrated.url) }
  writeStorage(key, JSON.stringify(saved))
  return saved
}
function measureProgress() {
  const room = document.documentElement.scrollHeight - window.innerHeight
  progress.value = room > 0 ? Math.min(1, Math.max(0, window.scrollY / room)) : 1
}
function saveReading() {
  if (!activeEpisode) return
  const saved = { id: activeEpisode.id, title: activeEpisode.title, url: withBase(activeEpisode.url), scroll: Math.max(0, activeScroll), finished: activeFinished, progress: Math.round(progress.value * 1000) / 1000 }
  writeStorage(storageKey, JSON.stringify(saved)); lastRead.value = saved
}
function onScroll() {
  if (!activeEpisode) return
  activeScroll = window.scrollY
  measureProgress()
  clearTimeout(saveTimer); saveTimer = setTimeout(saveReading, 250)
}
function pagehide() { activeScroll = window.scrollY; saveReading() }
function complete() {
  if (!activeEpisode) return
  activeFinished = true
  if (!completed.value.includes(activeEpisode.id)) {
    completed.value = [...completed.value, activeEpisode.id]
    writeStorage(key('completed'), JSON.stringify(completed.value))
  }
  saveReading()
}
function resumeReading() { if (lastRead.value) writeStorage(key('resume'), JSON.stringify(lastRead.value)) }
function setFont(size: number) { fontSize.value = Math.min(3, Math.max(0, size)); writeStorage('family-library:font', String(fontSize.value)) }
function setMode(mode: string) {
  screenMode.value = mode
  document.documentElement.dataset.theme = mode
  writeStorage('family-library:theme', mode)
  syncThemeColor()
}
/** The browser bar takes the colour of the page under it: theater, paper or night. */
function syncThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]')
  if (!meta) return
  meta.setAttribute('content', !isReading.value ? '#111318' : isNight.value ? '#16171b' : '#f5f2eb')
}
/** A tap on the text shows or hides the bars; taps on links, buttons and selections are left alone. */
function toggleChrome(event: MouseEvent) {
  const target = event.target instanceof Element ? event.target : null
  if (target?.closest('a, button, input, label, dialog, .reaction-options') || !window.getSelection()?.isCollapsed) return
  chrome.value = !chrome.value
}

// The big button says only 읽기, 이어 읽기 or 다시 읽기; the episode it opens (where the reader stopped,
// the next one, or the start) is its spoken name and the marked row.
const action = computed(() => {
  const order = catalog.readingOrder
  const index = order.findIndex(entry => entry.id === lastRead.value?.id)
  if (index < 0) return { label: '읽기', spoken: '처음부터 읽기', episode: order[0], resume: false, current: false }
  const last = order[index]
  if (!lastFinished.value) return { label: '이어 읽기', spoken: `${last.label} 이어 읽기`, episode: last, resume: true, current: true }
  const next = order[index + 1] ?? order.find(entry => !completed.value.includes(entry.id))
  return next
    ? { label: '이어 읽기', spoken: `${next.label}부터 이어 읽기`, episode: next, resume: false, current: true }
    : { label: '다시 읽기', spoken: '처음부터 다시 읽기', episode: order[0], resume: false, current: false }
})
const rows = computed<WorkRow[]>(() => catalog.readingOrder.map(entry => {
  const reading = lastRead.value?.id === entry.id && !lastFinished.value
  const current = action.value.current && action.value.episode.id === entry.id
  return {
    id: entry.episodeId || entry.id,
    label: entry.label,
    title: entry.title,
    href: withBase(entry.url),
    thumb: episodeThumb(catalog.illustrations, entry.episodeId || entry.id, withBase),
    progress: completed.value.includes(entry.id) ? 100 : reading ? progressPercent(lastRead.value?.progress ?? 0) : 0,
    current,
    actionLabel: reading ? '이어 읽기' : '읽기',
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
// The work page switches between its novel (this page) and its audiobook; the novel leads.
const formats = formatLinks(catalog.work.id, 'novel')
function openAction() { if (action.value.resume) resumeReading() }
function openRow(_event: MouseEvent, row: WorkRow) { if (row.current && action.value.resume) resumeReading() }

async function setupPage() {
  const current = ++version
  clearTimeout(saveTimer); saveReading(); activeEpisode = undefined
  settings.value?.close()
  chrome.value = true
  await nextTick()
  syncThemeColor()
  if (current !== version) return
  activeEpisode = isEpisode.value ? catalog.readingOrder.find(entry => entry.id === pageId.value) : undefined
  if (!activeEpisode) return
  activeScroll = 0
  activeFinished = false
  progress.value = 0
  try {
    const saved = restoreReading(key('resume'))
    if (saved?.id === activeEpisode.id && Number.isFinite(saved.scroll)) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      if (current !== version) return
      window.scrollTo({ top: Math.max(0, saved.scroll), behavior: 'instant' }); activeScroll = window.scrollY
      try { localStorage.removeItem(key('resume')) } catch { /* optional */ }
    }
  } catch { /* optional */ }
  measureProgress()
  saveReading()
}
function onNightChange(event: MediaQueryListEvent) { prefersNight.value = event.matches; syncThemeColor() }
onMounted(() => {
  try { migrateWorkStorage(localStorage, catalog.work) } catch { /* Browser storage is optional. */ }
  mounted = true
  router.onBeforePageLoad = async (href) => {
    if (activeEpisode) { activeScroll = window.scrollY; saveReading(); activeEpisode = undefined }
    return await previousBeforeLoad?.(href)
  }
  nightQuery = window.matchMedia('(prefers-color-scheme: dark)')
  prefersNight.value = nightQuery.matches
  nightQuery.addEventListener('change', onNightChange)
  const preferred = Number(readStorage('family-library:font') ?? 1)
  if ([0, 1, 2, 3].includes(preferred)) fontSize.value = preferred
  const mode = readStorage('family-library:theme')
  setMode(['auto', 'light', 'dark'].includes(mode ?? '') ? mode! : 'auto')
  completed.value = migrateCompleted(catalog, readJson(key('completed')))
  lastRead.value = restoreReading(storageKey)
  if (lastRead.value?.finished && !completed.value.includes(lastRead.value.id)) completed.value.push(lastRead.value.id)
  writeStorage(key('completed'), JSON.stringify(completed.value))
  restoreReading(key('resume'))
  const oldAnchor = window.location.hash.match(/^#episode-([a-z0-9-]+)$/)?.[1]
  const anchorId = oldAnchor && catalog.legacyIds[oldAnchor]
  if (anchorId && catalog.readingOrder.some(entry => entry.id === anchorId)) {
    window.history.replaceState(window.history.state, '', `#episode-${anchorId}`)
    void nextTick(() => document.getElementById(`episode-${anchorId}`)?.scrollIntoView())
  }
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('pagehide', pagehide)
  void setupPage()
})
watch(() => route.path, () => { if (mounted) void setupPage() })
onBeforeUnmount(() => {
  router.onBeforePageLoad = previousBeforeLoad; ++version; clearTimeout(saveTimer); saveReading()
  window.removeEventListener('scroll', onScroll); window.removeEventListener('pagehide', pagehide)
  nightQuery?.removeEventListener('change', onNightChange)
})
</script>
<template>
  <div class="library" :class="isReading ? ['page-reader', `font-${fontSize}`, { 'chrome-hidden': !chrome }] : 'page-theater'">
    <a class="skip-link" href="#main">본문으로 건너뛰기</a>
    <audio ref="musicAudio" class="background-audio" loop preload="none" aria-hidden="true" />
    <WorkHome v-if="isHome" series="novel" :title="catalog.work.title" :art="art"
      :action="{ label: action.label, ariaLabel: action.spoken, href: withBase(action.episode.url) }" :formats="formats" :rows="rows" @action="openAction" @select="openRow" />
    <main v-else-if="isMissing" id="main" tabindex="-1" class="not-found"><h1>이야기를 찾지 못했습니다.</h1><a class="text-link" :href="workHome">작품 홈으로</a></main>
    <main v-else-if="frontmatter.kind === 'redirect'" id="main" class="not-found"><h1>홈으로 이동합니다.</h1><a class="text-link" :href="frontmatter.redirectTo" target="_self">홈으로</a></main>
    <template v-else>
      <header class="reader-bar" @focusin="chrome = true">
        <nav class="reader-bar-inner" aria-label="읽기 도구">
          <a class="reader-back" :href="homeHref" aria-label="작품 홈으로"><ReaderIcon name="chevron-left" :size="22" :stroke="1.9" /></a>
          <p class="reader-title"><span>{{ barTitle }}</span></p>
          <ReaderSettingsButton @open="settings?.open()" />
        </nav>
      </header>
      <main id="main" tabindex="-1" class="reader-main" @click="toggleChrome">
        <article class="story-content"><Content /></article>
        <NovelEpisodeEnd v-if="isEpisode" :key="pageId" :page-id="pageId" :previous="frontmatter.prev" :next="frontmatter.next" @complete="complete" />
      </main>
      <div class="reader-foot" aria-hidden="true"><div class="reader-foot-inner"><span class="reader-track"><span :style="{ width: `${progressPercent(progress)}%` }" /></span><span>{{ progressPercent(progress) }}%</span></div></div>
      <span class="reader-thin" aria-hidden="true"><span :style="{ width: `${progressPercent(progress)}%` }" /></span>
      <ReaderSheet ref="settings" title="읽기 설정">
        <div>
          <p class="sheet-label">글자 크기</p>
          <div class="size-steps" role="group" aria-label="글자 크기">
            <button type="button" aria-label="글자 작게" :disabled="fontSize === 0" @click="setFont(fontSize - 1)"><span class="size-small" aria-hidden="true">가</span></button>
            <span class="size-dots" role="img" :aria-label="`${fontSize + 1}단계 / 4단계`"><span v-for="step in 4" :key="step" :class="{ 'is-on': step - 1 <= fontSize }" /></span>
            <button type="button" aria-label="글자 크게" :disabled="fontSize === 3" @click="setFont(fontSize + 1)"><span class="size-large" aria-hidden="true">가</span></button>
          </div>
        </div>
        <div>
          <p class="sheet-label">화면</p>
          <div class="theme-choices" role="radiogroup" aria-label="화면">
            <button type="button" role="radio" class="theme-paper" :aria-checked="!isNight" @click="setMode('light')">종이</button>
            <button type="button" role="radio" class="theme-night" :aria-checked="isNight" @click="setMode('dark')">밤</button>
          </div>
        </div>
        <BackgroundMusicToggle v-if="musicTrack" :enabled="musicEnabled" :status="musicStatus" @change="setMusicEnabled" @retry="retryMusic" />
      </ReaderSheet>
    </template>
  </div>
</template>
