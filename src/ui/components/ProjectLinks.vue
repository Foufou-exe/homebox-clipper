<script setup lang="ts">
import { PROJECT_LINKS } from '@/shared/project-links';
import { t } from '@/ui/i18n';

withDefaults(defineProps<{ variant?: 'footer' | 'buttons' }>(), { variant: 'footer' });
</script>

<template>
  <div class="project-links" :class="variant">
    <a class="project-link" :href="PROJECT_LINKS.support" target="_blank" rel="noopener noreferrer" :aria-label="t('links.supportAria')">{{ t('links.support') }}</a>
    <a class="project-link" :href="PROJECT_LINKS.github" target="_blank" rel="noopener noreferrer" :aria-label="t('links.githubAria')">{{ t('links.github') }}</a>
  </div>
</template>

<style scoped>
.project-links {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.footer {
  justify-content: center;
  font-size: 12px;
}
.project-link {
  color: var(--accent-text);
  text-decoration: underline;
  padding: 4px 8px;
  border-radius: var(--radius);
}
.buttons .project-link {
  background: var(--bg);
  border: 1px solid var(--border);
  text-decoration: none;
  font-size: 14px;
}
.buttons .project-link:hover {
  border-color: var(--accent);
}
a.project-link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
</style>
