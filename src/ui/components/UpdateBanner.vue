<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useId } from 'vue';
import { send } from '@/shared/messages';
import { releaseNotesUrl } from '@/shared/project-links';
import type { UpdateStateView } from '@/shared/types';
import { isVersion } from '@/shared/version';
import Icon from '@/ui/components/Icon.vue';
import { t } from '@/ui/i18n';

/**
 * Update banner (spec 013, contracts/ui.md): "updated to vX" notice and "Update now" button. No request: the
 * release notes link is an `<a>` the browser follows on click only (FR-013, FR-016).
 */
const id = useId();
const root = ref<HTMLElement | null>(null);
const notice = ref<string | null>(null);
const ready = ref<string | null>(null);
const blocked = ref(false);
const applying = ref(false);

const notesUrl = computed(() => (notice.value ? releaseNotesUrl(notice.value) : null));

/** Answer of `update/state`; anything else (a global `send` mock, an error) displays nothing. */
function isStateView(x: unknown): x is UpdateStateView {
  if (typeof x !== 'object' || x === null) return false;
  const v = x as Record<string, unknown>;
  const optionalVersion = (y: unknown) => y === null || isVersion(y);
  return isVersion(v.installed) && optionalVersion(v.notice) && optionalVersion(v.ready) && typeof v.blocked === 'boolean';
}

onMounted(async () => {
  try {
    const state: unknown = await send({ type: 'update/state' });
    if (!isStateView(state)) return;
    notice.value = state.notice;
    ready.value = state.ready;
    blocked.value = state.blocked;
  } catch {
    // service worker unreachable: no banner
  }
});

/** The element that follows the banner in reading order, to receive the focus once the notice is closed. */
function nextFocusable(): HTMLElement | null {
  const start = root.value;
  if (!start) return null;
  const all = [...document.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, select, textarea, [tabindex]')];
  return all.find((el) => !start.contains(el) && start.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) ?? null;
}

async function dismiss() {
  const version = notice.value;
  if (!version) return;
  const target = nextFocusable();
  notice.value = null;
  try {
    await send({ type: 'update/dismiss', version });
  } catch {
    // hidden for this page anyway; it will show again at the next opening
  }
  await nextTick();
  target?.focus();
}

async function apply() {
  if (blocked.value || applying.value) return;
  applying.value = true;
  try {
    const result = await send({ type: 'update/apply' });
    // `applied: true`: the reload closes this page, nothing else to do.
    if (result?.applied === false && result.reason === 'busy') blocked.value = true;
  } catch {
    // no answer: the button stays available
  } finally {
    applying.value = false;
  }
}
</script>

<template>
  <div ref="root" class="update-area">
    <div v-if="notice" class="update-banner" role="status">
      <p class="text">
        {{ t('update.notice', [notice]) }}
        <a v-if="notesUrl" class="notes" :href="notesUrl" target="_blank" rel="noopener noreferrer" :aria-label="t('update.notesAria', [notice])">{{
          t('update.notesLink')
        }}</a>
      </p>
      <button class="close" type="button" :aria-label="t('update.dismissAria')" :title="t('update.dismissAria')" @click="dismiss">
        <Icon name="close" :size="16" />
      </button>
    </div>
    <div v-if="ready" class="update-banner ready">
      <p class="text">{{ t('update.ready', [ready]) }}</p>
      <button
        class="apply"
        type="button"
        :disabled="blocked || applying"
        :aria-describedby="blocked ? `${id}-blocked` : `${id}-help`"
        @click="apply"
      >
        {{ t('update.applyButton') }}
      </button>
      <p :id="`${id}-help`" class="help">{{ t('update.applyHelp') }}</p>
      <p v-if="blocked" :id="`${id}-blocked`" class="help">{{ t('update.blocked') }}</p>
    </div>
  </div>
</template>

<style scoped>
.update-area:empty {
  display: none;
}
.update-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  background: var(--chip-bg);
  color: var(--chip-fg);
  border-radius: var(--radius);
  padding: 6px 8px;
  margin: 0 0 8px;
  font-size: 12px;
}
.text {
  flex: 1;
  margin: 0;
}
.help {
  flex-basis: 100%;
  margin: 0;
}
.notes {
  color: var(--chip-fg);
  text-decoration: underline;
  margin-left: 4px;
}
.close {
  display: inline-flex;
  border: none;
  background: none;
  color: var(--chip-fg);
  padding: 2px;
}
.apply {
  font-size: 12px;
}
.notes:focus-visible,
.close:focus-visible,
.apply:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
</style>
