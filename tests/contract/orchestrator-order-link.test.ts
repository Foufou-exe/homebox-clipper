import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { HomeBoxClient } from '@/background/homebox/client';
import type { ExternalLink } from '@/background/homebox/types';
import { createOrchestrator } from '@/background/import/orchestrator';
import { pendingStore } from '@/background/import/pending-store';
import { fail, ok, type ErrorCode, type Result } from '@/shared/errors';
import type { ImportDraft, PendingImport } from '@/shared/types';
import { draft, draftPhoto, fakeClient, photoOk } from './orchestrator-harness';

/**
 * Order page link step of the orchestrator (spec 025, contracts/import-order-link.md). Local setup around the shared
 * fake client; every expectation is a fixed value. Fictitious values only.
 */
const URL_OK = 'https://www.amazon.fr/your-orders/order-details';
type Linker = (id: string, link: ExternalLink) => Result<void>;
type Trace = string[];

function setup(
  script: Parameters<typeof fakeClient>[0] = {},
  link: Linker = () => ok(undefined),
  keepStorage = false,
) {
  if (!keepStorage) fakeBrowser.reset();
  const trace: Trace = [];
  const base = fakeClient(script);
  const wrap =
    <A extends unknown[], R>(name: string, fn: (...a: A) => R) =>
    (...a: A): R => {
      trace.push(name);
      return fn(...a);
    };
  const addExternalLink = vi.fn((id: string, l: ExternalLink) => {
    trace.push('link');
    return Promise.resolve(link(id, l));
  });
  const client = {
    ...base,
    createEntity: wrap('create', base.createEntity),
    updateEntity: wrap('update', base.updateEntity),
    getEntity: wrap('get', base.getEntity),
    addAttachment: wrap('attach', base.addAttachment),
    addExternalLink,
  };
  let id = 0;
  const orchestrator = createOrchestrator({
    client: client as unknown as HomeBoxClient,
    store: pendingStore,
    downloadDetected: vi.fn(async () => ok({ base64: 'JVBERi0xLjcK' })),
    fetchPhoto: vi.fn(async () => ok(photoOk)),
    notify: () => {},
    newId: () => `p${++id}`,
  });
  return { orchestrator, addExternalLink, trace };
}

const linked = (over: Partial<ImportDraft> = {}) =>
  draft({ orderLink: true, pageUrl: URL_OK, documents: [], ...over });
const first = async (r: Promise<Result<PendingImport[]>>) => {
  const res = await r;
  if (!res.ok) throw new Error(res.error);
  return res.value[0]!;
};
const attachment = (path: string, mimeType = 'link/url') => ({
  id: 'a1',
  type: 'attachment',
  path,
  mimeType,
});

