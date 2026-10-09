<script setup lang="ts">
import { ref } from 'vue'
import ReaderSheet from '@duvridge/reader-ui/components/ReaderSheet.vue'
import { episodeName } from '@duvridge/reader-ui/series/work-rows.mjs'
import { catalog } from '../lib/reader-catalog'
import { episodePath, followsHere, narrationFor, type NarrationMode } from '../lib/narration-controller'

defineProps<{ current: string; mode: NarrationMode }>()
const emit = defineEmits<{ choose: [id: string] }>()
const sheet = ref<InstanceType<typeof ReaderSheet>>()
function choose(event: MouseEvent, id: string) {
  sheet.value?.close()
  if (followsHere(event)) emit('choose', id)
}
defineExpose({ open: () => sheet.value?.open() })
</script>

<template>
  <ReaderSheet ref="sheet" title="회차" done-label="닫기">
    <nav class="toc-list" aria-label="회차 목록">
      <template v-for="entry in catalog.readingOrder" :key="entry.id">
        <a v-if="narrationFor(entry.id)" :href="episodePath(entry.id, mode)" :aria-current="entry.id === current ? 'page' : undefined" @click="choose($event, entry.id)"><span>{{ episodeName(entry) }}</span></a>
        <span v-else class="toc-wait"><span>{{ episodeName(entry) }}</span><span class="pending-pill">준비 중</span></span>
      </template>
    </nav>
  </ReaderSheet>
</template>
