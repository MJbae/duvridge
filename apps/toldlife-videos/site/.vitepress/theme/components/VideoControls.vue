<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ReaderIcon from '@duvridge/reader-ui/components/ReaderIcon.vue'
import { clock, spokenTime } from '../../shared/narration-cues.mjs'

const props = defineProps<{ playing: boolean; failed?: boolean; time: number; duration: number; full?: boolean; resetKey?: string }>()
const emit = defineEmits<{ play: []; skip: [seconds: number]; seek: [time: number]; fullscreen: [] }>()
const visible = ref(true)
const focused = ref(false)
const length = computed(() => Number.isFinite(props.duration) ? Math.max(0, props.duration) : 0)
const position = computed(() => Number.isFinite(props.time) ? Math.min(length.value, Math.max(0, props.time)) : 0)
const percent = computed(() => length.value ? position.value / length.value * 100 : 0)
let hideTimer: ReturnType<typeof setTimeout> | undefined

// A tap shows the controls, which fade after three seconds of playback.
function scheduleHide() {
  clearTimeout(hideTimer)
  if (props.playing && !focused.value) hideTimer = setTimeout(() => { visible.value = false }, 3000)
}
function showControls() { visible.value = true; scheduleHide() }
function toggleControls() {
  clearTimeout(hideTimer)
  visible.value = !visible.value
  if (visible.value) scheduleHide()
}
function focusControls(event: FocusEvent) { focused.value = (event.target as HTMLElement).matches(':focus-visible'); showControls() }
function pointerControls() { focused.value = false; showControls() }
function blurControls(event: FocusEvent) {
  if ((event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) return
  focused.value = false
  scheduleHide()
}
function play() { showControls(); emit('play') }
function skip(seconds: number) { showControls(); emit('skip', seconds) }
function seek(event: Event) { showControls(); emit('seek', Number((event.target as HTMLInputElement).value)) }
function fullscreen() { showControls(); emit('fullscreen') }

watch(() => props.playing, value => { if (value) scheduleHide(); else showControls() })
watch(() => props.failed, value => { if (value) showControls() })
watch(() => props.resetKey, showControls)
onMounted(scheduleHide)
onBeforeUnmount(() => clearTimeout(hideTimer))
</script>

<template>
  <button type="button" class="stage-frame" :aria-label="visible ? '영상 조작부 숨기기' : '영상 조작부 표시'" :aria-expanded="visible" @click="toggleControls" />
  <div v-if="visible" class="stage-controls" @pointerdown="pointerControls" @focusin="focusControls" @focusout="blurControls">
    <div class="stage-bottom">
      <div class="stage-row">
        <button type="button" class="stage-icon" :aria-label="failed ? '다시 시도' : playing ? '일시 정지' : '재생'" @click="play"><ReaderIcon :name="failed ? 'retry' : playing ? 'pause' : 'play'" :size="22" :stroke="2" /></button>
        <button type="button" class="stage-icon stage-skip" aria-label="10초 뒤로" @click="skip(-10)"><ReaderIcon name="back-10" :size="24" :stroke="1.7" /><span aria-hidden="true">10</span></button>
        <button type="button" class="stage-icon stage-skip" aria-label="10초 앞으로" @click="skip(10)"><ReaderIcon name="forward-10" :size="24" :stroke="1.7" /><span aria-hidden="true">10</span></button>
        <span class="stage-time">{{ clock(position) }} / {{ clock(length) }}</span>
        <button type="button" class="stage-icon" :aria-label="full ? '전체 화면 끝내기' : '전체 화면'" @click="fullscreen"><ReaderIcon :name="full ? 'shrink' : 'expand'" :size="20" :stroke="2" /></button>
      </div>
      <input class="seek-range stage-seek" type="range" min="0" :max="length" step="0.1" :value="position" :disabled="!length" aria-label="재생 위치" :aria-valuetext="spokenTime(position)" :style="{ '--seek': `${percent}%` }" @input="seek" />
    </div>
  </div>
  <span v-else class="stage-thin" aria-hidden="true"><span :style="{ width: `${percent}%` }" /></span>
</template>
