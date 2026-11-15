<script setup lang="ts">
import { ref, useId } from 'vue';
import type { ErrorCode } from '@/shared/errors';
import type { DocumentRef } from '@/shared/types';
import { DOCUMENT_KIND_KEYS, DOCUMENT_KIND_OPTIONS, canReplaceDetected } from '@/ui/document-kind-keys';
import { t } from '@/ui/i18n';
import { readPdf, type PickedDocument } from '@/ui/read-pdf';
import ErrorBanner from './ErrorBanner.vue';

const props = defineProps<{ allowReplace?: boolean; fixedDocId?: string }>();
const emit = defineEmits<{ add: [picked: PickedDocument] }>();

const id = useId();
const kind = ref<DocumentRef['kind']>('invoice');
const replaceDetected = ref(true);
const error = ref<ErrorCode | null>(null);
const input = ref<HTMLInputElement | null>(null);
let counter = 0;

async function onChange(event: Event) {
  error.value = null;
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const result = await readPdf(file);
  if (input.value) input.value.value = '';
  if (!result.ok) {
    error.value = result.error;
    return;
  }
  const docId = props.fixedDocId ?? `manual-${Date.now()}-${counter++}`;
  emit('add', {
    doc: { id: docId, origin: 'manual', kind: kind.value, label: file.name, size: file.size, pdfValid: true },
    file: { docId, filename: file.name, base64: result.base64 },
    replaceDetected: props.allowReplace === true && canReplaceDetected(kind.value) && replaceDetected.value,
  });
}
</script>

<template>
  <div class="picker" :class="{ separated: !fixedDocId }">
    <template v-if="!fixedDocId">
      <h3 :id="`${id}-title`" class="title">{{ t('documents.addTitle') }}</h3>
      <p :id="`${id}-hint`" class="hint">{{ t('documents.addHint') }}</p>
    </template>
    <div class="row">
      <template v-if="!fixedDocId">
        <label :for="`${id}-kind`" class="kind-label">{{ t('documents.kindShort') }}</label>
        <select :id="`${id}-kind`" v-model="kind" :aria-describedby="`${id}-hint`">
          <option v-for="k in DOCUMENT_KIND_OPTIONS" :key="k" :value="k">{{ t(DOCUMENT_KIND_KEYS[k].label) }}</option>
        </select>
      </template>
      <label class="file">
        <input ref="input" type="file" accept="application/pdf,.pdf" @change="onChange" />
        <span>{{ t('documents.choose') }}</span>
      </label>
    </div>
    <label v-if="allowReplace && canReplaceDetected(kind)" class="inline">
      <input v-model="replaceDetected" type="checkbox" />
      {{ t('documents.replaceDetected') }}
    </label>
    <ErrorBanner v-if="error" :code="error" />
  </div>
</template>

<style scoped>
.separated {
  border-top: 1px solid var(--border);
  margin-top: 8px;
  padding-top: 8px;
}
.title {
  margin: 0 0 2px;
  font-size: 13px;
  font-weight: 600;
  color: var(--fg);
}
.hint {
  margin: 0 0 6px;
  font-size: 12px;
  color: var(--muted);
}
.kind-label {
  font-size: 12px;
  color: var(--muted);
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
select {
  font: inherit;
  color: var(--fg);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 5px;
}
.file input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
}
.file span {
  display: inline-block;
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  padding: 5px 10px;
  cursor: pointer;
}
.file:focus-within span {
  outline: 2px solid var(--accent);
}
.inline {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--fg);
}
.inline input {
  width: auto;
}
</style>
