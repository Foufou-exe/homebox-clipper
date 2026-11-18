<script setup lang="ts">
import { onMounted, ref, useId } from 'vue';
import { DEFAULT_TAG_SETTINGS, normalizeTagName, ruleTextError, tagNameError, type TagRule, type TagSettings } from '@/shared/tags';
import { t } from '@/ui/i18n';
import { loadTagSettings, saveTagSettings } from '@/ui/tag-settings';

/**
 * « Automatic tags » card of the options page (spec 014, contracts/ui.md): store-name option and user rules
 * « the product name contains <text> → tag <name> » (plain text, never a regular expression). Saved in
 * `storage.local` at each valid change; no message to the service worker, so it works configured or not,
 * locked or not.
 */
const id = useId();
const containsField = ref<HTMLInputElement | null>(null);

const copyOf = (s: TagSettings): TagSettings => ({ v: 1, merchantTag: s.merchantTag, rules: s.rules.map((r) => ({ ...r })) });

/** Last state written (or read): the display comes back to it after a write failure. */
let saved: TagSettings = copyOf(DEFAULT_TAG_SETTINGS);
/** Displayed state (the rule fields are edited in place, saved on `change`). */
const view = ref<TagSettings>(copyOf(saved));
const newContains = ref('');
const newTag = ref('');

type ErrorKey =
  | 'tags.settings.errors.containsEmpty'
  | 'tags.settings.errors.containsTooLong'
  | 'tags.settings.errors.tagEmpty'
  | 'tags.settings.errors.tagTooLong'
  | 'tags.settings.saveFailed';
const error = ref<ErrorKey | null>(null);
const announce = ref('');
/** Changed when the display comes back to the saved state: the edited fields are rendered again from it. */
const revision = ref(0);

/*
 * Loading at mount never overwrites an action already made: every action waits for the stored value first and
 * applies on top of it (so a rule stored before is never lost).
 */
let resolveReady!: () => void;
const ready = new Promise<void>((r) => (resolveReady = r));
let touched = false;

onMounted(async () => {
  try {
    saved = await loadTagSettings();
  } finally {
    if (!touched) view.value = copyOf(saved);
    resolveReady();
  }
});

/** Message of an invalid rule, or `null`. */
function ruleError(contains: string, tag: string): ErrorKey | null {
  const c = ruleTextError(contains);
  if (c) return c === 'empty' ? 'tags.settings.errors.containsEmpty' : 'tags.settings.errors.containsTooLong';
  const g = tagNameError(tag);
  if (g) return g === 'empty' ? 'tags.settings.errors.tagEmpty' : 'tags.settings.errors.tagTooLong';
  return null;
}

/** Writes a valid state; on failure, the display comes back to the last saved state. */
async function write(next: TagSettings): Promise<boolean> {
  const written = await saveTagSettings(next);
  if (written) {
    saved = copyOf(next);
    error.value = null;
    announce.value = t('tags.settings.saved');
  } else {
    error.value = 'tags.settings.saveFailed';
    announce.value = '';
  }
  view.value = copyOf(saved);
  if (!written) revision.value++;
  return written;
}

async function onMerchant(event: Event) {
  touched = true;
  const checked = (event.target as HTMLInputElement).checked;
  await ready;
  await write({ ...copyOf(saved), merchantTag: checked });
}

async function onRuleChange(ruleId: string, field: 'contains' | 'tag', event: Event) {
  touched = true;
  const value = (event.target as HTMLInputElement).value;
  await ready;
  const current = saved.rules.find((r) => r.id === ruleId);
  if (!current) return;
  const edited: TagRule = { ...current, [field]: value };
  const invalid = ruleError(edited.contains, edited.tag);
  if (invalid) {
    error.value = invalid;
    announce.value = '';
    return;
  }
  const normalized = { ...edited, contains: normalizeTagName(edited.contains), tag: normalizeTagName(edited.tag) };
  await write({ ...copyOf(saved), rules: saved.rules.map((r) => (r.id === ruleId ? normalized : { ...r })) });
}

async function onDelete(ruleId: string) {
  touched = true;
  await ready;
  await write({ ...copyOf(saved), rules: saved.rules.filter((r) => r.id !== ruleId).map((r) => ({ ...r })) });
}

