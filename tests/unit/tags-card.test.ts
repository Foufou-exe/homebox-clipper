import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flushPromises, mount } from '@vue/test-utils';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { send } from '@/shared/messages';
import TagsCard from '@/ui/options/TagsCard.vue';
import { loadCatalog } from './i18n-harness';

/** « Automatic tags » card of the options (spec 014, Q-U5, contracts/ui.md « TagsCard.vue »). Fictitious values. */
vi.mock('@/shared/messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/messages')>()),
  send: vi.fn(),
}));

const fr = loadCatalog('fr');
const ssd = { id: 'r1', contains: 'SSD', tag: 'Informatique' };
const ecran = { id: 'r2', contains: 'ecran', tag: 'Bureau' };

async function card(stored?: unknown) {
  if (stored !== undefined) await fakeBrowser.storage.local.set({ tagSettings: stored });
  const w = mount(TagsCard, { attachTo: document.body });
  await flushPromises();
  return w;
}
type W = Awaited<ReturnType<typeof card>>;
const stored = async () =>
  (await fakeBrowser.storage.local.get('tagSettings')).tagSettings as
    | { v: 1; merchantTag: boolean; rules: { id: string; contains: string; tag: string }[] }
    | undefined;
const merchant = (w: W) => w.get('input[type="checkbox"]');
const addContains = (w: W) => w.get('form.add input[name="contains"]');
const addTag = (w: W) => w.get('form.add input[name="tag"]');
const ruleItems = (w: W) => w.findAll('ul.rules > li');
const alert = (w: W) => w.find('[role="alert"]');
// <output> carries the implicit "status" role (SonarCloud S6822: no redundant explicit role).
const status = (w: W) => w.get('output.success');

