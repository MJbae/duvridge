<script setup lang="ts">
import { reactionPageId } from '@duvridge/reader-ui/state/work-storage.mjs'
import { isFirebaseConfigured } from '../lib/firebase-config'
import ReaderReactionBar from '@duvridge/reader-reactions/components/ReaderReactionBar.vue'
import { useCatalog } from '../lib/reader-catalog'
const catalog = useCatalog()
defineProps<{ pageId: string }>()
const enabled = isFirebaseConfigured()
</script>

<template>
  <section v-if="enabled" id="reactions" class="reactions-anchor" aria-label="마음 남기기">
    <ClientOnly><ReaderReactionBar :page-id="reactionPageId(catalog.work, pageId)" /></ClientOnly>
  </section>
</template>
