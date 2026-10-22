<script setup lang="ts">
import { computed, useId } from 'vue';
import type { ImportDraft } from '@/shared/types';
import { draftErrors } from '@/ui/popup/drafts';

const draft = defineModel<ImportDraft>({ required: true });
const props = defineProps<{ missing?: string[] }>();

const id = useId();
const today = new Date().toISOString().slice(0, 10);
const errors = computed(() => draftErrors(draft.value, today));
const isMissing = (field: string) => props.missing?.includes(field) ?? false;

const price = computed({
  get: () => (draft.value.purchasePrice === null ? '' : String(draft.value.purchasePrice)),
  set: (v: string) => {
    const n = Number(v.replace(',', '.'));
    draft.value.purchasePrice = v.trim() === '' || Number.isNaN(n) ? null : n;
  },
});
const date = computed({
  get: () => draft.value.purchaseDate ?? '',
  set: (v: string) => (draft.value.purchaseDate = v === '' ? null : v),
});
const orderNumber = computed({
  get: () => draft.value.orderNumber ?? '',
  set: (v: string) => (draft.value.orderNumber = v.trim() === '' ? null : v.trim()),
});
</script>

<template>
  <fieldset class="editor">
    <label :for="`${id}-name`">
      Nom du produit <span aria-hidden="true">*</span>
      <span v-if="isMissing('name')" class="missing">non détecté</span>
    </label>
    <input :id="`${id}-name`" v-model="draft.name" required maxlength="255" />

    <div class="row">
      <div>
        <label :for="`${id}-price`">
          Prix d'achat ({{ draft.currency }})
          <span v-if="isMissing('purchasePrice')" class="missing">non détecté</span>
        </label>
        <input :id="`${id}-price`" v-model="price" inputmode="decimal" />
      </div>
      <div class="qty">
        <label :for="`${id}-qty`">Quantité</label>
        <input :id="`${id}-qty`" v-model.number="draft.quantity" type="number" min="1" step="1" />
      </div>
    </div>
    <p v-if="draft.currency !== 'EUR'" class="warn" role="note">
      Devise détectée : {{ draft.currency }}. HomeBox enregistre le montant sans devise.
    </p>

    <div class="row">
      <div>
        <label :for="`${id}-date`">
          Date d'achat
          <span v-if="isMissing('purchaseDate')" class="missing">non détectée</span>
        </label>
        <input :id="`${id}-date`" v-model="date" type="date" :max="today" />
      </div>
      <div>
        <label :for="`${id}-order`">
          N° de commande
          <span v-if="isMissing('orderNumber')" class="missing">non détecté</span>
        </label>
        <input :id="`${id}-order`" v-model="orderNumber" />
      </div>
    </div>

    <label :for="`${id}-seller`">
      Vendeur
      <span v-if="isMissing('purchaseFrom')" class="missing">non détecté</span>
    </label>
    <input :id="`${id}-seller`" v-model="draft.purchaseFrom" maxlength="255" />

    <label :for="`${id}-desc`">Description</label>
    <textarea :id="`${id}-desc`" v-model="draft.description" rows="2" maxlength="1000" />

    <ul v-if="errors.length" class="errors" role="alert">
      <li v-for="e in errors" :key="e">{{ e }}</li>
    </ul>
  </fieldset>
</template>

<style scoped>
.editor {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 4px 10px 10px;
  margin: 8px 0;
}
.row {
  display: flex;
  gap: 8px;
}
.row > div {
  flex: 1;
}
.row > .qty {
  flex: 0 0 80px;
}
.missing {
  background: var(--warn-bg);
  color: var(--warn-fg);
  border-radius: 4px;
  padding: 0 4px;
  margin-left: 4px;
  font-size: 11px;
}
.warn {
  color: var(--warn-fg);
  font-size: 12px;
  margin: 4px 0 0;
}
.errors {
  color: var(--danger-fg);
  font-size: 12px;
  margin: 6px 0 0;
  padding-left: 16px;
}
</style>
