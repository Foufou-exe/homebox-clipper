import { configStore } from '@/background/config/config-store';
import { instanceStore } from '@/background/config/instance-store';
import { createHomeBoxClient } from '@/background/homebox/client';
import { register } from '@/background/router';
import { fail, ok } from '@/shared/errors';
import type { TemplateCheck } from '@/shared/types';
import { defaultTemplate } from './default-template';
import { normalizeTemplate, normalizeTemplateList } from './normalize';

/**
 * HomeBox item templates (spec 018, contracts/runtime-messages.md): reserved to extension pages (`template/` in
 * UI_ONLY_PREFIXES). Every request goes to the instance of the message only, with its own key (no fallback); the
 * answers never carry the address or the key; no template name, id, field or value is logged.
 */
export function registerTemplateHandlers(): void {
  register('template/list', async ({ instanceId }) => {
    const creds = await configStore.getCredentials(instanceId);
    if (!creds.ok) return creds;
    const list = await createHomeBoxClient(creds.value).listTemplates();
    if (!list.ok) return fail(list.error);
    const templates = normalizeTemplateList(list.value);
    const resolved = await defaultTemplate.reconcile(creds.value.id, templates);
    return ok({ templates, defaultTemplate: resolved.ref, defaultState: resolved.state });
  });

  register('template/get', async ({ instanceId, templateId }) => {
    const creds = await configStore.getCredentials(instanceId);
    if (!creds.ok) return creds;
    const out = await createHomeBoxClient(creds.value).getTemplate(templateId);
    if (!out.ok) return fail(out.error);
    const detail = await normalizeTemplate(out.value);
    return detail.ok ? ok({ template: detail.value }) : detail;
  });

  register('template/check', async ({ instanceId, refs }) => {
    const creds = await configStore.getCredentials(instanceId);
    if (!creds.ok) return creds;
    const client = createHomeBoxClient(creds.value);
    const results: TemplateCheck[] = [];
    // One read per template, one after the other (a single instance, a short list).
    for (const ref of refs) {
      const out = await client.getTemplate(ref.id); // NOSONAR: sequential on purpose
      if (!out.ok) {
        if (out.error === 'TEMPLATE_NOT_FOUND') {
          results.push({ id: ref.id, state: 'missing' });
          continue;
        }
        return fail(out.error);
      }
      const detail = await normalizeTemplate(out.value);
      if (!detail.ok) return detail;
      results.push(
        detail.value.fingerprint === ref.fingerprint
          ? { id: ref.id, state: 'same' }
          : { id: ref.id, state: 'changed', template: detail.value },
      );
    }
    return ok({ results });
  });

  // No network, no key: readable while locked (US4-6). An unknown instance is refused (no orphan entry is read).
  register('template/get-default', async ({ instanceId }) => {
    if (!(await instanceStore.byId(instanceId))) return fail('INSTANCE_NOT_FOUND');
    return ok({ defaultTemplate: await defaultTemplate.get(instanceId) });
  });

  // Unlocking required (FR-025); the name remembered is the one read on this instance, never a value of the message.
  register('template/set-default', async ({ instanceId, templateId }) => {
    const creds = await configStore.getCredentials(instanceId);
    if (!creds.ok) return creds;
    if (templateId === null) {
      await defaultTemplate.remove(creds.value.id);
      return ok({ defaultTemplate: null });
    }
    const out = await createHomeBoxClient(creds.value).getTemplate(templateId);
    if (!out.ok) return fail(out.error);
    const name = typeof out.value.name === 'string' ? out.value.name : '';
    if (name.length < 1 || name.length > 255 || out.value.id !== templateId) return fail('TEMPLATES_UNAVAILABLE');
    const ref = { id: templateId, name };
    await defaultTemplate.set(creds.value.id, ref);
    return ok({ defaultTemplate: ref });
  });
}
