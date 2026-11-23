import { fakeBrowser } from 'wxt/testing/fake-browser';
import { activeImports, registerImportHandlers } from '@/background/import/handlers';
import { pendingStore } from '@/background/import/pending-store';
import { dispatch } from '@/background/router';
import { fail } from '@/shared/errors';
import type { PendingImport } from '@/shared/types';
import { ITEM_ID, completeDraft, completionSetup, existing, firstOf } from './completion-harness';

/**
 * Spec 021 (contracts/homebox-completion.md §4, O14 to O17; US7): resuming a completion reads the item again and only
 * applies what remains; never a document of the same title twice, never the photo once the number of photos grew,
 * never the quantity increase twice. Fixed, fictitious values only.
 */

const TAGS = [
  { id: 't-bureau', name: 'Bureau' },
  { id: 't-amazon', name: 'Amazon' },
];
const GET = `GET /entities/${ITEM_ID}`;
const PUT = `PUT /entities/${ITEM_ID}`;
const ATTACH = `POST /entities/${ITEM_ID}/attachments`;

describe('orchestrator: resuming a completion (021, US7, O14 to O17)', () => {
  it('O14: PUT answer lost (applied by HomeBox), resume: quantity read = target → no second increase', async () => {
    const { orchestrator, client, items, calls } = completionSetup({
      items: [existing()],
      tags: TAGS,
    });
    client.updateEntity.mockImplementationOnce(async (id, body) => {
      calls.push(`PUT /entities/${id}`);
      items.get(id)!.quantity = body.quantity;
      return fail('HOMEBOX_UNREACHABLE');
    });
    const first = firstOf(
      await orchestrator.startImport(
        5,
        [completeDraft([], { quantity: 1 }, { quantityIncrease: 1 })],
        [],
      ),
    );
    expect(first.status).toBe('partial');
    expect(first.completion).toMatchObject({ quantityBase: 2, quantityTarget: 3 });
    expect(items.get(ITEM_ID)!.quantity).toBe(3);

    const retried = await orchestrator.retryImport(first.id);
    expect(retried.ok && retried.value.status).toBe('success');
    expect(calls).toEqual([GET, PUT, GET]);
    expect(items.get(ITEM_ID)!.quantity).toBe(3);
    expect(retried.ok && retried.value.completion?.skipped).toEqual([]);
  });

  it('O14 bis: quantity changed by someone else meanwhile → not modified, reported as skipped', async () => {
    const { orchestrator, client, items } = completionSetup({ items: [existing()], tags: TAGS });
    client.updateEntity.mockImplementationOnce(async () => fail('HOMEBOX_UNREACHABLE'));
    const first = firstOf(
      await orchestrator.startImport(
        5,
        [completeDraft([], { quantity: 1 }, { quantityIncrease: 1 })],
        [],
      ),
    );
    items.get(ITEM_ID)!.quantity = 7;
    const retried = await orchestrator.retryImport(first.id);
    expect(retried.ok && retried.value.completion?.skipped).toEqual(['quantity']);
    expect(items.get(ITEM_ID)!.quantity).toBe(7);
  });

  it('O15: the invoice failed, the resume reads the item again and sends only the missing document; no PUT', async () => {
    const { orchestrator, calls } = completionSetup({
      items: [existing()],
      tags: TAGS,
      attach: [fail('ATTACHMENT_FAILED', 500)],
    });
    const first = firstOf(
      await orchestrator.startImport(5, [completeDraft(['doc:detected-0', 'purchasePrice'])], []),
    );
    expect(first.status).toBe('partial');
    expect(calls).toEqual([GET, PUT, ATTACH]);
    const retried = await orchestrator.retryImport(first.id);
    expect(retried.ok && retried.value.status).toBe('success');
    expect(calls).toEqual([GET, PUT, ATTACH, GET, ATTACH]);
  });

  it('O15 bis: the invoice POST answer was lost but HomeBox kept it → found by its title, not sent again', async () => {
    const { orchestrator, client, items, calls } = completionSetup({
      items: [existing()],
      tags: TAGS,
    });
    client.addAttachment.mockImplementationOnce(async (id, file) => {
      calls.push(`POST /entities/${id}/attachments`);
      items.get(id)!.attachments = [
        { id: 'att-x', type: file.type, primary: false, title: file.filename },
      ];
      return fail('HOMEBOX_UNREACHABLE');
    });
    const first = firstOf(
      await orchestrator.startImport(5, [completeDraft(['doc:detected-0'])], []),
    );
    const retried = await orchestrator.retryImport(first.id);
    expect(calls).toEqual([GET, ATTACH, GET]);
    // Our own earlier POST: done, not reported as "already present".
    expect(retried.ok && retried.value.completion?.present).toEqual([]);
    expect(retried.ok && retried.value.steps.attachments['detected-0']).toBe('done');
    expect(retried.ok && retried.value.status).toBe('success');
  });

  it('O16: interrupted during the photo, more photos read than before → photo done, not sent again', async () => {
    const { orchestrator, client, items, calls } = completionSetup({
      items: [existing()],
      tags: TAGS,
    });
    client.addAttachment.mockImplementationOnce(async (id, file) => {
      calls.push(`POST /entities/${id}/attachments`);
      items.get(id)!.attachments = [
        { id: 'att-p', type: file.type, primary: true, title: file.filename },
      ];
      return fail('HOMEBOX_UNREACHABLE');
    });
    const first = firstOf(await orchestrator.startImport(5, [completeDraft(['photo'])], []));
    expect(first.completion?.photoCountBefore).toBe(0);
    // The service worker stopped during the POST: the state stays `sending`, the import is orphaned.
    const stored = (await pendingStore.get(first.id))!;
    await pendingStore.save({
      ...stored,
      status: 'running',
      steps: { ...stored.steps, photo: 'sending' },
    });
    const retried = await orchestrator.retryImport(first.id);
    expect(calls).toEqual([GET, ATTACH, GET]);
    expect(retried.ok && retried.value.steps.photo).toBe('done');
    expect(retried.ok && retried.value.status).toBe('success');
  });

  it('O16 bis: a photo POST that really failed is sent again on resume (number of photos unchanged)', async () => {
    const { orchestrator, calls } = completionSetup({
      items: [existing()],
      tags: TAGS,
      attach: [fail('ATTACHMENT_FAILED', 500)],
    });
    const first = firstOf(await orchestrator.startImport(5, [completeDraft(['photo'])], []));
    expect(first.steps.photo).toBe('failed');
    const retried = await orchestrator.retryImport(first.id);
    expect(calls).toEqual([GET, ATTACH, GET, ATTACH]);
    expect(retried.ok && retried.value.steps.photo).toBe('done');
  });

  it('O17: tags of the item unknown (field absent) → no PUT at all (it would remove the tags), update failed, retryable', async () => {
    const { orchestrator, calls, puts } = completionSetup({
      items: [existing({ tags: undefined })],
      tags: TAGS,
    });
    const p = firstOf(
      await orchestrator.startImport(5, [completeDraft(['tag:amazon', 'purchasePrice'])], []),
    );
    expect(calls).toEqual([GET]);
    expect(puts).toEqual([]);
    expect(p.steps.update).toBe('failed');
    expect(p.steps.tags).toBe('failed');
    expect(p.failedTags).toEqual(['Amazon']);
    expect(p.status).toBe('partial');
    expect(p.error).toBe('UPDATE_FAILED');
  });

  it('M2: PUT answer lost after HomeBox applied it → the resume reports nothing as "filled meanwhile"', async () => {
    const { orchestrator, client, items, calls } = completionSetup({
      items: [existing()],
      tags: TAGS,
    });
    client.updateEntity.mockImplementationOnce(async (id, body) => {
      calls.push(`PUT /entities/${id}`);
      Object.assign(items.get(id)!, { purchasePrice: body.purchasePrice, notes: body.notes });
      return fail('HOMEBOX_UNREACHABLE');
    });
    const first = firstOf(
      await orchestrator.startImport(5, [completeDraft(['purchasePrice', 'notes'])], []),
    );
    expect(first.status).toBe('partial');
    const retried = await orchestrator.retryImport(first.id);
    expect(retried.ok && retried.value.status).toBe('success');
    expect(retried.ok && retried.value.completion?.skipped).toEqual([]);
    expect(calls).toEqual([GET, PUT, GET]);
  });

  it('a resume after a refused PUT recomputes the patch on the item read again', async () => {
    const { orchestrator, puts } = completionSetup({
      items: [existing()],
      tags: TAGS,
      update: [fail('UPDATE_FAILED', 500)],
    });
    const first = firstOf(
      await orchestrator.startImport(5, [completeDraft(['purchasePrice', 'tag:amazon'])], []),
    );
    expect(first.steps.update).toBe('failed');
    const retried = await orchestrator.retryImport(first.id);
    expect(retried.ok && retried.value.status).toBe('success');
    expect(puts).toHaveLength(2);
    expect(puts[1]!.body).toMatchObject({ purchasePrice: 99.99, tagIds: ['t-bureau', 't-amazon'] });
  });

  it('import/retry with a location (or without any) is refused before any request: the item exists', async () => {
    const { orchestrator, calls } = completionSetup({
      items: [existing()],
      tags: TAGS,
      attach: [fail('ATTACHMENT_FAILED', 500)],
    });
    const first = firstOf(
      await orchestrator.startImport(5, [completeDraft(['doc:detected-0'])], []),
    );
    const before = calls.length;
    expect(await orchestrator.retryImport(first.id, [], { id: 'loc-2', path: ['Cave'] })).toEqual({
      ok: false,
      error: 'BAD_MESSAGE',
    });
    expect(await orchestrator.retryImport(first.id, [], null)).toEqual({
      ok: false,
      error: 'BAD_MESSAGE',
    });
    expect(calls).toHaveLength(before);
  });

  it('a 404 on resume → ITEM_NOT_FOUND, nothing written, nothing created', async () => {
    const { orchestrator, calls, items } = completionSetup({
      items: [existing()],
      tags: TAGS,
      attach: [fail('ATTACHMENT_FAILED', 500)],
    });
    const first = firstOf(
      await orchestrator.startImport(5, [completeDraft(['doc:detected-0'])], []),
    );
    items.delete(ITEM_ID);
    const retried = await orchestrator.retryImport(first.id);
    expect(retried.ok && retried.value).toMatchObject({
      status: 'failed',
      error: 'ITEM_NOT_FOUND',
    });
    expect(calls).toEqual([GET, ATTACH, GET]);
  });
});

