<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ name: string; size?: number; filled?: boolean; stroke?: number }>(), { size: 20, filled: false, stroke: 1.8 })
// A shape is stroked unless it is marked solid; solid shapes keep their fill whatever `filled` says.
type Shape = { d: string; solid?: boolean }
const shapes: Record<string, Shape[]> = {
  arrow: [{ d: 'M5 12h14m-6-6 6 6-6 6' }],
  music: [{ d: 'M9 17V6l10-2v11M9 9l10-2M9 17a3 2 0 1 1-6 0 3 2 0 1 1 6 0m10-2a3 2 0 1 1-6 0 3 2 0 1 1 6 0' }],
  sound: [{ d: 'M4 9.5h3.5L12 6v12l-4.5-3.5H4z' }, { d: 'M15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10' }],
  back: [{ d: 'M19 12H5m6 6-6-6 6-6' }],
  close: [{ d: 'm6 6 12 12M6 18 18 6' }],
  chevron: [{ d: 'm9 5 7 7-7 7' }],
  'chevron-left': [{ d: 'M15 5l-7 7 7 7' }],
  'chevron-down': [{ d: 'M5 9l7 7 7-7' }],
  'caret-down': [{ d: 'M6 9l6 6 6-6' }],
  play: [{ d: 'M8 5v14l11-7z', solid: true }],
  pause: [{ d: 'M7 5h3a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm7 0h3a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z', solid: true }],
  retry: [{ d: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7' }],
  contents: [{ d: 'M5 7h14M5 12h14M5 17h9' }],
  check: [{ d: 'm5 12 4 4L19 6' }],
  sliders: [{ d: 'M4 7h10M18 7h2M4 17h2M10 17h10M18 7a2 2 0 1 1-4 0 2 2 0 1 1 4 0M10 17a2 2 0 1 1-4 0 2 2 0 1 1 4 0' }],
  image: [{ d: 'M3 3h18v18H3ZM3 17l6-6 4 4 3-3 5 5M16 7h.01' }],
  book: [{ d: 'M12 6c-2.5-1.6-5.5-1.8-8-1v13c2.5-.8 5.5-.6 8 1 2.5-1.6 5.5-1.8 8-1V5c-2.5-.8-5.5-.6-8 1zM12 6v13' }],
  headphones: [{ d: 'M4 15v-3a8 8 0 0 1 16 0v3M4.5 14h1A1.5 1.5 0 0 1 7 15.5v3A1.5 1.5 0 0 1 5.5 20h-1A1.5 1.5 0 0 1 3 18.5v-3A1.5 1.5 0 0 1 4.5 14Zm14 0h1a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-1a1.5 1.5 0 0 1-1.5-1.5v-3a1.5 1.5 0 0 1 1.5-1.5Z' }],
  moon: [{ d: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z' }],
  'back-10': [{ d: 'M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4' }],
  'forward-10': [{ d: 'M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4' }],
  previous: [{ d: 'M6 5v14' }, { d: 'M18 6l-9 6 9 6z', solid: true }],
  next: [{ d: 'M18 5v14' }, { d: 'M6 6l9 6-9 6z', solid: true }],
  expand: [{ d: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5' }],
  shrink: [{ d: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5' }],
  heart: [{ d: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z' }],
  thumb: [{ d: 'M7 11v9H4v-9zM7 11l4-7a2 2 0 0 1 2 2v4h5a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 16.8 20H7' }],
  drop: [{ d: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z' }],
  sparkle: [{ d: 'M12 3l2 5.5 5.5 1.5-5.5 2-2 5.5-2-5.5-5.5-2 5.5-1.5z' }],
}
const paths = computed(() => shapes[props.name] ?? shapes.chevron)
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" :fill="filled ? 'currentColor' : 'none'" stroke="currentColor" :stroke-width="stroke"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path v-for="shape in paths" :key="shape.d" :d="shape.d" :fill="shape.solid ? 'currentColor' : undefined" :stroke="shape.solid ? 'none' : undefined" />
  </svg>
</template>
