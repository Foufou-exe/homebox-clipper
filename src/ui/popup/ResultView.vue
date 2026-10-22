<script setup lang="ts">
import { computed } from 'vue';
import type { PendingImport } from '@/shared/types';
import RecoveryView from './RecoveryView.vue';

const props = defineProps<{ pendings: PendingImport[]; baseUrl: string; running: boolean }>();
const emit = defineEmits<{ updated: [pending: PendingImport]; abandoned: [id: string] }>();

const STEP_LABELS = { pending: 'en attente', done: 'fait', failed: 'échec' } as const;
const itemLink = (p: PendingImport) => (p.entityId ? `${props.baseUrl}/item/${p.entityId}` : null);
const allDone = computed(() => !props.running && props.pendings.every((p) => p.status === 'success'));
</script>

<template>
  <section class="result">
    <p v-if="running && pendings.length === 0" role="status">Import en cours…</p>

    <p v-if="allDone && pendings.length" class="success" role="status">
      {{ pendings.length > 1 ? `${pendings.length} objets ajoutés` : 'Objet ajouté' }} à HomeBox.
    </p>

    <article v-for="p in pendings" :key="p.id" class="item">
      <template v-if="p.status === 'running'">
        <p role="status"><strong>{{ p.draft.name }}</strong> — import en cours…</p>
        <ul class="steps">
          <li>Création de l'objet : {{ STEP_LABELS[p.steps.create] }}</li>
          <li>Informations d'achat : {{ STEP_LABELS[p.steps.update] }}</li>
          <li v-for="d in p.draft.documents" :key="d.id">
            {{ d.label }} : {{ STEP_LABELS[p.steps.attachments[d.id] ?? 'pending'] }}
          </li>
        </ul>
      </template>

      <p v-else-if="p.status === 'success'">
        ✓ <strong>{{ p.draft.name }}</strong>
        <template v-if="p.draft.documents.length">avec {{ p.draft.documents.length > 1 ? 'ses documents' : 'sa facture' }}</template>
        —
        <a v-if="itemLink(p)" :href="itemLink(p) ?? undefined" target="_blank" rel="noopener">Ouvrir dans HomeBox</a>
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
  border-radius: 6px;
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
