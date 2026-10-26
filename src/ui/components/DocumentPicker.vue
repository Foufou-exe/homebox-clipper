<script setup lang="ts">
import { ref, useId } from 'vue';
import type { ErrorCode } from '@/shared/errors';
import type { DocumentRef } from '@/shared/types';
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
    replaceDetected: props.allowReplace === true && replaceDetected.value,
  });
}
</script>

<template>
  <div class="picker">
    <div class="row">
      <label :for="`${id}-kind`" class="sr-only">Type de document</label>
      <select v-if="!fixedDocId" :id="`${id}-kind`" v-model="kind">
        <option value="invoice">Facture</option>
        <option value="order_document">Bon de commande</option>
      </select>
      <label class="file">
        <input ref="input" type="file" accept="application/pdf,.pdf" @change="onChange" />
        <span>Choisir un PDF…</span>
      </label>
    </div>
    <label v-if="allowReplace" class="inline">
      <input v-model="replaceDetected" type="checkbox" />
      Remplacer la facture détectée
    </label>
    <ErrorBanner v-if="error" :code="error" />
  </div>
</template>

<style scoped>
.row {
  display: flex;
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
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
</style>
