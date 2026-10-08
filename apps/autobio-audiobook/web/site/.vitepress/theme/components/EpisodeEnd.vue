<script setup lang="ts">
import { inject, onBeforeUnmount, onMounted, ref } from 'vue'
import { withBase } from 'vitepress'
import { isFirebaseConfigured } from '../lib/firebase-config'
import { catalog, type Neighbor } from '../lib/catalog'
import { followsHere, narrationKey } from '../lib/narration'
import Icon from '@duvridge/reader-core/components/Icon.vue'
import ReactionBar from '@duvridge/reader-core/components/ReactionBar.vue'
const props = defineProps<{ pageId: string; label: string; prev?: Neighbor | null; next?: Neighbor | null; homeHref: string }>()
const narration = inject(narrationKey)!
const enabled = isFirebaseConfigured()
const ready = ref(false)
const end = ref<HTMLElement>()
let loadObserver: IntersectionObserver | undefined
onMounted(() => {
  if (!end.value || !enabled) return
  loadObserver = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) { ready.value = true; loadObserver?.disconnect() }
  }, { rootMargin: '350px' })
  loadObserver.observe(end.value)
})
onBeforeUnmount(() => loadObserver?.disconnect())
/** Moving to another episode plays it straight away, as an audiobook carries on. */
function listen(event: MouseEvent, neighbor: Neighbor) {
  if (!followsHere(event)) return
  const episode = catalog.readingOrder.find(entry => entry.url === neighbor.url)
  if (episode) narration.open(episode.id)
}
</script>
<template>
  <div ref="end" class="episode-end">
    <p v-if="!next" class="story-end">끝</p>
    <div v-else class="story-break" aria-hidden="true"><span /></div>
    <section v-if="enabled" id="reactions" class="reactions-anchor" aria-label="이 회차에 반응 남기기">
      <ClientOnly><ReactionBar v-if="ready" :page-id="props.pageId" /></ClientOnly>
    </section>
    <nav id="episode-navigation" class="episode-navigation" aria-label="회차 이동">
      <a v-if="prev" class="previous-episode" :href="withBase(prev.url)" rel="prev" @click="listen($event, prev)"><Icon name="chevron-left" :size="22" />이전 화</a>
      <span v-else aria-hidden="true" />
      <span class="episode-position">{{ label }}</span>
      <a v-if="next" class="next-episode" :href="withBase(next.url)" rel="next" @click="listen($event, next)">다음 화<Icon name="chevron" :size="22" /></a>
      <a v-else class="next-episode" :href="homeHref" aria-label="전체 회차 보기">목차<Icon name="contents" :size="20" /></a>
    </nav>
  </div>
</template>
