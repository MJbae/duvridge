<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { withBase } from 'vitepress'
import { isFirebaseConfigured } from '../lib/firebase-config'
import type { Neighbor } from '../lib/reader-catalog'
import ReadingLink from '@duvridge/story-reader/components/ReadingLink.vue'
import ReactionBar from '@duvridge/story-reader/components/ReactionBar.vue'
const props = defineProps<{ pageId: string; prev?: Neighbor | null; next?: Neighbor | null; homeHref: string; episode: boolean }>()
const emit = defineEmits<{ complete: [] }>()
const enabled = isFirebaseConfigured()
const ready = ref(false)
const end = ref<HTMLElement>()
let loadObserver: IntersectionObserver | undefined, readObserver: IntersectionObserver | undefined
onMounted(() => {
  if (!end.value) return
  if (enabled) {
    loadObserver = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { ready.value = true; loadObserver?.disconnect() }
    }, { rootMargin: '350px' })
    loadObserver.observe(end.value)
  }
  if (props.episode) {
    readObserver = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { emit('complete'); readObserver?.disconnect() }
    })
    readObserver.observe(end.value)
  }
})
onBeforeUnmount(() => { loadObserver?.disconnect(); readObserver?.disconnect() })
</script>
<template>
  <div ref="end" class="episode-end">
    <p v-if="!next" class="story-end">끝</p>
    <div v-else class="story-break" aria-hidden="true"><span /></div>
    <section v-if="enabled && episode" id="reactions" class="reactions-anchor" aria-label="이 회차에 반응 남기기">
      <ClientOnly><ReactionBar v-if="ready" :page-id="pageId" /></ClientOnly>
    </section>
    <nav v-if="episode" id="episode-navigation" class="episode-navigation" :class="{ 'has-previous': prev }" aria-label="회차 이동">
      <ReadingLink
        v-if="prev"
        class="previous-episode"
        :href="withBase(prev.url)"
        label="이전 화"
        variant="secondary"
        direction="back"
        rel="prev"
        aria-label="이전 화 읽기"
      />
      <ReadingLink
        class="next-episode"
        :href="next ? withBase(next.url) : homeHref"
        :label="next ? '다음 화' : '목차'"
        :rel="next ? 'next' : undefined"
        :icon="next ? 'arrow' : 'contents'"
        :aria-label="next ? '다음 화 읽기' : '전체 회차 보기'"
      />
    </nav>
  </div>
</template>
