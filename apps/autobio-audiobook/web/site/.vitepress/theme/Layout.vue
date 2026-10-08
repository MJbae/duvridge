<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { Content, useData, useRoute, withBase } from 'vitepress'
import Icon from '@duvridge/reader-core/components/Icon.vue'
import WorkHome from './components/WorkHome.vue'
import EpisodeEnd from './components/EpisodeEnd.vue'
import SettingsButton from '@duvridge/reader-core/components/SettingsButton.vue'
import NarrationPick from './components/NarrationPick.vue'
import PlayerBar from './components/PlayerBar.vue'
import { narrationKey, useNarration } from './lib/narration'
import { catalog } from './lib/catalog'
import { migrateCompleted, migrateReading } from '../shared/reading-history.mjs'
const { frontmatter, page } = useData()
const route = useRoute()
const isHome = computed(() => frontmatter.value.layout === 'home')
const isMissing = computed(() => Boolean(page.value.isNotFound))
const isEpisode = computed(() => frontmatter.value.kind === 'episode')
// The player bar belongs to the home and the episodes; moved and missing pages stay plain.
const showPlayer = computed(() => !isMissing.value && (isHome.value || isEpisode.value))
const narrationAudio = ref<HTMLAudioElement>()
const pageEpisode = computed(() => (isEpisode.value ? String(frontmatter.value.episodeId || '') : ''))
const narration = useNarration({ audio: narrationAudio, page: pageEpisode, onFinish: markCompleted })
provide(narrationKey, narration)
const pageId = computed(() => String(frontmatter.value.pageId || ''))
const title = computed(() => String(frontmatter.value.title || '이야기'))
const homeHref = computed(() => withBase('/') + (frontmatter.value.episodeId ? `#episode-${frontmatter.value.episodeId}` : ''))
const fontSize = ref(1)
// Each choice previews its real reading size, matching --reading-size for .font-0 to .font-3.
const sizeOptions = [{ label: '작게', sample: '1.125rem' }, { label: '기본', sample: '1.25rem' }, { label: '크게', sample: '1.4375rem' }, { label: '아주 크게', sample: '1.625rem' }]
const leading = ref('wide')
const leadingOptions = [{ value: 'normal', label: '보통' }, { value: 'wide', label: '넓게' }]
const face = ref('serif')
const faceOptions = [{ value: 'sans', label: '고딕' }, { value: 'serif', label: '명조' }]
const screenMode = ref('auto')
const modes = [{ value: 'auto', label: '기기 설정' }, { value: 'light', label: '밝게' }, { value: 'dark', label: '어둡게' }]
const completed = ref<string[]>([])
const settingsDialog = ref<HTMLDialogElement>()
let version = 0
let mounted = false
function readStorage(key: string) { try { return localStorage.getItem(key) } catch { return null } }
function writeStorage(key: string, value: string) { try { localStorage.setItem(key, value) } catch { /* optional */ } }
function readJson(key: string) { try { return JSON.parse(readStorage(key) || 'null') } catch { return null } }
// Hearing an episode to its end marks it heard, also when the next episode starts on its own.
function markCompleted(id: string) {
  if (completed.value.includes(id)) return
  completed.value = [...completed.value, id]
  writeStorage('family-library:completed', JSON.stringify(completed.value))
}
function setFont(size: number) { fontSize.value = size; writeStorage('family-library:font', String(size)) }
function setLeading(value: string) { leading.value = value; writeStorage('family-library:leading', value) }
function setFace(value: string) { face.value = value; writeStorage('family-library:face', value) }
function setMode(mode: string) {
  screenMode.value = mode
  document.documentElement.dataset.theme = mode
  writeStorage('family-library:theme', mode)
}
function closeDialogs() { settingsDialog.value?.close() }
function closeOnBackdrop(event: MouseEvent) {
  const dialog = event.currentTarget as HTMLDialogElement
  if (event.target !== dialog) return
  const rect = dialog.getBoundingClientRect()
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close()
}
async function setupPage() {
  const current = ++version
  closeDialogs()
  await nextTick()
  if (current !== version || !isEpisode.value) return
  narration.attach()
}
onMounted(() => {
  mounted = true
  const preferred = Number(readStorage('family-library:font') ?? 1)
  if ([0, 1, 2, 3].includes(preferred)) fontSize.value = preferred
  const savedLeading = readStorage('family-library:leading')
  if (leadingOptions.some(option => option.value === savedLeading)) leading.value = savedLeading!
  const savedFace = readStorage('family-library:face')
  if (faceOptions.some(option => option.value === savedFace)) face.value = savedFace!
  const mode = readStorage('family-library:theme')
  setMode(modes.some(m => m.value === mode) ? mode! : 'auto')
  completed.value = migrateCompleted(catalog, readJson('family-library:completed'))
  // Earlier visits kept a finished episode only with the reading position; it still counts once.
  const legacy = migrateReading(catalog, readJson('family-library:reading'))
  if (legacy?.finished && !completed.value.includes(legacy.id)) completed.value = [...completed.value, legacy.id]
  writeStorage('family-library:completed', JSON.stringify(completed.value))
  const oldAnchor = window.location.hash.match(/^#episode-([a-z0-9-]+)$/)?.[1]
  const anchorId = oldAnchor && catalog.legacyIds[oldAnchor]
  if (anchorId && catalog.readingOrder.some(episode => episode.id === anchorId)) {
    window.history.replaceState(window.history.state, '', `#episode-${anchorId}`)
    void nextTick(() => document.getElementById(`episode-${anchorId}`)?.scrollIntoView())
  }
  void setupPage()
})
watch(() => route.path, () => { if (mounted) void setupPage() })
onBeforeUnmount(() => { ++version })
</script>
<template>
  <div class="library" :class="[`font-${fontSize}`, `leading-${leading}`, `face-${face}`, { 'has-player': showPlayer }]">
    <a class="skip-link" href="#main">본문으로 건너뛰기</a>
    <audio ref="narrationAudio" class="narration-audio" preload="none" />
    <WorkHome v-if="isHome" :completed="completed">
      <template #settings><SettingsButton @open="settingsDialog?.showModal()" /></template>
    </WorkHome>
    <main v-else-if="isMissing" id="main" tabindex="-1" class="not-found"><h1>이야기를 찾지 못했습니다.</h1><a class="text-link" :href="withBase('/')">목차로 돌아가기</a></main>
    <main v-else-if="frontmatter.kind === 'redirect'" id="main" class="not-found"><h1>이 이야기의 주소가 바뀌었습니다.</h1><Content /><a class="text-link" :href="withBase(frontmatter.redirect)">이 이야기 읽기</a></main>
    <template v-else>
      <header class="reader-toolbar"><nav aria-label="읽기 도구"><a class="back-link" :href="homeHref"><Icon name="back" :size="20" /><span>목차</span></a><div class="reader-actions"><SettingsButton @open="settingsDialog?.showModal()" /></div></nav></header>
      <main id="main" tabindex="-1" class="reader-main">
        <header class="article-header"><p v-if="frontmatter.label" class="article-label">{{ frontmatter.label }}</p><h1><span>{{ title }}</span></h1><p v-if="frontmatter.time" class="article-time"><span>{{ frontmatter.time }}</span></p></header>
        <article class="story-content"><Content /></article>
        <EpisodeEnd v-if="isEpisode" :key="pageId" :page-id="pageId" :label="String(frontmatter.label || '')" :prev="frontmatter.prev" :next="frontmatter.next" :home-href="homeHref" />
        <NarrationPick />
      </main>
    </template>
    <PlayerBar v-if="showPlayer" :completed="completed" />
    <dialog ref="settingsDialog" class="reading-settings" aria-labelledby="settings-title" @click="closeOnBackdrop">
      <div class="dialog-body"><div class="dialog-handle" aria-hidden="true" /><header class="dialog-heading"><h2 id="settings-title">설정</h2><button class="close-button" aria-label="설정 닫기" @click="closeDialogs"><Icon name="close" :size="21" /></button></header>
        <p class="settings-label">글자 크기</p><div class="size-options" role="group" aria-label="글자 크기 선택"><button v-for="(option, size) in sizeOptions" :key="option.label" type="button" :class="{ selected: fontSize === size }" :aria-pressed="fontSize === size" @click="setFont(size)"><span class="size-sample" :style="{ fontSize: option.sample }" aria-hidden="true">가</span><span>{{ option.label }}</span></button></div>
        <div class="text-options">
          <div><p class="settings-label">줄 간격</p><div class="pair-options" role="group" aria-label="줄 간격 선택"><button v-for="option in leadingOptions" :key="option.value" type="button" :class="{ selected: leading === option.value }" :aria-pressed="leading === option.value" @click="setLeading(option.value)">{{ option.label }}</button></div></div>
          <div><p class="settings-label">서체</p><div class="pair-options" role="group" aria-label="서체 선택"><button v-for="option in faceOptions" :key="option.value" type="button" :class="[`face-sample-${option.value}`, { selected: face === option.value }]" :aria-pressed="face === option.value" @click="setFace(option.value)">{{ option.label }}</button></div></div>
        </div>
        <p class="settings-label">화면</p><div class="screen-options" role="group" aria-label="화면 모드 선택"><button v-for="mode in modes" :key="mode.value" type="button" :class="{ selected: screenMode === mode.value }" :aria-pressed="screenMode === mode.value" @click="setMode(mode.value)"><span class="mode-swatch" :class="`mode-swatch-${mode.value}`" aria-hidden="true" /><span>{{ mode.label }}</span></button></div>
        <button type="button" class="settings-done" @click="closeDialogs">완료</button>
      </div>
    </dialog>
  </div>
</template>
