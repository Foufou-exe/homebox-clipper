import { fakeBrowser } from 'wxt/testing/fake-browser';
import { lastLocation } from '@/background/location/last-location';

// ADAPTED (016): the table is indexed by instance id (it was indexed by origin).
const A = 'inst-a';
const B = 'inst-b';
const raw = async () => (await fakeBrowser.storage.local.get('lastLocationByInstance')).lastLocationByInstance;

describe('last-location memory (R10, FR-020, FR-021)', () => {
  beforeEach(() => fakeBrowser.reset());

  it('nothing remembered → null', async () => {
    expect(await lastLocation.get(A)).toBeNull();
  });

  // ADAPTED (016): per instance id (it was per origin).
  it('written to storage.local, key lastLocationByInstance, per origin, identifiers only', async () => {
    await lastLocation.set(A, 'loc-1');
    expect(await raw()).toEqual({ [A]: 'loc-1' });
    // No other key, no name, no purchase data.
    expect(Object.keys(await fakeBrowser.storage.local.get(null))).toEqual(['lastLocationByInstance']);
  });

  it('another origin has its own entry (US3-3)', async () => {
    await lastLocation.set(A, 'loc-1');
    await lastLocation.set(B, 'loc-2');
    expect(await lastLocation.get(A)).toBe('loc-1');
    expect(await lastLocation.get(B)).toBe('loc-2');
    await lastLocation.remove(A);
    expect(await raw()).toEqual({ [B]: 'loc-2' });
  });

  it('resolve: identifier present in the tree → returned, entry kept', async () => {
    await lastLocation.set(A, 'loc-1');
    expect(await lastLocation.resolve(A, new Set(['loc-1', 'x']))).toBe('loc-1');
    expect(await raw()).toEqual({ [A]: 'loc-1' });
  });

  it('resolve: identifier absent → null, entry removed, no error (FR-020, scenario 20)', async () => {
    await lastLocation.set(A, 'loc-1');
    await lastLocation.set(B, 'loc-2');
    await expect(lastLocation.resolve(A, new Set(['x']))).resolves.toBeNull();
    expect(await raw()).toEqual({ [B]: 'loc-2' });
  });

  it('resolve: another instance without an entry → null', async () => {
    await lastLocation.set(A, 'loc-1');
    expect(await lastLocation.resolve(B, new Set(['loc-1']))).toBeNull();
    expect(await raw()).toEqual({ [A]: 'loc-1' });
  });

  it('a corrupted value in storage is ignored without throwing', async () => {
    await fakeBrowser.storage.local.set({ lastLocationByInstance: 'pas un objet' });
    expect(await lastLocation.get(A)).toBeNull();
    await lastLocation.set(A, 'loc-1');
    expect(await raw()).toEqual({ [A]: 'loc-1' });
  });
});

describe('last-location memory indexed by instance id (016, FR-019, T012)', () => {
  beforeEach(() => fakeBrowser.reset());

  it('two instances on the same origin no longer share their last location', async () => {
    // e.g. https://homebox.example.com and https://homebox.example.com/second
    await lastLocation.set('inst-a', 'loc-1');
    await lastLocation.set('inst-second', 'loc-2');
    expect(await lastLocation.get('inst-a')).toBe('loc-1');
    expect(await lastLocation.get('inst-second')).toBe('loc-2');
    expect(await raw()).toEqual({ 'inst-a': 'loc-1', 'inst-second': 'loc-2' });
  });

  it('an origin key of the former format is never read as an instance', async () => {
    await fakeBrowser.storage.local.set({ lastLocationByInstance: { 'https://homebox.example.com': 'loc-1' } });
    expect(await lastLocation.get('inst-a')).toBeNull();
  });
});
