<script setup lang="ts">
import { computed, defineAsyncComponent, defineComponent, h, provide, type Component } from 'vue'
import { useData } from 'vitepress'
import { workCatalogKey } from '../catalog/work-catalog'
import type { ReaderCatalog } from '@duvridge/content-processing/types'
const props = defineProps<{ catalogs: Record<string, () => Promise<unknown>>; layout: Component }>()
const { frontmatter } = useData()
const components = new Map<string, Component>()
const workId = computed(() => String(frontmatter.value.workId || ''))
const selected = computed(() => {
  const id = workId.value
  const loader = props.catalogs[`../generated/works/${id}.json`]
  if (!loader) return undefined
  if (!components.has(id)) components.set(id, defineAsyncComponent(async () => {
    const module = await loader() as { default: ReaderCatalog }
    return defineComponent({ setup() { provide(workCatalogKey, module.default); return () => h(props.layout) } })
  }))
  return components.get(id)
})
</script>
<template>
  <component v-if="selected" :is="selected" :key="workId" />
  <main v-else id="main" class="not-found"><h1>이야기를 찾지 못했습니다.</h1><a href="/">홈으로</a></main>
</template>