describe('order link step (spec 025)', () => {
  it('O1: one addExternalLink after creation, update and photo; step done, import success', async () => {
    const { orchestrator, addExternalLink, trace } = setup();
    const p = await first(
      orchestrator.startImport(1, [linked({ photo: draftPhoto(), documents: [] })], []),
    );
    expect(p.status).toBe('success');
    expect(addExternalLink).toHaveBeenCalledTimes(1);
    const [id, link] = addExternalLink.mock.calls[0]!;
    expect(id).toBe('e1');
    expect(link.url).toBe(URL_OK);
    expect(link.title).toBe('Page de commande - Amazon.fr');
    expect(trace).toEqual(['create', 'update', 'attach', 'link']);
  });

  it('O2: the title carries the merchant name, never the order number', async () => {
    const { orchestrator, addExternalLink } = setup();
    await first(orchestrator.startImport(1, [linked()], []));
    const title = addExternalLink.mock.calls[0]![1].title;
    expect(title).not.toContain('999-0000000-0000001');
    expect(title.length).toBeLessThanOrEqual(255);
  });

  it('O3: without orderLink: no addExternalLink, no step, no attempted flag (state unchanged)', async () => {
    const { orchestrator, addExternalLink } = setup({ update: [ok({ id: 'e1', name: 'x' })] });
    const res = await orchestrator.startImport(1, [draft({ documents: [] })], []);
    expect(res.ok).toBe(true);
    expect(addExternalLink).not.toHaveBeenCalled();
    const stored = await pendingStore.get('p1');
    expect(stored).toBeNull(); // purged after success
  });

  it('O4: the persisted state of a running import has the step only with orderLink', async () => {
    const saved: PendingImport[] = [];
    const { orchestrator } = setup({}, () => fail('ORDER_LINK_FAILED', 500));
    const spy = vi.spyOn(pendingStore, 'save').mockImplementation(async (p) => {
      saved.push(structuredClone(p));
    });
    await orchestrator.startImport(1, [linked()], []);
    await orchestrator.startImport(1, [draft({ documents: [] })], []);
    spy.mockRestore();
    expect(saved[0]!.steps.orderLink).toBe('pending');
    const plain = saved.find((s) => !s.draft.orderLink)!;
    expect('orderLink' in plain.steps).toBe(false);
    expect('orderLinkAttempted' in plain).toBe(false);
  });

  it('O5: failure: partial, ORDER_LINK_FAILED, step failed, the other steps are completed first', async () => {
    const { orchestrator, trace } = setup({}, () => fail('ORDER_LINK_FAILED', 500));
    const p = await first(orchestrator.startImport(1, [linked({ photo: draftPhoto() })], []));
    expect(p.status).toBe('partial');
    expect(p.error).toBe('ORDER_LINK_FAILED');
    expect(p.steps.orderLink).toBe('failed');
    expect(p.steps.update).toBe('done');
    expect(p.steps.photo).toBe('done');
    expect(trace.at(-1)).toBe('link');
  });

  it('O6: the attempted flag is persisted before the POST', async () => {
    const { orchestrator, addExternalLink } = setup();
    const real = pendingStore.save.bind(pendingStore);
    const order: number[] = [];
    const spy = vi.spyOn(pendingStore, 'save').mockImplementation(async (p) => {
      await real(p);
      if (p.orderLinkAttempted === true) order.push(spy.mock.invocationCallOrder.at(-1)!);
    });
    await orchestrator.startImport(1, [linked()], []);
    spy.mockRestore();
    expect(order.length).toBeGreaterThan(0);
    expect(order[0]).toBeLessThan(addExternalLink.mock.invocationCallOrder[0]!);
  });

  it('O7: a HomeBox error code of the POST other than 404 is ORDER_LINK_FAILED; an expired key too', async () => {
    for (const result of [fail('UNAUTHORIZED', 401), fail('HOMEBOX_UNREACHABLE')]) {
      const { orchestrator } = setup({}, () => result);
      const p = await first(orchestrator.startImport(1, [linked()], []));
      expect(p.error).toBe('ORDER_LINK_FAILED');
    }
  });

  it('O8: 404 and a readable item: ORDER_LINK_UNSUPPORTED', async () => {
    const { orchestrator } = setup({}, () => fail('ORDER_LINK_FAILED', 404));
    const p = await first(orchestrator.startImport(1, [linked()], []));
    expect(p.status).toBe('partial');
    expect(p.error).toBe('ORDER_LINK_UNSUPPORTED');
    expect(p.steps.orderLink).toBe('failed');
  });

  it('O9: 404 and an unreadable item: ORDER_LINK_FAILED', async () => {
    // the only item read of the run is the verification after the 404
    const { orchestrator } = setup({ get: [fail('UPDATE_FAILED', 404)] }, () =>
      fail('ORDER_LINK_FAILED', 404),
    );
    const p = await first(orchestrator.startImport(1, [linked()], []));
    expect(p.error).toBe('ORDER_LINK_FAILED');
  });

  it('O10: the error priority puts the link after the photo and before the tags', async () => {
    const { orchestrator } = setup({ attach: [fail('PHOTO_UPLOAD_FAILED', 500)] }, () =>
      fail('ORDER_LINK_FAILED', 500),
    );
    const p = await first(orchestrator.startImport(1, [linked({ photo: draftPhoto() })], []));
    expect(p.error).toBe('PHOTO_UPLOAD_FAILED');
    expect(p.steps.orderLink).toBe('failed');
  });

  it('O11: the resume reads the item: link already there ⇒ done, no second POST', async () => {
    const { orchestrator, addExternalLink } = setup({}, () => fail('HOMEBOX_UNREACHABLE'));
    const p = await first(orchestrator.startImport(1, [linked()], []));
    expect(p.steps.orderLink).toBe('failed');
    expect(addExternalLink).toHaveBeenCalledTimes(1);
    const ctx = setup(
      { get: [ok({ id: 'e1', name: 'x', attachments: [attachment(URL_OK)] })] },
      undefined,
      true,
    );
    const res = await ctx.orchestrator.retryImport(p.id);
    expect(res.ok && res.value.status).toBe('success');
    expect(ctx.addExternalLink).not.toHaveBeenCalled();
  });

  it('O12: the resume with no such link sends the POST again, once', async () => {
    const first1 = setup({}, () => fail('HOMEBOX_UNREACHABLE'));
    const p = await first(first1.orchestrator.startImport(1, [linked()], []));
    const ctx = setup(
      {
        get: [
          ok({
            id: 'e1',
            name: 'x',
            attachments: [
              attachment('https://other.example.com/o'),
              attachment(URL_OK, 'application/pdf'),
            ],
          }),
        ],
      },
      undefined,
      true,
    );
    const res = await ctx.orchestrator.retryImport(p.id);
    expect(res.ok && res.value.status).toBe('success');
    expect(ctx.addExternalLink).toHaveBeenCalledTimes(1);
  });

  it('O13: the resume whose verification read fails sends nothing (duplicate risk)', async () => {
    const first1 = setup({}, () => fail('HOMEBOX_UNREACHABLE'));
    const p = await first(first1.orchestrator.startImport(1, [linked()], []));
    const ctx = setup({ get: [fail('UPDATE_FAILED', 500)] }, undefined, true);
    const res = await ctx.orchestrator.retryImport(p.id);
    expect(ctx.addExternalLink).not.toHaveBeenCalled();
    expect(res.ok && res.value.steps.orderLink).toBe('failed');
    expect(res.ok && res.value.error).toBe('ORDER_LINK_FAILED');
  });

  it('O14: a resume after a failure elsewhere does not redo a done link', async () => {
    const first1 = setup({ update: [fail('UPDATE_FAILED', 500)] });
    const p = await first(first1.orchestrator.startImport(1, [linked()], []));
    expect(p.steps.orderLink).toBe('done');
    expect(p.status).toBe('partial');
    const ctx = setup({}, undefined, true);
    await ctx.orchestrator.retryImport(p.id);
    expect(ctx.addExternalLink).not.toHaveBeenCalled();
  });

  it('O15: several products: one link per product that carries orderLink', async () => {
    const { orchestrator, addExternalLink } = setup();
    const res = await orchestrator.startImport(
      1,
      [linked({ name: 'A' }), draft({ name: 'B', documents: [] }), linked({ name: 'C' })],
      [],
    );
    expect(res.ok).toBe(true);
    expect(addExternalLink).toHaveBeenCalledTimes(2);
    expect(addExternalLink.mock.calls.map((c) => c[0])).toEqual(['e1', 'e3']);
  });

  it('O16: a completion (spec 021) never adds a link', async () => {
    const { orchestrator, addExternalLink } = setup({
      get: [ok({ id: 'item-1', name: 'Clavier', quantity: 1, tags: [] })],
    });
    const complete = { entityId: 'item-1', itemName: 'Clavier', keys: [] as never[] };
    const d = { ...draft({ documents: [], location: null }), complete, orderLink: true as const };
    const res = await orchestrator.startImport(1, [d], []);
    expect(res.ok).toBe(true);
    expect(addExternalLink).not.toHaveBeenCalled();
  });

  it('O17: an address that cannot be attached fails the step without any request', async () => {
    const { orchestrator, addExternalLink } = setup();
    const p = await first(
      orchestrator.startImport(1, [linked({ pageUrl: 'ftp://shop.example.com/o' })], []),
    );
    expect(addExternalLink).not.toHaveBeenCalled();
    expect(p.steps.orderLink).toBe('failed');
    expect(p.error).toBe('ORDER_LINK_FAILED');
  });

  it('O18: ERROR codes are catalog members', async () => {
    const { ERROR_CODES } = await import('@/shared/errors');
    for (const code of ['ORDER_LINK_FAILED', 'ORDER_LINK_UNSUPPORTED'] as ErrorCode[])
      expect(ERROR_CODES).toContain(code);
  });
});
