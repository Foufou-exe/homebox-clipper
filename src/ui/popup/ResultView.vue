<script setup lang="ts">
import { computed } from 'vue';
import type { ErrorCode } from '@/shared/errors';
import type { DocumentRef, InstanceView, PendingImport, PhotoStep } from '@/shared/types';
import { DOCUMENT_KIND_KEYS } from '@/ui/document-kind-keys';
import { t } from '@/ui/i18n';
import { instanceById } from '@/ui/instances';
import RecoveryView from './RecoveryView.vue';
import { doneMessage, keyNames } from './completion';

/** `instances`: the configured instances; the links of an import use ITS instance (spec 016), never the default one. */
const props = defineProps<{
  pendings: PendingImport[];
  instances: InstanceView[];
  running: boolean;
  /** Error of the whole batch, shown by App.vue (spec 018: a template changed or deleted, nothing was created). */
  batchError?: ErrorCode | null;
}>();
const templateBatchError = computed(() => props.batchError === 'TEMPLATE_NOT_FOUND' || props.batchError === 'TEMPLATE_CHANGED');
const emit = defineEmits<{ updated: [pending: PendingImport]; abandoned: [id: string] }>();

const STEP_LABELS = {
  pending: 'result.stepPending',
  done: 'result.stepDone',
  failed: 'result.stepFailed',
} as const;
const stepLabel = (step: keyof typeof STEP_LABELS) => t(STEP_LABELS[step]);

/** `sending` is displayed as "pending": the upload is in progress, nothing is confirmed yet. */
const PHOTO_STEP_LABELS = {
  pending: 'result.stepPending',
  sending: 'result.stepPending',
  done: 'result.stepDone',
  failed: 'result.stepFailed',
} as const;
const photoStep = (p: PendingImport): PhotoStep => p.steps.photo ?? 'not_requested';
const photoStepLabel = (p: PendingImport) => {
  const step = photoStep(p);
  return step in PHOTO_STEP_LABELS ? t(PHOTO_STEP_LABELS[step as keyof typeof PHOTO_STEP_LABELS]) : null;
};

const PHOTO_RESULTS = {
  done: 'result.photoAdded',
  not_requested: 'result.photoNotRequested',
  unavailable: 'result.photoUnavailable',
  failed: 'result.photoFailed',
} as const;
/** Photo outcome, per product (FR-009); nothing while the object does not exist or the photo is pending. */
const photoResult = (p: PendingImport) => {
  const step = photoStep(p);
  return p.entityId && step in PHOTO_RESULTS ? t(PHOTO_RESULTS[step as keyof typeof PHOTO_RESULTS]) : null;
};
/** Location retained for the object, once created (US2-5). Absent from a state persisted by a previous version. */
const locationResult = (p: PendingImport) =>
  p.entityId && p.draft.location ? t('result.locationAt', [p.draft.location.path.join(t('location.pathSeparator'))]) : null;
const kindKeys = (d: DocumentRef) => DOCUMENT_KIND_KEYS[d.kind] ?? DOCUMENT_KIND_KEYS.order_document;
/** "With its manual" for one document, "with its documents" for several. */
const withDocuments = (p: PendingImport) => {
  const [only] = p.draft.documents;
  return only && p.draft.documents.length === 1 ? t(kindKeys(only).withDocument) : t('result.withDocuments');
};
/** Documents attached as a plain attachment after a 422 (the user is always told, never silent). */
const fallbackNotes = (p: PendingImport) =>
  (p.attachmentFallbacks ?? []).flatMap((id) => {
    const d = p.draft.documents.find((x) => x.id === id);
    return d ? [t('documents.storedAsAttachment', [d.label, t(kindKeys(d).label)])] : [];
  });
/** Tags not applied (spec 014, FR-012): their names are shown, the import can be retried. */
const tagsFailed = (p: PendingImport) =>
  p.entityId && p.failedTags?.length ? t('result.tagsFailed', [p.failedTags.join(', ')]) : null;
const instanceOf = (p: PendingImport) => instanceById(props.instances, p.instanceId);
const itemLink = (p: PendingImport) => {
  const instance = instanceOf(p);
  return p.entityId && instance ? `${instance.baseUrl}/item/${p.entityId}` : null;
};
/** With several instances, the instances the shown imports went to, by name (US3-6). */
const importedTo = computed(() =>
  props.instances.length > 1
    ? [...new Set(props.pendings.flatMap((p) => instanceOf(p)?.name ?? []))]
    : [],
);
/**
 * Spec 021 (contracts/ui-completion.md §4): what a completion did not write, each on its own line: no change at all,
 * values filled in HomeBox meanwhile (never overwritten), documents already attached.
 */
const completionNotes = (p: PendingImport): string[] => {
  const c = p.completion;
  if (!p.draft.complete || !c) return [];
  const notes: string[] = [];
  if (c.noChange) notes.push(t('result.noChange'));
  if (c.skipped.length) notes.push(t('result.skipped', [keyNames(c.skipped, p.draft)]));
  if (c.present.length) notes.push(t('result.present', [keyNames(c.present.map((id) => `doc:${id}` as const), p.draft)]));
  return notes;
};
const allDone = computed(() => !props.running && props.pendings.every((p) => p.status === 'success'));
</script>

