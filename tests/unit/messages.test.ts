import { fakeBrowser } from 'wxt/testing/fake-browser';
import { dispatch, register } from '@/background/router';
import { isMessage } from '@/shared/messages';
import { DOCUMENT_KINDS } from '@/shared/document-kinds';
import type { DocumentRef } from '@/shared/types';
import { draft, invoice } from '../contract/orchestrator-harness';

const doc = (over: Record<string, unknown> = {}) => ({ ...invoice, ...over });
const start = (documents: unknown) => ({
  type: 'import/start',
  tabId: 1,
  manualFiles: [],
  drafts: [{ ...draft(), documents }],
});

describe('messages: documents[] validation on import/start (007, Q-U3, V1)', () => {
  it.each(DOCUMENT_KINDS)('accepts a document of kind %s', (kind) => {
    expect(isMessage(start([doc({ kind })]))).toBe(true);
  });

  it.each(['foo', 'receipt', 'attachment', 42, null])('rejects an unknown kind %j', (kind) => {
    expect(isMessage(start([doc({ kind })]))).toBe(false);
  });

  it.each([
    ['unknown origin', { origin: 'forged' }],
    ['non-string id', { id: 3 }],
    ['non-string label', { label: 3 }],
  ])('rejects %s', (_l, over) => {
    expect(isMessage(start([doc(over)]))).toBe(false);
  });

  it('rejects a document that is not an object, and documents that is not an array', () => {
    expect(isMessage(start([42]))).toBe(false);
    expect(isMessage(start('nope'))).toBe(false);
  });

  it('accepts an empty list', () => {
    expect(isMessage(start([]))).toBe(true);
  });

  it('accepts the historical kinds of a state persisted before the feature', () => {
    const old: DocumentRef[] = [
      { ...invoice, kind: 'invoice' },
      { ...invoice, id: 'm1', origin: 'manual', kind: 'order_document' },
    ];
    expect(isMessage(start(old))).toBe(true);
  });
});

describe('router: forged kind refused before any HomeBox call (007, Q-U3)', () => {
  it('import/start with an unknown kind → BAD_MESSAGE and the handler is never reached', async () => {
    fakeBrowser.reset();
    const BASE = 'chrome-extension://abcdefghijklmnop/';
    vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation((p: string) => BASE + p.replace(/^\//, ''));
    const handler = vi.fn(async () => ({ ok: true as const, value: [] }));
    register('import/start', handler);
    const sender = { id: fakeBrowser.runtime.id, url: `${BASE}popup.html` };
    expect(await dispatch(start([doc({ kind: 'foo' })]), sender)).toEqual({ ok: false, error: 'BAD_MESSAGE' });
    expect(handler).not.toHaveBeenCalled();
    expect(await dispatch(start([doc({ kind: 'manual' })]), sender)).toEqual({ ok: true, value: [] });
  });
});
