import {
  MAX_IDENTIFIER_BYTES,
  cleanIdentifier,
  identifierTooLong,
  isProductIdentifiers,
  TEMPLATE_IDENTIFIER_KEYS,
} from '@/shared/identifiers';
import { lineIdentifiersFor } from '@/ui/popup/identifiers';

/** Spec 027 (data-model §1): shared rules of the product identifiers. Fictional values only. */
describe('cleanIdentifier (research R4)', () => {
  it.each([
    ['\u200eFabricant Fictif', 'Fabricant Fictif'],
    ['MOD-0001\u200f', 'MOD-0001'],
    ['\u200b\ufeffMOD\u00ad-0001', 'MOD-0001'],
    ['  Fabricant\u00a0\u202fFictif  ', 'Fabricant Fictif'],
    ['\u202aMOD-0001\u202c', 'MOD-0001'],
    ['\u2066MOD-0001\u2069', 'MOD-0001'],
    ['Fabricant\n\tFictif', 'Fabricant Fictif'],
    ['\u200e \u200f', ''],
    ['', ''],
  ])('%j becomes %j', (raw, expected) => {
    expect(cleanIdentifier(raw)).toBe(expected);
  });
});

describe('identifierTooLong (research R5: 255 UTF-8 bytes)', () => {
  it('limit is 255 bytes', () => {
    expect(MAX_IDENTIFIER_BYTES).toBe(255);
  });
  it('255 ASCII characters fit, 256 do not', () => {
    expect(identifierTooLong('a'.repeat(255))).toBe(false);
    expect(identifierTooLong('a'.repeat(256))).toBe(true);
  });
  it('counts bytes, not characters', () => {
    expect(identifierTooLong('é'.repeat(127))).toBe(false); // 254 bytes
    expect(identifierTooLong('é'.repeat(128))).toBe(true); // 256 bytes
  });
});

describe('isProductIdentifiers (data-model §1)', () => {
  it('accepts one, two or three clean values', () => {
    expect(isProductIdentifiers({ manufacturer: 'Fabricant Fictif' })).toBe(true);
    expect(isProductIdentifiers({ modelNumber: 'MOD-0001', serialNumber: 'SN-FICTIF-01' })).toBe(
      true,
    );
    expect(
      isProductIdentifiers({
        manufacturer: 'Fabricant Fictif',
        modelNumber: 'MOD-0001',
        serialNumber: 'SN-FICTIF-01',
      }),
    ).toBe(true);
  });

  it.each([
    null,
    'x',
    [],
    {},
    { brand: 'Marque' },
    { manufacturer: '' },
    { manufacturer: ' Fabricant' },
    { manufacturer: 'Fabricant\u200e' },
    { manufacturer: 1 },
    { serialNumber: 'a'.repeat(256) },
    { manufacturer: 'Fabricant Fictif', other: 'x' },
  ])('refuses %j', (value) => {
    expect(isProductIdentifiers(value)).toBe(false);
  });

  it('with a template, only the serial number is allowed (D3)', () => {
    expect(isProductIdentifiers({ serialNumber: 'SN-FICTIF-01' }, TEMPLATE_IDENTIFIER_KEYS)).toBe(
      true,
    );
    expect(
      isProductIdentifiers({ manufacturer: 'Fabricant Fictif' }, TEMPLATE_IDENTIFIER_KEYS),
    ).toBe(false);
    expect(
      isProductIdentifiers(
        { modelNumber: 'MOD-0001', serialNumber: 'SN-FICTIF-01' },
        TEMPLATE_IDENTIFIER_KEYS,
      ),
    ).toBe(false);
  });
});

describe('lineIdentifiersFor: the discreet notice only for a page actually read (spec 027, FR-008)', () => {
  const base = {
    key: 'B000000001',
    name: { value: 'Produit fictif', selector: 's' },
    unitPrice: { value: 1, selector: 's' },
    currency: { value: 'EUR', selector: 's' },
    quantity: { value: 1, selector: 's' },
    imageUrl: { value: null, reason: 'not_found' as const },
  };
  const absent = { value: null, reason: 'not_found' as const };

  it('page read, no row found: notice', () => {
    expect(
      lineIdentifiersFor({ ...base, manufacturer: absent, modelNumber: absent }).notFound,
    ).toBe(true);
  });

  it('page not read (failure, beyond the limit, no ASIN, budget exceeded: no field): no notice', () => {
    expect(lineIdentifiersFor(base).notFound).toBe(false);
    expect(lineIdentifiersFor(null).notFound).toBe(false);
  });

  it('one value found: pre-filled, no notice', () => {
    const ids = lineIdentifiersFor({
      ...base,
      manufacturer: { value: 'Fabricant Fictif', selector: 's' },
      modelNumber: absent,
    });
    expect(ids).toEqual({
      manufacturer: 'Fabricant Fictif',
      modelNumber: '',
      serialNumber: '',
      notFound: false,
    });
  });
});