<template>
  <section class="result">
    <output v-if="templateBatchError" class="muted">{{ t('templates.backToSummary') }}</output>
    <p v-if="running && pendings.length === 0" role="status">{{ t('result.running') }}</p>
    <p v-for="name in importedTo" :key="name" class="imported-to">{{ t('result.importedTo', [name]) }}</p>

    <p v-if="allDone && pendings.length" class="success" role="status">
      {{ doneMessage(pendings.filter((p) => !p.draft.complete).length, pendings.filter((p) => p.draft.complete).length) }}
    </p>

    <article v-for="p in pendings" :key="p.id" class="item card">
      <template v-if="p.status === 'running'">
        <p role="status"><strong>{{ p.draft.name }}</strong> {{ t('result.itemRunning') }}</p>
        <ul class="steps">
          <!-- Spec 021: a completed item is never created; one step updates it. -->
          <li v-if="p.draft.complete">{{ t('result.stepComplete', [stepLabel(p.steps.update)]) }}</li>
          <template v-else>
            <li>{{ t('result.stepCreate', [stepLabel(p.steps.create)]) }}</li>
            <li>{{ t('result.stepUpdate', [stepLabel(p.steps.update)]) }}</li>
          </template>
          <li v-for="d in p.draft.documents" :key="d.id">
            {{ t('result.stepDocument', [d.label, t(kindKeys(d).label), stepLabel(p.steps.attachments[d.id] ?? 'pending')]) }}
          </li>
          <li v-if="photoStepLabel(p)">{{ t('result.stepPhoto', [photoStepLabel(p) ?? '']) }}</li>
          <!-- Spec 018: only for an import with a template (absent otherwise, invariant 1). -->
          <li v-if="p.steps.templateFields">{{ t('result.stepTemplateFields', [stepLabel(p.steps.templateFields)]) }}</li>
          <!-- Spec 019: only for an import with order fields (absent otherwise, invariant 1). -->
          <li v-if="p.steps.orderFields">{{ t('result.stepOrderFields', [stepLabel(p.steps.orderFields)]) }}</li>
          <!-- Spec 025: only for an import with the order page link (absent otherwise, invariant 1). -->
          <li v-if="p.steps.orderLink">{{ t('result.stepOrderLink', [stepLabel(p.steps.orderLink)]) }}</li>
        </ul>
      </template>

      <p v-else-if="p.status === 'success'">
        ✓ <strong>{{ p.draft.name }}</strong>
        <template v-if="p.draft.complete">{{ ' ' }}— {{ t('result.completed') }}</template>
        <template v-else-if="p.draft.documents.length">{{ ' ' }}{{ withDocuments(p) }}</template>
        —
        <a v-if="itemLink(p)" :href="itemLink(p) ?? undefined" target="_blank" rel="noopener">{{ t('result.openInHomebox') }}</a>
        <small v-if="photoResult(p)" class="photo-result">{{ photoResult(p) }}</small>
        <small v-if="locationResult(p)" class="photo-result">{{ locationResult(p) }}</small>
        <small v-for="note in fallbackNotes(p)" :key="note" class="photo-result">{{ note }}</small>
        <small v-for="note in completionNotes(p)" :key="note" class="photo-result">{{ note }}</small>
        <!-- Spec 019 (US1-6): the order fields step is shown done for the product. -->
        <small v-if="p.steps.orderFields" class="photo-result">{{ t('result.stepOrderFields', [stepLabel(p.steps.orderFields)]) }}</small>
        <small v-if="p.steps.orderLink" class="photo-result">{{ t('result.stepOrderLink', [stepLabel(p.steps.orderLink)]) }}</small>
      </p>

      <template v-else>
        <RecoveryView
          :pending="p"
          :instance="instanceOf(p)"
          :named="instances.length > 1"
          @updated="emit('updated', $event)"
          @abandoned="emit('abandoned', $event)"
        />
        <p v-if="photoResult(p)" class="photo-result">{{ photoResult(p) }}</p>
        <p v-if="locationResult(p)" class="photo-result">{{ locationResult(p) }}</p>
        <p v-if="tagsFailed(p)" class="photo-result">{{ tagsFailed(p) }}</p>
        <p v-for="note in completionNotes(p)" :key="note" class="photo-result">{{ note }}</p>
        <p v-if="p.steps.templateFields" class="photo-result">{{ t('result.stepTemplateFields', [stepLabel(p.steps.templateFields)]) }}</p>
        <p v-if="p.steps.orderFields" class="photo-result">{{ t('result.stepOrderFields', [stepLabel(p.steps.orderFields)]) }}</p>
        <p v-if="p.steps.orderLink" class="photo-result">{{ t('result.stepOrderLink', [stepLabel(p.steps.orderLink)]) }}</p>
      </template>
    </article>
  </section>
</template>

<style scoped>
.muted {
  color: var(--muted);
}
output.muted {
  display: block;
  margin: 1em 0;
}
.imported-to {
  margin: 4px 0;
  font-size: 13px;
}
.success {
  background: var(--success-bg);
  color: var(--success-fg);
  border-radius: var(--radius);
  padding: 8px 10px;
}
.item p {
  margin: 6px 0;
}
.photo-result {
  display: block;
  font-size: 12px;
  color: var(--muted);
}
.steps {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  color: var(--muted);
}
</style>
