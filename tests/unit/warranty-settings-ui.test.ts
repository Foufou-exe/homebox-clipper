import { flushPromises, mount } from '@vue/test-utils';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { send } from '@/shared/messages';
import WarrantyCard from '@/ui/options/WarrantyCard.vue';
import { loadWarrantySettings } from '@/ui/warranty-settings';
import { loadCatalog, setTestLanguage } from './i18n-harness';

vi.mock('@/shared/messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/messages')>()),
  send: vi.fn(),
}));

const fr = loadCatalog('fr');

async function card() {
  const w = mount(WarrantyCard, { attachTo: document.body });
  await flushPromises();
  return w;
}
type W = Awaited<ReturnType<typeof card>>;
const box = (w: W) => w.get('input[type="checkbox"]');
const years = (w: W) => w.get('input[type="number"]');
const stored = async () => (await fakeBrowser.storage.local.get('warrantySettings')).warrantySettings;

beforeEach(() => {
  fakeBrowser.reset();
  vi.mocked(send).mockReset();
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('WarrantyCard: options (011, Q-U18, FR-007, US3)', () => {
  it('a card with a heading, the intro, the checkbox (checked by default), the duration field and the help', async () => {
    const w = await card();
    expect(w.element.tagName).toBe('SECTION');
    expect(w.classes()).toContain('card');
    expect(w.get('h2').text()).toBe(fr['warranty.settings.title']);
    expect(w.text()).toContain(fr['warranty.settings.intro']);
    expect(w.text()).toContain(fr['warranty.settings.enable']);
    expect((box(w).element as HTMLInputElement).checked).toBe(true);
    expect(years(w).attributes()).toMatchObject({ min: '1', max: '10', step: '1' });
    expect(w.text()).toContain(fr['warranty.settings.years']);
    expect(w.get('.help').text()).toBe(fr['warranty.settings.help']);
  });

  it('labels are linked to their inputs', async () => {
    const w = await card();
    expect(w.get(`label[for="${years(w).attributes('id')}"]`).text()).toBe(fr['warranty.settings.years']);
    expect(box(w).element.closest('label')?.textContent).toContain(fr['warranty.settings.enable']);
  });

  it('reads the setting when it opens', async () => {
    await fakeBrowser.storage.local.set({ warrantySettings: { v: 1, enabled: false, years: 3 } });
    const w = await card();
    expect((box(w).element as HTMLInputElement).checked).toBe(false);
    expect((years(w).element as HTMLInputElement).value).toBe('3');
  });

  it('saves on each valid change and announces it', async () => {
    const w = await card();
    await box(w).setValue(false);
    await flushPromises();
    expect(await stored()).toEqual({ v: 1, enabled: false, years: null });
    expect(w.get('[role="status"]').text()).toBe(fr['warranty.settings.saved']);
    await box(w).setValue(true);
    await years(w).setValue('3');
    await flushPromises();
    expect(await stored()).toEqual({ v: 1, enabled: true, years: 3 });
  });

  it('an empty duration is accepted and means null', async () => {
    await fakeBrowser.storage.local.set({ warrantySettings: { v: 1, enabled: true, years: 3 } });
    const w = await card();
    await years(w).setValue('');
    await flushPromises();
    expect(await stored()).toEqual({ v: 1, enabled: true, years: null });
    expect(w.find('[role="alert"]').exists()).toBe(false);
  });

  it.each(['0', '11', '-1', '1.5', '100'])('duration %s: message, nothing saved', async (value) => {
    await fakeBrowser.storage.local.set({ warrantySettings: { v: 1, enabled: true, years: 2 } });
    const w = await card();
    await years(w).setValue(value);
    await flushPromises();
    expect(w.get('[role="alert"]').text()).toBe(fr['warranty.settings.yearsInvalid']);
    expect(await stored()).toEqual({ v: 1, enabled: true, years: 2 });
  });

  it('the duration is disabled while the box is unchecked', async () => {
    const w = await card();
    await box(w).setValue(false);
    expect(years(w).attributes('disabled')).toBeDefined();
    await box(w).setValue(true);
    expect(years(w).attributes('disabled')).toBeUndefined();
  });

  it('never sends a message to the service worker', async () => {
    const w = await card();
    await years(w).setValue('4');
    await box(w).setValue(false);
    await flushPromises();
    expect(send).not.toHaveBeenCalled();
    expect((await loadWarrantySettings()).years).toBe(4);
  });

  it('English labels', async () => {
    setTestLanguage('en');
    const en = loadCatalog('en');
    const w = await card();
    expect(w.get('h2').text()).toBe(en['warranty.settings.title']);
    expect(w.text()).toContain(en['warranty.settings.enable']);
  });

  it('a write failure shows an alert and no "saved" announcement', async () => {
    const w = await card();
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValue(new Error('quota'));
    await box(w).setValue(false);
    await flushPromises();
    expect(w.get('[role="alert"]').text()).toBe(fr['warranty.settings.saveFailed']);
    expect(w.get('[role="status"]').text()).toBe('');
    vi.restoreAllMocks();
  });

  it('an input made before the initial load ends is not overwritten by it', async () => {
    await fakeBrowser.storage.local.set({ warrantySettings: { v: 1, enabled: true, years: 5 } });
    const w = mount(WarrantyCard, { attachTo: document.body });
    await years(w).setValue('2');
    await flushPromises();
    expect((years(w).element as HTMLInputElement).value).toBe('2');
  });
});
