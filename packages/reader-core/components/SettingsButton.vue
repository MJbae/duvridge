<script setup lang="ts">
import Icon from './Icon.vue'
defineEmits<{ open: [] }>()
</script>

<template>
  <button type="button" class="settings-button" aria-haspopup="dialog" @click="$emit('open')">
    <Icon name="sliders" :size="20" /><span>설정</span>
  </button>
</template>
