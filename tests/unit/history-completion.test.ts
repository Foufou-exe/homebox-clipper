import { flushPromises, mount } from '@vue/test-utils';
import { toEntry } from '@/background/history/entry';
import { isValidEntry } from '@/background/history/history-crypto';
import { ok } from '@/shared/errors';
import { send } from '@/shared/messages';
import type {
  HistoryEntryView,
  ImportHistoryEntry,
  InstanceView,
  PendingImport,
} from '@/shared/types';
import HistoryList from '@/ui/components/HistoryList.vue';
import { draft } from '../contract/orchestrator-harness';
import { loadCatalog, setTestLanguage } from './i18n-harness';

// Spec 021 (US7, FR-024, research R6): the history entry of a completed item carries `completed: true`, and nothing
// of the item read. Fixed, fictitious values only.
vi.mock('@/shared/messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/messages')>()),
  send: vi.fn(),
}));

const fr = loadCatalog('fr');
const en = loadCatalog('en');
const BASE = 'https://homebox.example.com';
const ctx = { importedAt: '2026-11-22T10:00:00.000Z', instance: BASE };

function pending(over: Partial<PendingImport> = {}): PendingImport {
  return {
    id: 'p1',
    tabId: 1,
    pageUrl: null,
    draft: draft({
      location: null,
      complete: {
        entityId: 'item-1',
        itemName: 'Nom privé dans HomeBox',
        keys: ['doc:detected-0', 'notes'],
      },
    }),
    entityId: 'item-1',
    steps: {
      create: 'done',
      update: 'done',
      attachments: { 'detected-0': 'done' },
      photo: 'not_requested',
    },
    status: 'success',
    error: null,
    photoError: null,
    photoAttempted: false,
    completion: { skipped: ['purchasePrice'], present: [], quantityBase: 2, quantityTarget: 3 },
    ...over,
  };
}

describe('history entry of a completion (021, FR-024)', () => {
  it('toEntry sets completed: true only with draft.complete', () => {
    expect(toEntry(pending(), ctx).completed).toBe(true);
    const created = pending({ draft: draft(), completion: undefined });
    expect(toEntry(created, ctx)).not.toHaveProperty('completed');
  });

  it('the entry contains nothing of the item read (name in HomeBox, notes, fields, quantities)', () => {
    const entry = toEntry(pending(), ctx);
    const text = JSON.stringify(entry);
    for (const secret of [
      'Nom privé dans HomeBox',
      'purchasePrice',
      'quantityBase',
      'skipped',
      'notes',
    ])
      expect(text).not.toContain(secret);
    expect(entry.entityId).toBe('item-1');
    expect(entry.status).toBe('complete');
  });

  it('isValidEntry accepts completed: true, refuses false or another value; an entry without it stays valid', () => {
    const entry = toEntry(pending(), ctx);
    expect(isValidEntry(entry, 'p1')).toBe(true);
    expect(isValidEntry({ ...entry, completed: false }, 'p1')).toBe(false);
    expect(isValidEntry({ ...entry, completed: 'yes' }, 'p1')).toBe(false);
    const { completed, ...without } = entry;
    expect(completed).toBe(true);
    expect(isValidEntry(without as ImportHistoryEntry, 'p1')).toBe(true);
  });
});

describe('history status of a completion whose item no longer exists (021, review I1)', () => {
  it('ITEM_NOT_FOUND → failed (nothing to resume); another failure of a completion stays partial', () => {
    const gone = pending({ status: 'failed', error: 'ITEM_NOT_FOUND' });
    expect(toEntry(gone, ctx)).toMatchObject({
      status: 'failed',
      missing: [],
      reason: 'ITEM_NOT_FOUND',
      completed: true,
    });
    const other = pending({ status: 'failed', error: 'UPDATE_FAILED' });
    expect(toEntry(other, ctx).status).toBe('partial');
  });
});

describe('HistoryList: "Existing item completed" (021, FR-024)', () => {
  const INSTANCES: InstanceView[] = [
    {
      id: 'inst-a',
      name: 'homebox.example.com',
      baseUrl: BASE,
      maskedKey: 'hb_••••a1b2',
      lastCheck: null,
      keyState: 'ready',
    },
  ];
  const view = (completed: boolean): HistoryEntryView => ({
    ...toEntry(pending(completed ? {} : { draft: draft(), completion: undefined }), ctx),
    id: completed ? 'h1' : 'h2',
    resumable: false,
    instanceId: 'inst-a',
  });

  it.each(['fr', 'en'] as const)(
    'the mention is shown for a completed entry only (%s)',
    async (lang) => {
      setTestLanguage(lang);
      const cat = lang === 'fr' ? fr : en;
      vi.mocked(send).mockImplementation((() =>
        Promise.resolve(
          ok({ state: 'ready', enabled: true, entries: [view(true), view(false)] }),
        )) as never);
      const w = mount(HistoryList, { props: { instances: INSTANCES } });
      await flushPromises();
      const entries = w.findAll('li.entry');
      expect(entries[0]!.text()).toContain(cat['completion.historyCompleted']);
      expect(entries[1]!.text()).not.toContain(cat['completion.historyCompleted']);
      expect(cat['completion.historyCompleted']).toBe(
        lang === 'fr' ? 'Objet existant complété' : 'Existing item completed',
      );
    },
  );
});
