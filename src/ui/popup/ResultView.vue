<script setup lang="ts">
import { computed } from 'vue';
import type { PendingImport, PhotoStep } from '@/shared/types';
import { t } from '@/ui/i18n';
import RecoveryView from './RecoveryView.vue';

const props = defineProps<{ pendings: PendingImport[]; baseUrl: string; running: boolean }>();
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
const itemLink = (p: PendingImport) => (p.entityId ? `${props.baseUrl}/item/${p.entityId}` : null);
const allDone = computed(() => !props.running && props.pendings.every((p) => p.status === 'success'));
</script>

<template>
  <section class="result">
    <p v-if="running && pendings.length === 0" role="status">{{ t('result.running') }}</p>

    <p v-if="allDone && pendings.length" class="success" role="status">
      {{ pendings.length > 1 ? t('result.addedMany', [String(pendings.length)]) : t('result.addedOne') }}
    </p>

    <article v-for="p in pendings" :key="p.id" class="item card">
      <template v-if="p.status === 'running'">
        <p role="status"><strong>{{ p.draft.name }}</strong> {{ t('result.itemRunning') }}</p>
        <ul class="steps">
          <li>{{ t('result.stepCreate', [stepLabel(p.steps.create)]) }}</li>
          <li>{{ t('result.stepUpdate', [stepLabel(p.steps.update)]) }}</li>
          <li v-for="d in p.draft.documents" :key="d.id">
            {{ t('result.stepDocument', [d.label, stepLabel(p.steps.attachments[d.id] ?? 'pending')]) }}
          </li>
          <li v-if="photoStepLabel(p)">{{ t('result.stepPhoto', [photoStepLabel(p) ?? '']) }}</li>
        </ul>
      </template>

      <p v-else-if="p.status === 'success'">
        ✓ <strong>{{ p.draft.name }}</strong>
        <template v-if="p.draft.documents.length">{{ ' ' }}{{ p.draft.documents.length > 1 ? t('result.withDocuments') : t('result.withInvoice') }}</template>
        —
        <a v-if="itemLink(p)" :href="itemLink(p) ?? undefined" target="_blank" rel="noopener">{{ t('result.openInHomebox') }}</a>
        <small v-if="photoResult(p)" class="photo-result">{{ photoResult(p) }}</small>
        <small v-if="locationResult(p)" class="photo-result">{{ locationResult(p) }}</small>
      </p>

      <template v-else>
        <RecoveryView
          :pending="p"
          :base-url="baseUrl"
          @updated="emit('updated', $event)"
          @abandoned="emit('abandoned', $event)"
        />
        <p v-if="photoResult(p)" class="photo-result">{{ photoResult(p) }}</p>
        <p v-if="locationResult(p)" class="photo-result">{{ locationResult(p) }}</p>
      </template>
    </article>
  </section>
</template>

<style scoped>
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
