<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import type { ErrorCode } from '@/shared/errors';
import { send } from '@/shared/messages';
import type {
  ConfigView,
  DetectedProduct,
  DetectedPurchase,
  DocumentRef,
  DuplicateMatch,
  ImportDraft,
  ManualFile,
} from '@/shared/types';
import DocumentPicker from '@/ui/components/DocumentPicker.vue';
import ErrorBanner from '@/ui/components/ErrorBanner.vue';
import FieldEditor from '@/ui/components/FieldEditor.vue';
import InstanceBadge from '@/ui/components/InstanceBadge.vue';
import type { PickedDocument } from '@/ui/read-pdf';
import { draftErrors, draftFrom, emptyDraft, formatSize, missingFields } from './drafts';

const props = defineProps<{ tabId: number; config: ConfigView }>();
const emit = defineEmits<{
  submit: [payload: { drafts: ImportDraft[]; manualFiles: ManualFile[] }];
}>();

interface Line {
  key: string;
  product: DetectedProduct | null;
  selected: boolean;
  draft: ImportDraft;
}

const loading = ref(true);
const detectError = ref<ErrorCode | null>(null);
const warnings = ref<ErrorCode[]>([]);
const purchase = ref<DetectedPurchase | null>(null);
const lines = ref<Line[]>([]);
const documents = ref<{ doc: DocumentRef; selected: boolean }[]>([]);
const manualFiles = reactive(new Map<string, ManualFile>());

type Dialog =
  | { kind: 'none' }
  | { kind: 'no-invoice' }
  | { kind: 'checking' }
  | { kind: 'duplicates'; matches: DuplicateMatch[] };
const dialog = ref<Dialog>({ kind: 'none' });
const duplicateCheckFailed = ref(false);

onMounted(async () => {
  const res = await send({ type: 'detect/run', tabId: props.tabId });
  loading.value = false;
  if (!res.ok) {
    detectError.value = res.error;
    lines.value = [{ key: 'manual', product: null, selected: true, draft: emptyDraft() }];
    return;
  }
  purchase.value = res.value.purchase;
  warnings.value = res.value.warnings;
  const products = res.value.purchase.products.filter((p) => p.name.value !== null);
  lines.value = products.length
    ? products.map((p) => ({ key: p.key, product: p, selected: true, draft: draftFrom(res.value.purchase, p) }))
    : [{ key: 'manual', product: null, selected: true, draft: draftFrom(res.value.purchase, null) }];
  documents.value = res.value.purchase.documents.map((doc) => ({ doc, selected: true }));
});

const selectedLines = computed(() => lines.value.filter((l) => l.selected));
const selectedDocs = computed(() => documents.value.filter((d) => d.selected).map((d) => d.doc));
const canSubmit = computed(
  () =>
    selectedLines.value.length > 0 &&
    selectedLines.value.every((l) => draftErrors(l.draft).length === 0) &&
    dialog.value.kind === 'none',
);

function onPicked({ doc, file, replaceDetected }: PickedDocument) {
  if (replaceDetected) {
    for (const d of documents.value) if (d.doc.origin === 'detected') d.selected = false;
  }
  documents.value.push({ doc, selected: true });
  manualFiles.set(doc.id, file);
}

function removeManual(id: string) {
  documents.value = documents.value.filter((d) => d.doc.id !== id);
  manualFiles.delete(id);
}

function cancel() {
  // Annuler : rien n'est envoyé, les données détectées sont oubliées.
  purchase.value = null;
  lines.value = [];
  documents.value = [];
  manualFiles.clear();
  window.close();
}

async function onAdd() {
  if (!canSubmit.value) return;
  if (selectedDocs.value.length === 0) {
    dialog.value = { kind: 'no-invoice' };
    return;
  }
  await checkDuplicates();
}

async function checkDuplicates() {
  dialog.value = { kind: 'checking' };
  duplicateCheckFailed.value = false;
  const matches: DuplicateMatch[] = [];
  for (const line of selectedLines.value) {
    if (!line.draft.orderNumber) continue;
    const res = await send({ type: 'duplicate/check', orderNumber: line.draft.orderNumber, name: line.draft.name });
    if (res.ok) matches.push(...res.value.matches);
    else duplicateCheckFailed.value = true;
  }
  if (matches.length) {
    dialog.value = { kind: 'duplicates', matches };
    return;
  }
  submit();
}

function submit() {
  dialog.value = { kind: 'none' };
  const docs = selectedDocs.value;
  emit('submit', {
    drafts: selectedLines.value.map((l) => ({ ...l.draft, documents: docs })),
    manualFiles: docs.flatMap((d) => {
      const f = manualFiles.get(d.id);
      return f ? [f] : [];
    }),
  });
}
</script>