async function onAdd() {
  touched = true;
  const contains = newContains.value;
  const tag = newTag.value;
  const invalid = ruleError(contains, tag);
  if (invalid) {
    error.value = invalid;
    announce.value = '';
    return;
  }
  await ready;
  const rule: TagRule = { id: crypto.randomUUID(), contains: normalizeTagName(contains), tag: normalizeTagName(tag) };
  if (await write({ ...copyOf(saved), rules: [...saved.rules.map((r) => ({ ...r })), rule] })) {
    newContains.value = '';
    newTag.value = '';
    containsField.value?.focus();
  }
}
</script>

<template>
  <section class="card">
    <h2>{{ t('tags.settings.title') }}</h2>
    <p class="intro">{{ t('tags.settings.intro') }}</p>
    <label class="check">
      <input :key="`merchant-${revision}`" type="checkbox" :checked="view.merchantTag" :aria-describedby="`${id}-merchant-help`" @change="onMerchant" />
      <span>{{ t('tags.settings.merchant') }}</span>
    </label>
    <p :id="`${id}-merchant-help`" class="help">{{ t('tags.settings.merchantHelp') }}</p>

    <h3>{{ t('tags.settings.rulesTitle') }}</h3>
    <p :id="`${id}-rules-help`" class="help">{{ t('tags.settings.rulesHelp') }}</p>
    <ul v-if="view.rules.length" class="rules">
      <li v-for="(rule, i) in view.rules" :key="`${rule.id}-${revision}`">
        <input
          type="text"
          :value="rule.contains"
          :aria-label="t('tags.settings.containsFor', [String(i + 1)])"
          :aria-describedby="`${id}-rules-help`"
          @input="rule.contains = ($event.target as HTMLInputElement).value"
          @change="onRuleChange(rule.id, 'contains', $event)"
        />
        <span class="arrow" aria-hidden="true">→</span>
        <input
          type="text"
          :value="rule.tag"
          :aria-label="t('tags.settings.tagFor', [String(i + 1)])"
          @input="rule.tag = ($event.target as HTMLInputElement).value"
          @change="onRuleChange(rule.id, 'tag', $event)"
        />
        <button type="button" :aria-label="t('tags.settings.deleteFor', [String(i + 1)])" @click="onDelete(rule.id)">
          {{ t('tags.settings.delete') }}
        </button>
      </li>
    </ul>
    <p v-else class="help">{{ t('tags.settings.empty') }}</p>

    <form class="add" @submit.prevent="onAdd">
      <div class="field">
        <label :for="`${id}-contains`">{{ t('tags.settings.contains') }}</label>
        <input
          :id="`${id}-contains`"
          ref="containsField"
          v-model="newContains"
          name="contains"
          type="text"
          :aria-describedby="`${id}-rules-help`"
        />
      </div>
      <div class="field">
        <label :for="`${id}-tag`">{{ t('tags.settings.tag') }}</label>
        <input :id="`${id}-tag`" v-model="newTag" name="tag" type="text" />
      </div>
      <button type="submit">{{ t('tags.settings.add') }}</button>
    </form>
    <p v-if="error" class="error" role="alert">{{ t(error) }}</p>
    <p class="success" role="status">{{ announce }}</p>
  </section>
</template>

<style scoped>
h2 {
  font-size: 17px;
  margin: 0 0 8px;
}
h3 {
  font-size: 14px;
  margin: 12px 0 4px;
  color: var(--fg);
}
.intro,
.help {
  color: var(--muted);
  font-size: 13px;
}
.help {
  margin: 4px 0 0;
}
.check {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--fg);
  font-size: 14px;
  margin: 8px 0 0;
}
.check input {
  width: auto;
}
.rules {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
}
.rules li {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 4px 0;
}
.rules input {
  flex: 1;
  min-width: 0;
}
.rules button {
  flex: none;
}
.arrow {
  color: var(--muted);
}
.add {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 8px;
  margin: 10px 0 0;
}
.field {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 10em;
  gap: 2px;
  font-size: 13px;
}
.error {
  color: var(--danger-fg);
  font-size: 13px;
}
.success {
  color: var(--success-fg, var(--fg));
  font-size: 13px;
  margin: 6px 0 0;
}
</style>
