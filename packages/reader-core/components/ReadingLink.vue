<script setup lang="ts">
import Icon from './Icon.vue'

withDefaults(defineProps<{
  href: string
  label: string
  subtitle?: string
  variant?: 'primary' | 'secondary'
  direction?: 'forward' | 'back'
  icon?: string
}>(), { variant: 'primary', direction: 'forward' })
</script>

<template>
  <a class="reading-link" :class="[`reading-link--${variant}`, { 'reading-link--with-subtitle': subtitle }]" :href="href">
    <Icon v-if="direction === 'back'" :name="icon || 'back'" :size="20" />
    <span v-if="subtitle" class="reading-link-copy">
      <span class="reading-link-label">{{ label }}</span>
      <span class="reading-link-subtitle">{{ subtitle }}</span>
    </span>
    <span v-else class="reading-link-label">{{ label }}</span>
    <Icon v-if="direction === 'forward'" :name="icon || 'arrow'" :size="20" />
  </a>
</template>

<style scoped>
.reading-link {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 0;
  min-height: 56px;
  padding: 12px;
  border: 1px solid var(--nav-secondary-border);
  border-radius: 12px;
  background: var(--soft);
  color: var(--ink);
  font-size: var(--font-ui);
  font-weight: 600;
  line-height: 1.5;
  transition: transform 120ms ease, background-color 140ms ease;
}
.reading-link-label {
  white-space: nowrap;
}
.reading-link--with-subtitle {
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  min-height: 80px;
}
.reading-link-copy {
  min-width: 0;
  flex: 1;
  text-align: left;
}
.reading-link-copy .reading-link-label {
  display: block;
}
.reading-link-subtitle {
  display: block;
  margin-top: 4px;
  color: inherit;
  font-size: var(--font-meta);
  font-weight: 400;
  line-height: 1.5;
  white-space: normal;
  word-break: keep-all;
  overflow-wrap: anywhere;
}
.reading-link--primary {
  border-color: var(--nav-primary-border);
  background: var(--link);
  color: var(--button-ink);
  box-shadow: 0 1px 2px var(--nav-primary-shadow);
}
@media (hover: hover) {
  .reading-link:hover {
    background: var(--selected);
  }
  .reading-link--primary:hover {
    background: var(--nav-primary-hover);
  }
}
.reading-link:active {
  transform: translateY(1px);
}
</style>