describe('import/pending: an orphaned completion (021, US7)', () => {
  const EXT = 'chrome-extension://abcdefghijklmnop/';
  const call = (msg: unknown) =>
    dispatch(msg, { id: fakeBrowser.runtime.id, url: `${EXT}popup.html` });

  beforeEach(() => {
    fakeBrowser.reset();
    vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation(
      (p: string) => EXT + p.replace(/^\//, ''),
    );
    activeImports.clear();
    registerImportHandlers();
  });

  it('a running completion without process → partial, never createUncertain', async () => {
    const orphan: PendingImport = {
      id: 'c1',
      tabId: 5,
      pageUrl: null,
      draft: completeDraft(['photo']),
      entityId: ITEM_ID,
      steps: { create: 'done', update: 'done', attachments: {}, photo: 'sending' },
      photoError: null,
      photoAttempted: true,
      createAttempted: true,
      status: 'running',
      error: null,
      completion: { skipped: [], present: [], photoCountBefore: 0 },
    };
    await pendingStore.save(orphan);
    const list = (await call({ type: 'import/pending', tabId: 5 })) as PendingImport[];
    expect(list[0]).toMatchObject({
      id: 'c1',
      status: 'partial',
      entityId: ITEM_ID,
      orphaned: true,
    });
    expect(list[0]).not.toHaveProperty('createUncertain');
  });
});

describe('spec 024: chosen collection no longer reachable while completing', () => {
  it('the read of the item refused (403) → COLLECTION_UNAVAILABLE, not UPDATE_FAILED; nothing written', async () => {
    const { orchestrator, client, puts } = completionSetup({ items: [existing()], tags: TAGS });
    client.getEntity.mockImplementationOnce(async () => fail('COLLECTION_UNAVAILABLE', 403));
    const p = firstOf(await orchestrator.startImport(5, [completeDraft(['purchasePrice'])], []));
    expect(puts).toEqual([]);
    expect(p.steps.update).toBe('failed');
    expect(p.error).toBe('COLLECTION_UNAVAILABLE');
  });

  it('the PUT refused (403) → COLLECTION_UNAVAILABLE, a single PUT', async () => {
    const { orchestrator, puts } = completionSetup({
      items: [existing()],
      tags: TAGS,
      update: [fail('COLLECTION_UNAVAILABLE', 403)],
    });
    const p = firstOf(await orchestrator.startImport(5, [completeDraft(['purchasePrice'])], []));
    expect(puts).toHaveLength(1);
    expect(p.error).toBe('COLLECTION_UNAVAILABLE');
  });
});
