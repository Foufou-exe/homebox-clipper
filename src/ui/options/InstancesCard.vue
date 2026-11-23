<script setup lang="ts">
import { computed, nextTick, ref, useId } from 'vue';
import { MAX_INSTANCES, MAX_NAME_LENGTH } from '@/background/config/instance-store';
import { originOf } from '@/background/config/url-policy';
import { requestOrigin } from '@/platform';
import type { ErrorCode } from '@/shared/errors';
import { send } from '@/shared/messages';
import type { ConfigView, InstanceView } from '@/shared/types';
import ErrorBanner from '@/ui/components/ErrorBanner.vue';
import InstanceBadge from '@/ui/components/InstanceBadge.vue';
import { t } from '@/ui/i18n';
import DefaultTemplateField from './DefaultTemplateField.vue';
import OrderFieldsSettings from './OrderFieldsSettings.vue';
import OrderLinkSettings from './OrderLinkSettings.vue';
import InstanceForm from './InstanceForm.vue';

/**
 * HomeBox instances of the options page (spec 016, US2 and US4, contracts/ui.md §2): one group per instance (from two
 * instances on; with a single one the page keeps its former look) with test, rename, change and delete, and « Add an
 * instance », disabled at the limit with the reason. Names are rendered as text only.
 */
const props = defineProps<{ view: ConfigView }>();
/** `history`: the history entries may have changed (an instance was deleted). */
const emit = defineEmits<{ changed: [history?: boolean] }>();

const uid = useId();
const limitId = `${uid}-limit`;
const instances = computed(() => props.view.instances ?? []);
const max = computed(() => props.view.maxInstances ?? MAX_INSTANCES);
const atLimit = computed(() => instances.value.length >= max.value);
/** The connection test needs the keys: unlocked, as before spec 016. */
const canTest = computed(() => props.view.locked === false && props.view.needsPassphrase !== true);
const adding = ref(false);
const announce = ref('');
const failure = ref<{ code: ErrorCode; name: string } | null>(null);
const addButton = ref<HTMLButtonElement | null>(null);

/** Per card: the open panel, the last error, a running action. */
const panel = ref<{ id: string; kind: 'rename' | 'edit' } | null>(null);
const newName = ref('');
const errors = ref<Record<string, ErrorCode>>({});
const busy = ref<string | null>(null);
const renameInput = ref<HTMLInputElement[] | HTMLInputElement | null>(null);

async function close() {
  adding.value = false;
  await nextTick();
  addButton.value?.focus();
}

async function toggle() {
  if (adding.value) return close();
  announce.value = '';
  failure.value = null;
  adding.value = true;
}

async function onDone({ name, error }: { name: string; error: ErrorCode | null }) {
  announce.value = t('instances.added', [name]);
  failure.value = error ? { code: error, name } : null;
  emit('changed');
  await close();
}

function setError(id: string, code: ErrorCode | null) {
  const next = Object.fromEntries(Object.entries(errors.value).filter(([key]) => key !== id));
  errors.value = code ? { ...next, [id]: code } : next;
}

/** The card's action buttons get the focus back when a panel closes (FR-033). */
async function focusAction(id: string, label: string) {
  await nextTick();
  const card = document.querySelector(`[data-instance="${CSS.escape(id)}"]`);
  const target = [...(card?.querySelectorAll('button') ?? [])].find((b) => b.textContent?.trim() === label);
  (target as HTMLButtonElement | undefined)?.focus();
}

async function openRename(i: InstanceView) {
  if (panel.value?.id === i.id && panel.value.kind === 'rename') {
    panel.value = null;
    return;
  }
  setError(i.id, null);
  panel.value = { id: i.id, kind: 'rename' };
  newName.value = i.name;
  await nextTick();
  const input = Array.isArray(renameInput.value) ? renameInput.value[0] : renameInput.value;
  input?.focus();
}

async function saveName(i: InstanceView) {
  setError(i.id, null);
  busy.value = i.id;
  try {
    const res = await send({ type: 'instance/rename', instanceId: i.id, name: newName.value });
    if (!res.ok) return setError(i.id, res.error);
    panel.value = null;
    emit('changed');
    await focusAction(i.id, t('instances.rename'));
  } catch {
    setError(i.id, 'BAD_MESSAGE');
  } finally {
    busy.value = null;
  }
}

function openEdit(i: InstanceView) {
  setError(i.id, null);
  panel.value = panel.value?.id === i.id && panel.value.kind === 'edit' ? null : { id: i.id, kind: 'edit' };
}

async function onEdited(i: InstanceView, { error }: { name: string; error: ErrorCode | null }) {
  panel.value = null;
  setError(i.id, error);
  emit('changed');
  await focusAction(i.id, t('instances.edit'));
}

async function test(i: InstanceView) {
  setError(i.id, null);
  busy.value = i.id;
  try {
    const res = await send({ type: 'instance/test', instanceId: i.id });
    if (res.ok) announce.value = t('common.instanceError', [i.name, t('options.connected')]);
    else setError(i.id, res.error);
    emit('changed');
  } catch {
    setError(i.id, 'BAD_MESSAGE');
  } finally {
    busy.value = null;
  }
}

/** The origin permission was withdrawn from the browser settings: asked again in the click (user gesture). */
async function requestAccess(i: InstanceView) {
  const granted = await requestOrigin(originOf(i.baseUrl)).catch(() => false);
  if (granted) setError(i.id, null);
}

