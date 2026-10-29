<script setup lang="ts">
import { computed } from 'vue';
import type { PendingImport } from '@/shared/types';
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
        </ul>
      </template>

      <p v-else-if="p.status === 'success'">
        ✓ <strong>{{ p.draft.name }}</strong>
        <template v-if="p.draft.documents.length">{{ p.draft.documents.length > 1 ? t('result.withDocuments') : t('result.withInvoice') }}</template>
        —
        <a v-if="itemLink(p)" :href="itemLink(p) ?? undefined" target="_blank" rel="noopener">{{ t('result.openInHomebox') }}</a>
      </p>

      <RecoveryView
        v-else
        :pending="p"
        :base-url="baseUrl"
        @updated="emit('updated', $event)"
        @abandoned="emit('abandoned', $event)"
      />
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
.steps {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  color: var(--muted);
}
</style>
