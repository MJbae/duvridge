<script setup lang="ts">
import type { SceneImage } from '../lib/reader-catalog'
defineProps<{ image?: SceneImage; sizes: string; eager?: boolean }>()
</script>

<template>
  <picture v-if="image">
    <source v-if="image.webpSrcset" type="image/webp" :srcset="image.webpSrcset" :sizes="sizes" />
    <img :src="image.src" :srcset="image.srcset" :sizes="sizes" :alt="image.alt" width="1280" height="720" decoding="async" :loading="eager ? 'eager' : 'lazy'" />
  </picture>
</template>
