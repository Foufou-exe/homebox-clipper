import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

/** Spec 011 (Q-U11, R11): the optional `warranty` of a draft is validated on reception. */
const goodWarranty = {
  origin: 'legal',
  expires: '2028-11-03',
  lifetime: false,
  details: 'x',
  durationMonths: 24,
  edited: false,
};
const startWith = (warranty: unknown) => ({
  type: 'import/start',
  tabId: 1,
  manualFiles: [],
  drafts: [{ ...draft(), warranty }],
});

describe('messages: warranty validation on import/start (011, Q-U11)', () => {
  it.each([
    ['absent', undefined],
    ['null', null],
    ['conforming', goodWarranty],
    ['without expiry or duration', { ...goodWarranty, expires: null, durationMonths: null }],
    ['details of 1000 characters', { ...goodWarranty, details: 'a'.repeat(1000) }],
    ['duration 1', { ...goodWarranty, durationMonths: 1 }],
    ['duration 1200', { ...goodWarranty, durationMonths: 1200 }],
    ['lifetime', { ...goodWarranty, lifetime: true, expires: null }],
  ])('accepts a warranty that is %s', (_label, warranty) => {
    expect(isMessage(startWith(warranty))).toBe(true);
  });

  it.each([
    ['unknown origin', { ...goodWarranty, origin: 'forged' }],
    ['numeric origin', { ...goodWarranty, origin: 42 }],
    ['null origin', { ...goodWarranty, origin: null }],
    ['30 February', { ...goodWarranty, expires: '2026-02-30' }],
    ['month 13', { ...goodWarranty, expires: '2026-13-01' }],
    ['wrong date format', { ...goodWarranty, expires: '03/11/2026' }],
    ['numeric expiry', { ...goodWarranty, expires: 42 }],
    ['year 1899', { ...goodWarranty, expires: '1899-12-31' }],
    ['year 2201', { ...goodWarranty, expires: '2201-01-01' }],
    ['non boolean lifetime', { ...goodWarranty, lifetime: 'x' }],
    ['details of 1001 characters', { ...goodWarranty, details: 'a'.repeat(1001) }],
    ['non string details', { ...goodWarranty, details: 3 }],
    ['duration 0', { ...goodWarranty, durationMonths: 0 }],
    ['duration 1201', { ...goodWarranty, durationMonths: 1201 }],
    ['duration 1.5', { ...goodWarranty, durationMonths: 1.5 }],
    ['string duration', { ...goodWarranty, durationMonths: '24' }],
    ['non boolean edited', { ...goodWarranty, edited: 'no' }],
    ['lifetime with an expiry date', { ...goodWarranty, lifetime: true }],
    ['string warranty', 'x'],
    ['array warranty', []],
  ])('rejects a warranty with %s', (_label, warranty) => {
    expect(isMessage(startWith(warranty))).toBe(false);
  });

  it('a draft from before the feature (no warranty) is still accepted', () => {
    expect(isMessage({ type: 'import/start', tabId: 1, manualFiles: [], drafts: [draft()] })).toBe(true);
  });

  it('router: an invalid warranty → BAD_MESSAGE and no HomeBox call', async () => {
    fakeBrowser.reset();
    const BASE = 'chrome-extension://abcdefghijklmnop/';
    vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation((p: string) => BASE + p.replace(/^\//, ''));
    const createEntity = vi.fn();
    const updateEntity = vi.fn();
    const handler = vi.fn(async () => {
      createEntity();
      updateEntity();
      return { ok: true as const, value: [] };
    });
    register('import/start', handler);
    const sender = { id: fakeBrowser.runtime.id, url: `${BASE}popup.html` };
    expect(await dispatch(startWith({ ...goodWarranty, origin: 'forged' }), sender)).toEqual({
      ok: false,
      error: 'BAD_MESSAGE',
    });
    expect(handler).not.toHaveBeenCalled();
    expect(createEntity).not.toHaveBeenCalled();
    expect(updateEntity).not.toHaveBeenCalled();
    expect(await dispatch(startWith(goodWarranty), sender)).toEqual({ ok: true, value: [] });
  });
});

/** Spec 013 (M-2, M-3, M-4): six messages from the UI, validated on reception. */
describe('messages: session/* and update/* (013, M-2, M-3)', () => {
  const POLICIES = ['browser-close', 'idle-15m', 'idle-1h', 'idle-4h', 'every-open'];

  it.each(POLICIES)('session/set-policy accepts %s', (policy) => {
    expect(isMessage({ type: 'session/set-policy', policy })).toBe(true);
  });

  it.each(['never', 'idle-30m', 42, undefined, null, ''])('session/set-policy refuses policy = %j (M-2)', (policy) => {
    expect(isMessage({ type: 'session/set-policy', policy })).toBe(false);
  });

  it('session/set-policy without policy is refused', () => {
    expect(isMessage({ type: 'session/set-policy' })).toBe(false);
  });

  it.each(['1.0.0/../x', '', '1.2.3.4.5', 'v0.4.0', 42, undefined])('update/dismiss refuses version = %j (M-3)', (version) => {
    expect(isMessage({ type: 'update/dismiss', version })).toBe(false);
  });

  it('update/dismiss accepts a version', () => {
    expect(isMessage({ type: 'update/dismiss', version: '0.4.0' })).toBe(true);
  });

  it.each(['session/open', 'session/get-policy', 'update/state', 'update/apply'])('%s is accepted without parameter', (type) => {
    expect(isMessage({ type })).toBe(true);
  });

  it('the six types exist; the new response types declare no secret, address or activity timestamp (M-4)', () => {
    const source = readFileSync(resolve(__dirname, '../../src/shared/messages.ts'), 'utf8');
    const responses = {
      'session/open': 'ConfigView',
      'session/get-policy': 'LockSettings',
      'session/set-policy': 'Result<LockSettings>',
      'update/state': 'UpdateStateView',
      'update/dismiss': 'Result<void>',
      'update/apply': 'UpdateApplyResult',
    };
    for (const [type, response] of Object.entries(responses)) {
      expect(source, type).toContain(`'${type}': ${response};`);
    }
    const types = readFileSync(resolve(__dirname, '../../src/shared/types.ts'), 'utf8');
    const policy = readFileSync(resolve(__dirname, '../../src/shared/lock-policy.ts'), 'utf8');
    const block = (text: string, start: string) => text.slice(text.indexOf(start), text.indexOf('}', text.indexOf(start)) + 1);
    const declared = [
      block(types, 'interface UpdateStateView'),
      block(policy, 'interface LockSettings'),
      source.slice(source.indexOf('type UpdateApplyResult'), source.indexOf(';', source.indexOf('type UpdateApplyResult'))),
    ];
    for (const decl of declared) {
      expect(decl.length).toBeGreaterThan(10);
      expect(decl).not.toMatch(/\b(baseUrl|apiKey|historyKey|passphrase|at)\??:/);
    }
  });
});