async function remove(i: InstanceView) {
  // The confirmation names the instance (FR-033); the last one keeps the former message.
  const question = instances.value.length > 1 ? t('instances.confirmDelete', [i.name]) : t('options.confirmDelete');
  if (!window.confirm(question)) return;
  setError(i.id, null);
  busy.value = i.id;
  try {
    const res = await send({ type: 'instance/delete', instanceId: i.id });
    if (!res.ok) return setError(i.id, res.error);
    if (panel.value?.id === i.id) panel.value = null;
    announce.value = t('instances.deleted', [i.name]);
    emit('changed', true);
  } catch {
    setError(i.id, 'BAD_MESSAGE');
  } finally {
    busy.value = null;
  }
}

const isOpen = (i: InstanceView, kind: 'rename' | 'edit') => panel.value?.id === i.id && panel.value.kind === kind;
</script>

<template>
  <div class="instances">
    <template v-if="instances.length > 1">
      <section
        v-for="i in instances"
        :key="i.id"
        class="instance-card"
        role="group"
        :data-instance="i.id"
        :aria-label="t('instances.cardAria', [i.name])"
      >
        <h2>{{ i.name }}</h2>
        <InstanceBadge :instance="i" />
        <p class="masked">{{ i.maskedKey }}</p>
        <p v-if="i.keyState === 'unreadable' || i.keyState === 'missing'" class="key-state" role="status">
          {{ t('instances.keyUnreadable') }}
        </p>

        <ErrorBanner v-if="errors[i.id]" :code="errors[i.id]!" :instance="i.name">
          <button v-if="errors[i.id] === 'PERMISSION_DENIED'" type="button" @click="requestAccess(i)">
            {{ t('instances.requestAccess') }}
          </button>
        </ErrorBanner>

        <div class="card-actions">
          <button v-if="canTest" type="button" :disabled="busy === i.id" @click="test(i)">{{ t('options.test') }}</button>
          <button type="button" :aria-expanded="isOpen(i, 'rename') ? 'true' : 'false'" @click="openRename(i)">
            {{ t('instances.rename') }}
          </button>
          <button type="button" :aria-expanded="isOpen(i, 'edit') ? 'true' : 'false'" @click="openEdit(i)">
            {{ t('instances.edit') }}
          </button>
          <button type="button" :disabled="busy === i.id" @click="remove(i)">{{ t('instances.delete') }}</button>
        </div>
        <!-- Spec 018: default template of this instance only (FR-024). -->
        <DefaultTemplateField :instance="i" :locked="!canTest" />
        <!-- Spec 019: order fields as HomeBox custom fields, setting of this instance only (FR-001). -->
        <OrderFieldsSettings :instance="i" :locked="!canTest" />
        <!-- Spec 025: link to the order page, setting of this instance only (FR-001). -->
        <OrderLinkSettings :instance="i" :locked="!canTest" />

        <form v-if="isOpen(i, 'rename')" class="rename" @submit.prevent="saveName(i)" @keydown.esc="panel = null">
          <label :for="`${uid}-rename-${i.id}`">{{ t('instances.rename') }}</label>
          <input
            :id="`${uid}-rename-${i.id}`"
            ref="renameInput"
            v-model="newName"
            type="text"
            required
            :maxlength="MAX_NAME_LENGTH"
            autocomplete="off"
          />
          <!-- A single field: Enter submits the form too. -->
          <button type="button" :disabled="busy === i.id" @click="saveName(i)">{{ t('instances.saveName') }}</button>
        </form>

        <InstanceForm
          v-if="isOpen(i, 'edit')"
          :view="view"
          mode="edit"
          :instance="i"
          autofocus
          @done="onEdited(i, $event)"
          @cancel="panel = null"
        />
      </section>
    </template>

    <ErrorBanner v-if="failure" :code="failure.code" :instance="failure.name" />

    <button
      ref="addButton"
      class="add"
      type="button"
      :disabled="atLimit"
      :aria-expanded="adding ? 'true' : 'false'"
      :aria-describedby="atLimit ? limitId : undefined"
      @click="toggle"
    >
      {{ t('instances.add') }}
    </button>
    <p v-if="atLimit" :id="limitId" class="help">{{ t('instances.limitReached', [String(max)]) }}</p>

    <InstanceForm v-if="adding" :view="view" autofocus @done="onDone" @cancel="close" />

    <!-- Native status element: <output> has the implicit "status" role. -->
    <output class="instances-announce">{{ announce }}</output>
  </div>
</template>

<style scoped>
.instances {
  margin-top: 12px;
}
.instance-card {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 8px 10px;
  margin: 0 0 8px;
}
.instance-card h2 {
  font-size: 15px;
  margin: 0 0 6px;
  overflow-wrap: anywhere;
}
.masked {
  color: var(--muted);
  font-size: 12px;
  margin: 6px 0 0;
}
.key-state {
  background: var(--warn-bg);
  color: var(--warn-fg);
  border-radius: var(--radius);
  padding: 4px 8px;
  font-size: 12px;
  margin: 6px 0 0;
}
.card-actions,
.rename {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
  margin-top: 8px;
}
.rename input {
  flex: 1;
  min-width: 10em;
}
.help {
  color: var(--muted);
  font-size: 13px;
  margin: 4px 0 0;
}
.instances-announce {
  display: block;
  font-size: 13px;
  margin-top: 6px;
}
</style>
