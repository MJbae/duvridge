<script setup lang="ts">
import { reactionPageId } from '@duvridge/reader-ui/state/work-storage.mjs'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { withBase } from 'vitepress'
import { isFirebaseConfigured } from '../lib/firebase-config'
import { useCatalog, type Neighbor } from '../lib/reader-catalog'
import EpisodeNext from '@duvridge/reader-ui/components/EpisodeNext.vue'
import { episodeName, episodeThumb } from '@duvridge/reader-ui/series/work-rows.mjs'
import ReaderReactionBar from '@duvridge/reader-reactions/components/ReaderReactionBar.vue'
const catalog = useCatalog()
const props = defineProps<{ pageId: string; next?: Neighbor | null; homeHref: string }>()
const emit = defineEmits<{ complete: [] }>()
const enabled = isFirebaseConfigured()
const ready = ref(false)
const end = ref<HTMLElement>()
// The next episode shows its painting and title above the same big button as the work page.
const nextEpisode = computed(() => (props.next ? catalog.readingOrder.find(entry => entry.url === props.next?.url) : undefined))
const card = computed(() => nextEpisode.value
  ? { name: episodeName(nextEpisode.value), image: episodeThumb(catalog.illustrations, nextEpisode.value.episodeId || nextEpisode.value.id, withBase) }
  : undefined)
const action = computed(() => (props.next ? { label: `${props.next.label} 읽기`, href: withBase(props.next.url) } : { label: '전체 회차 보기', href: props.homeHref }))
let loadObserver: IntersectionObserver | undefined, readObserver: IntersectionObserver | undefined
onMounted(() => {
  if (!end.value) return
  if (enabled) {
    loadObserver = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { ready.value = true; loadObserver?.disconnect() }
    }, { rootMargin: '350px' })
    loadObserver.observe(end.value)
  }
  readObserver = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) { emit('complete'); readObserver?.disconnect() }
  })
  readObserver.observe(end.value)
})
onBeforeUnmount(() => { loadObserver?.disconnect(); readObserver?.disconnect() })
</script>
<template>
  <div ref="end" class="episode-end">
    <p v-if="!next" class="story-end">끝</p>
    <span v-else class="end-rule" aria-hidden="true" />
    <section v-if="enabled" id="reactions" class="reactions-anchor" aria-label="마음 남기기">
      <ClientOnly><ReaderReactionBar v-if="ready" :page-id="reactionPageId(catalog.work, pageId)" /></ClientOnly>
    </section>
    <EpisodeNext series="novel" :next="card" :action="action" />
  </div>
</template>
