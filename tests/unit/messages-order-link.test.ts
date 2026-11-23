import { isMessage } from '@/shared/messages';
import { draft } from '../contract/orchestrator-harness';

/** Spec 025 (contracts/runtime-messages.md §2): validation of `ImportDraft.orderLink` on `import/start`. Fixed values only. */
const start = (d: unknown) => ({
  type: 'import/start',
  instanceId: 'inst-a',
  tabId: 1,
  manualFiles: [],
  drafts: [d],
});

describe('import/start: orderLink (spec 025, FR-005)', () => {
  it('M1: absent is valid (unchanged draft)', () => {
    expect(isMessage(start(draft()))).toBe(true);
  });

  it('M2: true with a valid page address is valid', () => {
    expect(isMessage(start(draft({ orderLink: true })))).toBe(true);
  });

  it.each([false, null, 1, 'true', {}, []])('M3: %j is refused', (value) => {
    expect(isMessage(start({ ...draft(), orderLink: value }))).toBe(false);
  });

  it.each([
    null,
    '',
    'not a url',
    'ftp://shop.example.com/o',
    'https://user:pwd@shop.example.com/o',
  ])('M4: true with pageUrl %j is refused', (pageUrl) => {
    expect(isMessage(start(draft({ orderLink: true, pageUrl })))).toBe(false);
  });

  it('M5: true on a completed item (spec 021) is refused', () => {
    const complete = { entityId: 'item-1', itemName: 'Clavier', keys: ['photo'] };
    expect(isMessage(start(draft({ orderLink: true, complete: complete as never })))).toBe(false);
  });

  it('M6: order-link/get and order-link/set payloads', () => {
    expect(isMessage({ type: 'order-link/get', instanceId: 'inst-a' })).toBe(true);
    expect(
      isMessage({ type: 'order-link/set', instanceId: 'inst-a', settings: { enabled: true } }),
    ).toBe(true);
    expect(
      isMessage({ type: 'order-link/set', instanceId: 'inst-a', settings: { enabled: 1 } }),
    ).toBe(false);
    expect(isMessage({ type: 'order-link/get' })).toBe(false);
  });
});
