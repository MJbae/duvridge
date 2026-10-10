<script setup lang="ts">
import { reactionPageId } from '@duvridge/reader-ui/state/work-storage.mjs'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { withBase } from 'vitepress'
import { isFirebaseConfigured } from '../lib/firebase-config'
import { useCatalog, type Neighbor } from '../lib/reader-catalog'
import EpisodeNav from '@duvridge/reader-ui/components/EpisodeNav.vue'
import ReaderReactionBar from '@duvridge/reader-reactions/components/ReaderReactionBar.vue'
const catalog = useCatalog()
const props = defineProps<{ pageId: string; previous?: Neighbor | null; next?: Neighbor | null }>()
const emit = defineEmits<{ complete: [] }>()
const enabled = isFirebaseConfigured()
const ready = ref(false)
const end = ref<HTMLElement>()
const link = (neighbor?: Neighbor | null) => (neighbor ? { href: withBase(neighbor.url) } : undefined)
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
    <EpisodeNav series="novel" next-icon="chevron" :previous="link(previous)" :next="link(next)" />
  </div>
</template>
