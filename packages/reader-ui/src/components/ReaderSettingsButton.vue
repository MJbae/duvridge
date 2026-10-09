<script setup lang="ts">
import ReaderIcon from './ReaderIcon.vue'
defineEmits<{ open: [] }>()
</script>

<template>
  <button type="button" class="settings-button" aria-haspopup="dialog" @click="$emit('open')">
    <ReaderIcon name="sliders" :size="18" :stroke="1.9" /><span>설정</span>
  </button>
</template>