beforeEach(() => {
  fakeBrowser.reset();
  vi.mocked(send).mockReset();
  vi.restoreAllMocks();
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('TagsCard: structure', () => {
  it('a card with the heading, the intro, the merchant option (checked by default) and its help', async () => {
    const w = await card();
    expect(w.element.tagName).toBe('SECTION');
    expect(w.classes()).toContain('card');
    expect(w.get('h2').text()).toBe(fr['tags.settings.title']);
    expect(w.text()).toContain(fr['tags.settings.intro']);
    expect(w.text()).toContain(fr['tags.settings.merchant']);
    expect((merchant(w).element as HTMLInputElement).checked).toBe(true);
    const help = w.get(`#${merchant(w).attributes('aria-describedby')}`);
    expect(help.text()).toBe(fr['tags.settings.merchantHelp']);
  });

  it('permanent help: contains, case and accents ignored, no regular expression; empty list', async () => {
    const w = await card();
    expect(w.text()).toContain(fr['tags.settings.rulesHelp']);
    expect(w.text()).toContain(fr['tags.settings.empty']);
    expect(ruleItems(w)).toHaveLength(0);
  });

  it('existing rules: two fields and a delete button per rule, accessible names with the rule number', async () => {
    const w = await card({ v: 1, merchantTag: true, rules: [ssd, ecran] });
    expect(ruleItems(w)).toHaveLength(2);
    const second = ruleItems(w)[1]!;
    const [contains, tag] = second.findAll('input');
    expect(contains!.attributes('aria-label')).toBe('Texte de la règle 2');
    expect((contains!.element as HTMLInputElement).value).toBe('ecran');
    expect(tag!.attributes('aria-label')).toBe('Tag de la règle 2');
    expect((tag!.element as HTMLInputElement).value).toBe('Bureau');
    const button = second.get('button');
    expect(button.text()).toBe(fr['tags.settings.delete']);
    expect(button.attributes('aria-label')).toBe('Supprimer la règle 2');
    expect(w.text()).not.toContain(fr['tags.settings.empty']);
  });
});

describe('TagsCard: adding a rule (US2-1, US2-7, SC-006)', () => {
  it('3 interactions (text, tag, Enter): stored in storage.local, fields emptied, focus on the first field, « saved »', async () => {
    const w = await card();
    await addContains(w).setValue('SSD');
    await addTag(w).setValue('Informatique');
    // Enter in a field submits the form (implicit submission): simulated by the submit event.
    await w.get('form.add').trigger('submit');
    await flushPromises();
    const value = await stored();
    expect(value?.rules.map(({ contains, tag }) => ({ contains, tag }))).toEqual([
      { contains: 'SSD', tag: 'Informatique' },
    ]);
    expect(typeof value?.rules[0]!.id).toBe('string');
    expect(value!.rules[0]!.id).not.toBe('');
    expect((addContains(w).element as HTMLInputElement).value).toBe('');
    expect((addTag(w).element as HTMLInputElement).value).toBe('');
    expect(document.activeElement).toBe(addContains(w).element);
    expect(status(w).text()).toBe(fr['tags.settings.saved']);
    expect(ruleItems(w)).toHaveLength(1);
  });

  it('the « Add the rule » button is a submit button of the form', async () => {
    const w = await card();
    const button = w.get('form.add button');
    expect(button.text()).toBe(fr['tags.settings.add']);
    expect(button.attributes('type')).toBe('submit');
  });

  it.each([
    ['empty text', '', 'Informatique', 'tags.settings.errors.containsEmpty'],
    ['blank text', '   ', 'Informatique', 'tags.settings.errors.containsEmpty'],
    ['empty tag', 'SSD', ' ', 'tags.settings.errors.tagEmpty'],
    [
      'text of 101 characters',
      'x'.repeat(101),
      'Informatique',
      'tags.settings.errors.containsTooLong',
    ],
    ['tag of 256 bytes', 'SSD', 'é'.repeat(128), 'tags.settings.errors.tagTooLong'],
  ])(
    '%s: refused with its message (role="alert"), nothing written',
    async (_label, contains, tag, key) => {
      const w = await card();
      await addContains(w).setValue(contains);
      await addTag(w).setValue(tag);
      await w.get('form.add').trigger('submit');
      await flushPromises();
      expect(alert(w).text()).toBe(fr[key]);
      expect(await stored()).toBeUndefined();
    },
  );

  it('a text typed as « .* » is plain text (no regular expression)', async () => {
    const w = await card();
    await addContains(w).setValue('.*');
    await addTag(w).setValue('Tout');
    await w.get('form.add').trigger('submit');
    await flushPromises();
    expect((await stored())?.rules[0]).toMatchObject({ contains: '.*', tag: 'Tout' });
  });
});

describe('TagsCard: editing, deleting, merchant option (US2-8)', () => {
  it('a valid change is saved on change', async () => {
    const w = await card({ v: 1, merchantTag: true, rules: [ssd] });
    const tag = ruleItems(w)[0]!.findAll('input')[1]!;
    await tag.setValue('Stockage');
    await tag.trigger('change');
    await flushPromises();
    expect((await stored())?.rules).toEqual([{ id: 'r1', contains: 'SSD', tag: 'Stockage' }]);
    expect(status(w).text()).toBe(fr['tags.settings.saved']);
  });

  it('an invalid change: message and no write', async () => {
    const w = await card({ v: 1, merchantTag: true, rules: [ssd] });
    const contains = ruleItems(w)[0]!.findAll('input')[0]!;
    await contains.setValue('  ');
    await contains.trigger('change');
    await flushPromises();
    expect(alert(w).text()).toBe(fr['tags.settings.errors.containsEmpty']);
    expect((await stored())?.rules).toEqual([ssd]);
  });

  it('delete', async () => {
    const w = await card({ v: 1, merchantTag: true, rules: [ssd, ecran] });
    await ruleItems(w)[0]!.get('button').trigger('click');
    await flushPromises();
    expect((await stored())?.rules).toEqual([ecran]);
    expect(ruleItems(w)).toHaveLength(1);
  });

  it('toggling the merchant option is saved, rules kept', async () => {
    const w = await card({ v: 1, merchantTag: true, rules: [ssd] });
    await merchant(w).setValue(false);
    await flushPromises();
    expect(await stored()).toEqual({ v: 1, merchantTag: false, rules: [ssd] });
  });
});

describe('TagsCard: failures and loading', () => {
  it('write failure: « could not be saved » (role="alert") and back to the last saved state', async () => {
    const w = await card({ v: 1, merchantTag: true, rules: [ssd] });
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValue(new Error('quota'));
    await merchant(w).setValue(false);
    await flushPromises();
    expect(alert(w).text()).toBe(fr['tags.settings.saveFailed']);
    expect((merchant(w).element as HTMLInputElement).checked).toBe(true);
    await addContains(w).setValue('ecran');
    await addTag(w).setValue('Bureau');
    await w.get('form.add').trigger('submit');
    await flushPromises();
    expect(ruleItems(w)).toHaveLength(1);
    expect(status(w).text()).toBe('');
  });

  it('loading at mount does not overwrite an action already made', async () => {
    await fakeBrowser.storage.local.set({ tagSettings: { v: 1, merchantTag: true, rules: [ssd] } });
    const w = mount(TagsCard, { attachTo: document.body });
    await merchant(w).setValue(false);
    await flushPromises();
    expect((merchant(w).element as HTMLInputElement).checked).toBe(false);
    expect(await stored()).toEqual({ v: 1, merchantTag: false, rules: [ssd] });
    expect(ruleItems(w)).toHaveLength(1);
  });

  it('works without configuration and while locked: no message to the service worker', async () => {
    const w = await card();
    await addContains(w).setValue('SSD');
    await addTag(w).setValue('Informatique');
    await w.get('form.add').trigger('submit');
    await flushPromises();
    expect(send).not.toHaveBeenCalled();
    expect((await stored())?.rules).toHaveLength(1);
  });

  it('the source has neither fetch, send(, console. nor new RegExp', () => {
    const src = readFileSync(resolve(__dirname, '../../src/ui/options/TagsCard.vue'), 'utf8');
    expect(src).not.toMatch(/fetch\(|\bsend\(|sendMessage|console\.|new RegExp/);
  });
});
