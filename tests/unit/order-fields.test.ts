import {
  DEFAULT_ORDER_FIELD_NAMES,
  DEFAULT_ORDER_FIELD_SETTINGS,
  ORDER_FIELD_ROLES,
  caseVariantOf,
  fieldNameError,
  isOrderFieldSettings,
  orderValueError,
} from '@/shared/order-fields';

/** Shared validation of the order fields (spec 019, Q-U1, data-model §1). Fictitious values only. */
const ORDER_URL = 'https://www.amazon.fr/gp/your-account/order-details';
const NAMES = { orderNumber: 'Order number', merchant: 'Merchant', orderUrl: 'Order URL' };

describe('order fields: constants (FR-001, FR-002)', () => {
  it('default names are HomeBox data names, identical in every language', () => {
    expect(DEFAULT_ORDER_FIELD_NAMES).toEqual(NAMES);
  });

  it('roles in the order number, merchant, URL', () => {
    expect(ORDER_FIELD_ROLES).toEqual(['orderNumber', 'merchant', 'orderUrl']);
  });

  it('the option is off by default, with the default names', () => {
    expect(DEFAULT_ORDER_FIELD_SETTINGS).toEqual({ enabled: false, names: NAMES });
  });
});

describe('fieldNameError (FR-003, UTF-8 bytes)', () => {
  it.each(['', '   '])('%j → empty', (name) => {
    expect(fieldNameError(name, [])).toBe('empty');
  });

  it.each(['a=b', 'a\u0001b', 'a\u007Fb', 'a\u0085b'])('%j → forbiddenChar', (name) => {
    expect(fieldNameError(name, [])).toBe('forbiddenChar');
  });

  it('bounds in UTF-8 bytes, never characters', () => {
    expect(fieldNameError('é'.repeat(127), [])).toBeNull(); // 254 bytes
    expect(fieldNameError('é'.repeat(128), [])).toBe('tooLong'); // 256 bytes
    expect(fieldNameError('a'.repeat(255), [])).toBeNull();
    expect(fieldNameError('a'.repeat(256), [])).toBe('tooLong');
  });

  it('edge spaces are removed before measuring', () => {
    expect(fieldNameError(` ${'a'.repeat(255)} `, [])).toBeNull();
  });

  it('duplicate: case and edge spaces ignored', () => {
    expect(fieldNameError('order number', ['Order number', 'Merchant'])).toBe('duplicate');
    expect(fieldNameError(' Merchant ', ['Order number', 'merchant'])).toBe('duplicate');
    expect(fieldNameError('Order URL', ['Order number', 'Merchant'])).toBeNull();
  });

  it('priority: empty > forbiddenChar > tooLong > duplicate', () => {
    expect(fieldNameError(' ', ['', ' '])).toBe('empty');
    expect(fieldNameError('='.repeat(300), ['='.repeat(300)])).toBe('forbiddenChar');
    expect(fieldNameError('a'.repeat(256), ['a'.repeat(256)])).toBe('tooLong');
  });

  it('accents, inner spaces and symbols are accepted', () => {
    expect(fieldNameError('N° commande', [])).toBeNull();
    expect(fieldNameError('Prix (€) & co', [])).toBeNull();
  });
});

describe('orderValueError (FR-012, FR-013)', () => {
  it.each(['orderNumber', 'merchant', 'orderUrl'] as const)(
    '%s: empty or spaces → null (field not created)',
    (role) => {
      expect(orderValueError(role, '')).toBeNull();
      expect(orderValueError(role, '   ')).toBeNull();
    },
  );

  it('bounds in UTF-8 bytes', () => {
    expect(orderValueError('merchant', 'é'.repeat(250))).toBeNull(); // 500 bytes
    expect(orderValueError('merchant', 'é'.repeat(251))).toBe('tooLong'); // 502 bytes
    expect(orderValueError('orderNumber', 'é'.repeat(251))).toBe('tooLong');
  });

  it.each([ORDER_URL, 'http://x.example'])('orderUrl %s → null', (value) => {
    expect(orderValueError('orderUrl', value)).toBeNull();
  });

  it.each(['ftp://x.example', 'javascript:alert(1)', 'amazon.fr/x', 'not a url'])(
    'orderUrl %s → invalidUrl',
    (value) => {
      expect(orderValueError('orderUrl', value)).toBe('invalidUrl');
    },
  );

  it('orderUrl too long → tooLong', () => {
    expect(orderValueError('orderUrl', `https://${'a'.repeat(600)}`)).toBe('tooLong');
  });

  it('orderNumber and merchant have no URL check', () => {
    expect(orderValueError('orderNumber', 'not a url')).toBeNull();
    expect(orderValueError('merchant', 'ftp://x.example')).toBeNull();
  });
});

describe('caseVariantOf (FR-005)', () => {
  it('a name differing only by case or edge spaces → the existing name', () => {
    expect(caseVariantOf('order number', ['Order number', 'Merchant'])).toBe('Order number');
    expect(caseVariantOf(' order number ', ['Order number', 'Merchant'])).toBe('Order number');
  });

  it('identical name → null', () => {
    expect(caseVariantOf('Order number', ['Order number'])).toBeNull();
  });

  it('no candidate → null', () => {
    expect(caseVariantOf('Boutique', ['Order number', 'Merchant'])).toBeNull();
    expect(caseVariantOf('Boutique', [])).toBeNull();
  });
});

describe('isOrderFieldSettings', () => {
  it('accepts valid settings', () => {
    expect(isOrderFieldSettings({ enabled: true, names: NAMES })).toBe(true);
    expect(
      isOrderFieldSettings({
        enabled: false,
        names: { orderNumber: 'N° commande', merchant: 'Boutique', orderUrl: 'Lien' },
      }),
    ).toBe(true);
  });

  it.each([
    ['enabled not a boolean', { enabled: 'true', names: NAMES }],
    [
      'missing name',
      { enabled: true, names: { orderNumber: 'Order number', merchant: 'Merchant' } },
    ],
    ['name with =', { enabled: true, names: { ...NAMES, merchant: 'a=b' } }],
    [
      'duplicate names (case ignored)',
      { enabled: true, names: { ...NAMES, merchant: 'order number' } },
    ],
    ['name not trimmed', { enabled: true, names: { ...NAMES, orderUrl: ' Order URL' } }],
    ['name not a string', { enabled: true, names: { ...NAMES, orderUrl: 3 } }],
    ['names an array', { enabled: true, names: ['a', 'b', 'c'] }],
    ['empty object', {}],
    ['null', null],
    ['array', [true, NAMES]],
  ])('refuses %s', (_label, value) => {
    expect(isOrderFieldSettings(value)).toBe(false);
  });
});
