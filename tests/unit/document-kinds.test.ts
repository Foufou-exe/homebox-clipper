import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DOCUMENT_KINDS, homeboxTypeOf, isDocumentKind, isOptionalHomeboxType, type DocumentKind } from '@/shared/document-kinds';

describe('document kinds (007, Q-U1)', () => {
  it('DOCUMENT_KINDS is exactly the five kinds, in order', () => {
    expect([...DOCUMENT_KINDS]).toEqual(['invoice', 'manual', 'warranty', 'delivery_note', 'order_document']);
  });

  it.each([
    ['invoice', 'receipt'],
    ['order_document', 'attachment'],
    ['manual', 'manual'],
    ['warranty', 'warranty'],
    ['delivery_note', 'attachment'],
  ] as const)('homeboxTypeOf(%s) → %s', (kind, type) => {
    expect(homeboxTypeOf(kind)).toBe(type);
  });

  it.each(['foo', undefined, null, 42, '', {}, []])('homeboxTypeOf is total: %j → attachment, no exception', (v) => {
    expect(homeboxTypeOf(v as unknown as DocumentKind)).toBe('attachment');
  });

  it('never returns photo or a value outside AttachmentType', () => {
    const allowed = ['receipt', 'attachment', 'manual', 'warranty'];
    for (const k of [...DOCUMENT_KINDS, 'photo', 'receipt', 'x'] as string[]) {
      const t = homeboxTypeOf(k as DocumentKind);
      expect(t).not.toBe('photo');
      expect(allowed).toContain(t);
    }
  });

  it('isDocumentKind: true for the five kinds only', () => {
    for (const k of DOCUMENT_KINDS) expect(isDocumentKind(k)).toBe(true);
    for (const x of ['', 'Invoice', 'photo', 'receipt', 'attachment', {}, [], null, undefined, 3]) {
      expect(isDocumentKind(x), JSON.stringify(x)).toBe(false);
    }
  });

  it('source: no import from ui/, background/ or content/, no browser API', () => {
    const src = readFileSync(resolve(__dirname, '../../src/shared/document-kinds.ts'), 'utf8');
    expect(src).not.toMatch(/from\s+['"][^'"]*(ui|background|content)\//);
    expect(src).not.toMatch(/\b(browser|chrome)\./);
    expect(src).not.toMatch(/\bfetch\(|console\./);
  });
});

describe('isOptionalHomeboxType (007)', () => {
  it.each([['manual', true], ['warranty', true], ['receipt', false], ['attachment', false], ['photo', false]] as const)('%s → %s', (t, expected) => {
    expect(isOptionalHomeboxType(t)).toBe(expected);
  });
});
