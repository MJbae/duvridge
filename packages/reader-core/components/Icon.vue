<script setup lang="ts">
withDefaults(defineProps<{ name: string; size?: number; filled?: boolean; stroke?: number }>(), { size: 20, filled: false, stroke: 1.8 })
const paths: Record<string, string> = {
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  music: 'M9 17V6l10-2v11M9 9l10-2M9 17a3 2 0 1 1-6 0 3 2 0 1 1 6 0m10-2a3 2 0 1 1-6 0 3 2 0 1 1 6 0',
  back: 'M19 12H5m6 6-6-6 6-6',
  close: 'm6 6 12 12M6 18 18 6',
  chevron: 'm9 5 7 7-7 7',
  'chevron-left': 'm15 5-7 7 7 7',
  'chevron-down': 'm6 9 6 6 6-6',
  play: 'm8 5 11 7-11 7Z',
  pause: 'M8 5v14M16 5v14',
  retry: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  share: 'M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6',
  contents: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  check: 'm5 12 4 4L19 6',
  sliders: 'M4 8h9M17 8h3M4 16h3M11 16h9M17 8a2 2 0 1 1-4 0 2 2 0 1 1 4 0M11 16a2 2 0 1 1-4 0 2 2 0 1 1 4 0',
  image: 'M3 3h18v18H3ZM3 17l6-6 4 4 3-3 5 5M16 7h.01',
  heart: 'M12 19.5s-7.5-4.6-7.5-10A4.25 4.25 0 0 1 12 6.9a4.25 4.25 0 0 1 7.5 2.6c0 5.4-7.5 10-7.5 10Z',
  thumb: 'M7 10.5v9.5M7 10.5 10.3 4a1.7 1.7 0 0 1 3.2 1.1l-.7 4.4h5.4a2 2 0 0 1 2 2.3l-1.2 6.5A2 2 0 0 1 17 20H4.5A1.5 1.5 0 0 1 3 18.5v-6.5A1.5 1.5 0 0 1 4.5 10.5H7Z',
  drop: 'M12 3.8c-2.9 3.6-6 7.4-6 10.5a6 6 0 0 0 12 0c0-3.1-3.1-6.9-6-10.5Z',
  sparkle: 'M11 5.5c.6 4 2 5.6 6 6.2-4 .6-5.4 2.2-6 6.2-.6-4-2-5.6-6-6.2 4-.6 5.4-2.2 6-6.2ZM18.5 3.5v3.4M16.8 5.2h3.4',
  wave:'M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2',
  replay: 'M2 4v6h6M4.5 15a8.5 8.5 0 1 0 2-8.8L2 10',
  forward: 'M22 4v6h-6M19.5 15a8.5 8.5 0 1 1-2-8.8L22 10',
  up: 'M12 19V5m-6 6 6-6 6 6',
  down: 'M12 5v14m-6-6 6 6 6-6',
}
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    :fill="filled ? 'currentColor' : 'none'"
    stroke="currentColor"
    :stroke-width="stroke"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="paths[name] || paths.chevron" />
  </svg>
</template>