<template>
  <section class="summary">
    <InstanceBadge :config="config" />

    <p v-if="loading" class="muted" role="status">Détection de l'achat…</p>

    <template v-else>
      <ErrorBanner v-if="detectError" :code="detectError" tone="warning" />
      <ErrorBanner v-for="w in warnings" :key="w" :code="w" tone="warning" />
      <p v-if="detectError" class="muted">Saisissez les informations et joignez un PDF si besoin.</p>

      <h2 v-if="purchase && lines.length > 1" class="section-title">Produits détectés</h2>
      <div v-for="line in lines" :key="line.key" class="line card">
        <label v-if="lines.length > 1" class="pick">
          <input v-model="line.selected" type="checkbox" />
          <img v-if="line.product?.imageUrl.value" :src="line.product.imageUrl.value" alt="" />
          <span>{{ line.draft.name || 'Produit sans nom' }}</span>
        </label>
        <div v-else-if="line.product?.imageUrl.value" class="thumb">
          <img :src="line.product.imageUrl.value" alt="" />
        </div>
        <FieldEditor v-if="line.selected" v-model="line.draft" :missing="missingFields(purchase, line.product)" />
      </div>

      <h2 class="section-title">Documents à joindre</h2>
      <div class="card">
        <ul class="docs">
          <li v-for="d in documents" :key="d.doc.id">
            <label class="pick">
              <input v-model="d.selected" type="checkbox" />
              <span>
                {{ d.doc.label }}
                <small class="muted">
                  <span class="chip">{{ d.doc.kind === 'order_document' ? 'Bon de commande' : 'Facture' }}</span>
                  {{ d.doc.origin === 'detected' ? 'détectée sur la page' : 'fichier local' }}
                  {{ formatSize(d.doc.size) }}
                </small>
              </span>
            </label>
            <button v-if="d.doc.origin === 'manual'" class="link" type="button" @click="removeManual(d.doc.id)">
              Retirer
            </button>
          </li>
          <li v-if="documents.length === 0" class="muted">Aucun document.</li>
        </ul>
        <DocumentPicker :allow-replace="documents.some((d) => d.doc.origin === 'detected')" @add="onPicked" />
      </div>

      <div v-if="dialog.kind === 'no-invoice'" class="dialog" role="alertdialog" aria-labelledby="noinv">
        <p id="noinv">Aucune facture ne sera jointe. Créer l'objet quand même ?</p>
        <div class="actions">
          <button class="primary" type="button" @click="checkDuplicates">Créer quand même</button>
          <button type="button" @click="dialog = { kind: 'none' }">Retour</button>
        </div>
      </div>

      <div v-if="dialog.kind === 'duplicates'" class="dialog" role="alertdialog" aria-labelledby="dup">
        <ErrorBanner id="dup" code="DUPLICATE_SUSPECTED" tone="warning" />
        <ul>
          <li v-for="m in dialog.matches" :key="m.id">
            <a :href="m.url" target="_blank" rel="noopener">{{ m.name }}</a>
          </li>
        </ul>
        <div class="actions">
          <button type="button" @click="dialog = { kind: 'none' }">Annuler</button>
          <button class="primary" type="button" @click="submit">Créer quand même</button>
        </div>
      </div>
      <ErrorBanner v-if="duplicateCheckFailed" code="DUPLICATE_CHECK_FAILED" tone="warning" />

      <div class="actions footer">
        <button class="primary" type="button" :disabled="!canSubmit" @click="onAdd">
          {{ dialog.kind === 'checking' ? 'Vérification…' : 'Ajouter à HomeBox' }}
        </button>
        <button type="button" @click="cancel">Annuler</button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.line :deep(.editor) {
  margin: 0;
}
.muted {
  color: var(--muted);
}
.pick {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--fg);
  font-size: 13px;
}
.pick input {
  width: auto;
}
.pick img,
.thumb img {
  width: 32px;
  height: 32px;
  object-fit: contain;
}
.docs {
  list-style: none;
  padding: 0;
  margin: 0 0 6px;
}
.docs li {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.link {
  border: none;
  color: var(--accent);
  padding: 2px 4px;
}
.dialog {
  background: var(--bg);
  border: 1px solid var(--accent);
  border-radius: var(--radius);
  padding: 8px 10px;
  margin: 10px 0;
}
.dialog p {
  margin: 0 0 6px;
}
.actions {
  display: flex;
  gap: 8px;
}
.footer {
  margin-top: 12px;
}
</style>
