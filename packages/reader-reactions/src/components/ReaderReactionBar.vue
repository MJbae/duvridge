<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { chooseReaction, getReactionState, retryReaction, subscribeReactions } from '../state/create-reaction-store.ts'
import { reactionOptions } from '../model/reaction-model.ts'
import ReaderIcon from '@duvridge/reader-ui/components/ReaderIcon.vue'
const props = defineProps<{ pageId: string }>()
const state = ref(getReactionState(props.pageId))
let unsubscribe: (() => void) | undefined
onMounted(() => { unsubscribe = subscribeReactions(props.pageId, value => { state.value = value }) })
onBeforeUnmount(() => { unsubscribe?.() })
</script>
<template>
  <div class="reaction-bar">
    <div class="reaction-options" role="group" aria-label="마음 남기기">
      <button v-for="option in reactionOptions" :key="option.key" type="button" :aria-pressed="state.selected === option.key" :aria-label="`${option.label}${state.counts[option.key] ? ` ${state.counts[option.key]}` : ''}`" @click="chooseReaction(pageId, option.key)"><span class="reaction-symbol"><ReaderIcon :name="option.icon" :size="24" :filled="state.selected === option.key" /><span v-if="state.counts[option.key]" class="reaction-count" aria-hidden="true">{{ state.counts[option.key] }}</span></span><span class="reaction-label">{{ option.label }}</span></button>
    </div>
    <p v-if="state.error" class="reaction-error" role="alert">{{ state.error }} <button type="button" class="text-link" @click="retryReaction(pageId)">다시 시도</button></p>
  </div>
</template>
