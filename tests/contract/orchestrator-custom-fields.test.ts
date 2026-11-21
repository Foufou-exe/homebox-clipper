import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { HomeBoxClient } from '@/background/homebox/client';
import type { EntityOut, EntityUpdate } from '@/background/homebox/types';
import { toEntry } from '@/background/history/entry';
import { createOrchestrator } from '@/background/import/orchestrator';
import { pendingStore } from '@/background/import/pending-store';
import { fail, ok } from '@/shared/errors';
import type { ImportHistoryEntry } from '@/shared/types';
import { draft } from './orchestrator-harness';

/** Issue #109: an object read back with custom fields keeps them through the import PUT. Fictitious values. */
const FIELDS = [
  { id: 'f1', name: 'Color', type: 'text', textValue: 'black', numberValue: 0, booleanValue: false },
  { id: 'f2', name: 'Ports', type: 'number', textValue: '', numberValue: 4, booleanValue: false },
  { id: 'f3', name: 'Wireless', type: 'boolean', textValue: '', numberValue: 0, booleanValue: true },
];

async function run(fields: EntityOut['fields']) {
  fakeBrowser.reset();
  const puts: EntityUpdate[] = [];
  const out: EntityOut = { id: 'e1', name: 'Clavier', ...(fields === undefined ? {} : { fields }) };
  const client = {
    baseUrl: 'https://homebox.example.com',
    createEntity: vi.fn(async () => ok(out)),
    getEntity: vi.fn(async () => ok(out)),
    updateEntity: vi.fn(async (_id: string, data: EntityUpdate) => {
      puts.push(structuredClone(data));
      return ok(out);
    }),
    addAttachment: vi.fn(async () => ok(undefined)),
    listTags: vi.fn(async () => ok([])),
    createTag: vi.fn(),
    listLocations: vi.fn(async () => ok([])),
    searchEntities: vi.fn(async () => ok([])),
    getStatus: vi.fn(),
    checkAuth: vi.fn(),
  };
  const history: ImportHistoryEntry[] = [];
  const orchestrator = createOrchestrator({
    client: client as unknown as HomeBoxClient,
    store: pendingStore,
    downloadDetected: vi.fn(async () => ok({ base64: '' })),
    fetchPhoto: vi.fn(async () => fail('PHOTO_UNAVAILABLE')),
    history: {
      start: async (p) => void history.push(toEntry(p, { importedAt: '2026-11-18T10:00:00.000Z', instance: 'https://homebox.example.com' })),
      update: async (p) => void history.push(toEntry(p, { importedAt: '2026-11-18T10:00:00.000Z', instance: 'https://homebox.example.com' })),
    },
    notify: () => {},
    newId: () => 'p1',
  });
  const res = await orchestrator.startImport(1, [draft({ documents: [] })], []);
  if (!res.ok) throw new Error(res.error);
  return puts;
}

describe('custom fields survive the import PUT (#109)', () => {
  it('the PUT carries the custom fields of the object read back', async () => {
    const puts = await run(FIELDS);
    expect(puts.length).toBeGreaterThan(0);
    for (const put of puts) expect(put.fields).toEqual(FIELDS);
  });

  it('an object without custom fields sends no `fields` key', async () => {
    const puts = await run(undefined);
    expect(puts.length).toBeGreaterThan(0);
    for (const put of puts) expect('fields' in put).toBe(false);
  });
});
