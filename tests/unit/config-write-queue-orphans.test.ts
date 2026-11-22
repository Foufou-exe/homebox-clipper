import { fakeBrowser } from 'wxt/testing/fake-browser';
import { instanceStore } from '@/background/config/instance-store';
import { orderFieldSettings } from '@/background/order-fields/settings';
import { defaultTemplate } from '@/background/templates/default-template';
import { A, B, buildStore, seedStore } from './instances-fixture';

/** Review T098: per-instance tables are written through the configuration write queue. Fictitious values only. */
const ORDER_KEY = 'orderFieldsByInstance';
const TEMPLATE_KEY = 'defaultTemplateByInstance';
const SETTINGS = { enabled: true, names: { orderNumber: 'Order number', merchant: 'Merchant', orderUrl: 'Order URL' } };

/** Delays only the single-key read of `key` until `release()`, to force the interleaving. */
function holdRead(key: string) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const real = fakeBrowser.storage.local.get.bind(fakeBrowser.storage.local) as (k?: unknown) => Promise<unknown>;
  vi.spyOn(fakeBrowser.storage.local, 'get').mockImplementation(((k?: unknown) =>
    k === key ? gate.then(() => real(k)) : real(k)) as never);
  return () => release();
}
const later = () => new Promise((r) => setTimeout(r, 20));

describe('concurrent instance removal and per-instance write: no orphan entry', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    await seedStore(await buildStore({ instances: [A, B] }));
  });
  afterEach(() => vi.restoreAllMocks());

  it('orderFieldSettings.set vs instanceStore.remove', async () => {
    const release = holdRead(ORDER_KEY);
    const set = orderFieldSettings.set(A.id, SETTINGS);
    const removal = instanceStore.remove(A.id);
    await later();
    release();
    await Promise.all([set, removal]);
    expect((await fakeBrowser.storage.local.get(ORDER_KEY))[ORDER_KEY] ?? {}).not.toHaveProperty(A.id);
  });

  it('defaultTemplate.set vs instanceStore.remove', async () => {
    const release = holdRead(TEMPLATE_KEY);
    const set = defaultTemplate.set(A.id, { id: 't1', name: 'Tpl' });
    const removal = instanceStore.remove(A.id);
    await later();
    release();
    await Promise.all([set, removal]);
    expect((await fakeBrowser.storage.local.get(TEMPLATE_KEY))[TEMPLATE_KEY] ?? {}).not.toHaveProperty(A.id);
  });
});
