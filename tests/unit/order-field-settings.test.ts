import { fakeBrowser } from 'wxt/testing/fake-browser';
import { orderFieldSettings } from '@/background/order-fields/settings';
import { DEFAULT_ORDER_FIELD_SETTINGS } from '@/shared/order-fields';

/** Order-fields setting per instance (spec 019, Q-U1, contracts/storage.md §2). Fictitious values only. */
const A = 'inst-a';
const B = 'inst-b';
const KEY = 'orderFieldsByInstance';
const NAMES = { orderNumber: 'Order number', merchant: 'Merchant', orderUrl: 'Order URL' };
const CUSTOM = {
  enabled: true,
  names: { orderNumber: 'N° commande', merchant: 'Boutique', orderUrl: 'Lien' },
};
const raw = async () => (await fakeBrowser.storage.local.get(KEY))[KEY];

describe('orderFieldSettings (storage.local, orderFieldsByInstance)', () => {
  beforeEach(() => fakeBrowser.reset());

  it('nothing stored → the default (option off, default names)', async () => {
    expect(await orderFieldSettings.get(A)).toEqual({ enabled: false, names: NAMES });
    expect(await orderFieldSettings.get(A)).toEqual(DEFAULT_ORDER_FIELD_SETTINGS);
  });

  it('set then get → the stored value, in storage.local only', async () => {
    await orderFieldSettings.set(A, CUSTOM);
    expect(await orderFieldSettings.get(A)).toEqual(CUSTOM);
    expect(await raw()).toEqual({ [A]: CUSTOM });
    expect(Object.keys(await fakeBrowser.storage.local.get(null))).toEqual([KEY]);
    expect(await fakeBrowser.storage.sync.get(null)).toEqual({});
    expect(await fakeBrowser.storage.session.get(null)).toEqual({});
  });

  it('two instances are independent', async () => {
    await orderFieldSettings.set(A, CUSTOM);
    await orderFieldSettings.set(B, { enabled: true, names: NAMES });
    await orderFieldSettings.set(A, { ...CUSTOM, enabled: false });
    expect(await orderFieldSettings.get(B)).toEqual({ enabled: true, names: NAMES });
    expect(await orderFieldSettings.get(A)).toEqual({ ...CUSTOM, enabled: false });
  });

  it('names are kept when the option is off', async () => {
    await orderFieldSettings.set(A, { ...CUSTOM, enabled: false });
    expect((await orderFieldSettings.get(A)).names).toEqual(CUSTOM.names);
  });

  it('remove: only the requested instance', async () => {
    await orderFieldSettings.set(A, CUSTOM);
    await orderFieldSettings.set(B, { enabled: true, names: NAMES });
    await orderFieldSettings.remove(A);
    expect(await raw()).toEqual({ [B]: { enabled: true, names: NAMES } });
    expect(await orderFieldSettings.get(A)).toEqual(DEFAULT_ORDER_FIELD_SETTINGS);
  });

  it.each([
    ['a string', 'x'],
    ['an array', [CUSTOM]],
    ['null', null],
    ['a number', 3],
  ])('stored value %s → default, never an exception', async (_label, value) => {
    await fakeBrowser.storage.local.set({ [KEY]: value });
    expect(await orderFieldSettings.get(A)).toEqual(DEFAULT_ORDER_FIELD_SETTINGS);
  });

  it.each([
    ['name with =', { enabled: true, names: { ...NAMES, merchant: 'a=b' } }],
    ['duplicate names', { enabled: true, names: { ...NAMES, merchant: 'Order number' } }],
    ['enabled not a boolean', { enabled: 'yes', names: NAMES }],
    ['not an object', 'enabled'],
  ])(
    'malformed entry (%s) → default for this instance; the other one kept',
    async (_label, entry) => {
      await fakeBrowser.storage.local.set({ [KEY]: { [A]: entry, [B]: CUSTOM } });
      expect(await orderFieldSettings.get(A)).toEqual(DEFAULT_ORDER_FIELD_SETTINGS);
      expect(await orderFieldSettings.get(B)).toEqual(CUSTOM);
    },
  );

  it('get returns a copy: mutating it does not change the default', async () => {
    const got = await orderFieldSettings.get(A);
    got.names.merchant = 'Changed';
    expect(DEFAULT_ORDER_FIELD_SETTINGS.names.merchant).toBe('Merchant');
  });
});
