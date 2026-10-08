<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Icon from './Icon.vue'

const props = withDefaults(defineProps<{
  src: string
  srcset: string
  webpSrcset?: string
  sizes: string
  alt: string
  width: number
  height: number
  loading?: 'eager' | 'lazy'
  fetchpriority?: 'high' | 'auto'
}>(), { loading: 'lazy', fetchpriority: 'auto' })

const image = ref<HTMLImageElement>()
const loaded = ref(false)
const failed = ref(false)
const jpegFallback = ref(false)
const attempt = ref(0)
const useWebp = computed(() => Boolean(props.webpSrcset) && !jpegFallback.value)
const retryUrl = (src: string) => attempt.value ? `${src}${src.includes('?') ? '&' : '?'}retry=${attempt.value}` : src
const retrySrcset = (srcset: string) => srcset.replace(/(\S+)(\s+\d+w)/g, (_, src, descriptor) => retryUrl(src) + descriptor)

function onLoad() { loaded.value = true; failed.value = false }
function onError() {
  // A supported WebP file can still fail to transfer; <picture> does not retry JPG itself.
  if (useWebp.value) jpegFallback.value = true
  else failed.value = true
}
function retry() {
  loaded.value = false
  failed.value = false
  jpegFallback.value = false
  attempt.value++
}
watch(() => props.src, () => {
  loaded.value = false; failed.value = false; jpegFallback.value = false; attempt.value = 0
})
onMounted(() => {
  // An eager image may have finished before Vue attached its event listeners.
  if (image.value?.complete) {
    if (image.value.naturalWidth > 0) onLoad()
    else onError()
  }
})
</script>

<template>
  <div class="responsive-image" :class="{ 'image-failed': failed }" :style="{ aspectRatio: `${width} / ${height}` }">
    <span v-if="!loaded && !failed" class="image-placeholder" aria-hidden="true"><Icon name="image" :size="24" /></span>
    <picture :key="attempt">
      <source v-if="useWebp" type="image/webp" :srcset="retrySrcset(webpSrcset!)" :sizes="sizes" />
      <img ref="image" :src="retryUrl(src)" :srcset="jpegFallback ? undefined : retrySrcset(srcset)" :sizes="sizes"
        :width="width" :height="height" :alt="alt" :loading="loading" :fetchpriority="fetchpriority"
        decoding="async" @load="onLoad" @error="onError" />
    </picture>
    <div v-if="failed" class="image-error" role="status">
      <p>그림을 불러오지 못했습니다.</p>
      <button type="button" @click="retry">그림 다시 불러오기</button>
    </div>
  </div>
</template>
