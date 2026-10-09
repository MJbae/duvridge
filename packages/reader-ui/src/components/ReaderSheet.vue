<script setup lang="ts">
import { ref } from 'vue'

defineProps<{ title: string; doneLabel?: string }>()
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement>()
function open() { if (!dialog.value?.open) dialog.value?.showModal() }
function close() { dialog.value?.close() }
/** A tap outside the panel lands on the dialog itself, beyond its box. */
function closeOnBackdrop(event: MouseEvent) {
  const target = dialog.value
  if (!target || event.target !== target) return
  const rect = target.getBoundingClientRect()
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close()
}
defineExpose({ open, close })
</script>

<template>
  <dialog ref="dialog" class="sheet" :aria-label="title" @click="closeOnBackdrop" @close="emit('close')">
    <div class="sheet-body">
      <div class="sheet-handle" aria-hidden="true" />
      <header class="sheet-heading"><h2>{{ title }}</h2><button type="button" class="sheet-done" @click="close">{{ doneLabel ?? '완료' }}</button></header>
      <slot />
    </div>
  </dialog>
</template>
