<script setup lang="ts">
import { computed } from 'vue'
import { withBase } from 'vitepress'
import ReaderIcon from '@duvridge/reader-ui/components/ReaderIcon.vue'
import { useCatalog } from '../lib/reader-catalog'

defineProps<{ href: string; titleId: string }>()
const catalog = useCatalog()
const cover = computed(() => {
  const sources = catalog.work.cover?.sources ?? []
  const source = sources.find(entry => entry.width >= 360) ?? sources[0]
  return source ? withBase(source.src) : undefined
})
</script>

<template>
  <section class="film-origin" :aria-labelledby="titleId">
    <h2 :id="titleId">오리지널 시리즈</h2>
    <a class="film-origin-card" :href="href" target="_self">
      <img v-if="cover" class="film-origin-cover" :src="cover" alt="" width="72" height="108" loading="lazy" />
      <span class="film-origin-title">{{ catalog.work.title }}</span>
      <ReaderIcon name="chevron" :size="22" :stroke="1.9" />
    </a>
  </section>
</template>
