<script setup lang="ts">
import { isFirebaseConfigured } from '../lib/firebase-config'
import ReaderReactionBar from '@duvridge/reader-reactions/components/ReaderReactionBar.vue'
defineProps<{ pageId: string }>()
const enabled = isFirebaseConfigured()
</script>

<template>
  <section v-if="enabled" id="reactions" class="reactions-anchor" aria-label="마음 남기기">
    <ClientOnly><ReaderReactionBar :page-id="pageId" /></ClientOnly>
  </section>
</template>
