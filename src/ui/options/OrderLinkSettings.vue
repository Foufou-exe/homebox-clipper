<script setup lang="ts">
import { onMounted, ref, useId } from 'vue';
import type { ErrorCode } from '@/shared/errors';
import { send } from '@/shared/messages';
import { isOrderLinkSettings } from '@/shared/order-link';
import type { InstanceView } from '@/shared/types';
import ErrorBanner from '@/ui/components/ErrorBanner.vue';
import { t } from '@/ui/i18n';

/*
 * Order page link, setting of one instance (spec 025, FR-001, contracts/ui.md §1). The option holds no secret:
 * readable and writable while locked (`order-link/get|set`, no network). The help tells that the link points to the
 * merchant's website and is stored in HomeBox (principle II, FR-017). Nothing is logged.
 */
const props = defineProps<{ instance: InstanceView; locked: boolean }>();

const uid = useId();
const boxId = `${uid}-enabled`;
const helpId = `${uid}-help`;
const enabled = ref(false);
const error = ref<ErrorCode | null>(null);
const busy = ref(false);
const announce = ref('');

async function load() {
  try {
    const res = await send({ type: 'order-link/get', instanceId: props.instance.id });
    if (res?.ok && isOrderLinkSettings(res.value?.settings)) enabled.value = res.value.settings.enabled;
    else if (res && !res.ok) error.value = res.error;
  } catch {
    // the default (off) stays shown
  }
}

async function save() {
  announce.value = '';
  error.value = null;
  busy.value = true;
  try {
    const res = await send({
      type: 'order-link/set',
      instanceId: props.instance.id,
      settings: { enabled: enabled.value },
    });
    if (!res?.ok) {
      error.value = res ? res.error : 'BAD_MESSAGE';
      return;
    }
    if (isOrderLinkSettings(res.value?.settings)) enabled.value = res.value.settings.enabled;
    announce.value = t('orderLink.saved');
  } catch {
    error.value = 'BAD_MESSAGE';
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="order-link-settings" :data-locked="locked ? 'true' : undefined">
    <div class="check">
      <input :id="boxId" v-model="enabled" type="checkbox" :aria-describedby="helpId" />
      <label :for="boxId">{{ t('orderLink.optionLabel') }}</label>
    </div>
    <p :id="helpId" class="muted help">{{ t('orderLink.optionHelp') }}</p>
    <ErrorBanner v-if="error" :code="error" :instance="instance.name" />
    <button type="button" :disabled="busy" @click="save">{{ t('orderLink.save') }}</button>
    <output class="announce">{{ announce }}</output>
  </div>
</template>

<style scoped>
.order-link-settings {
  margin: 8px 0;
  font-size: 13px;
}
.check {
  display: flex;
  align-items: center;
  gap: 6px;
}
.check input {
  width: auto;
}
.muted {
  color: var(--muted);
}
.help {
  margin: 2px 0 6px;
  font-size: 12px;
}
.announce:empty {
  display: none;
}
</style>
