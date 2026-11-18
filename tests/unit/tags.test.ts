import { fold } from '@/shared/fold';
import {
  DEFAULT_TAG_SETTINGS,
  MAX_RULE_TEXT,
  MAX_TAG_BYTES,
  MAX_TAGS_PER_PRODUCT,
  findExisting,
  normalizeTagName,
  proposeTags,
  ruleMatches,
  ruleTextError,
  tagKey,
  tagNameError,
  unionIds,
  type TagSettings,
} from '@/shared/tags';

/** Pure tag functions (spec 014, Q-U1). Fictitious values only. */
const rule = (contains: string, tag: string, id = `r-${contains}`) => ({ id, contains, tag });
const settings = (over: Partial<TagSettings> = {}): TagSettings => ({
  ...DEFAULT_TAG_SETTINGS,
  ...over,
});

describe('normalizeTagName (Q-U1 a)', () => {
  it('trims and collapses inner whitespace to a single space', () => {
    expect(normalizeTagName('  Écran   sans\tfil \n')).toBe('Écran sans fil');
  });

  it('applies NFC (decomposed é becomes the composed character)', () => {
    const decomposed = 'é';
    expect(normalizeTagName(decomposed)).toBe('é');
    expect(normalizeTagName(decomposed)).toHaveLength(1);
  });
});

describe('tagKey (Q-U1 b)', () => {
  it('ignores case and accents', () => {
    expect(tagKey('Écran')).toBe(tagKey('ECRAN'));
    expect(tagKey('  Écran  sans   fil ')).toBe('ecran sans fil');
  });
});

describe('tagNameError: limit in UTF-8 bytes, not characters (Q-U1 c)', () => {
  it.each(['', '   '])('%j → empty', (s) => {
    expect(tagNameError(s)).toBe('empty');
  });

  it('255 bytes → null, 256 bytes → tooLong', () => {
    expect(tagNameError('a'.repeat(255))).toBeNull();
    expect(tagNameError('a'.repeat(256))).toBe('tooLong');
  });

  it('accented characters count twice: é×127 (254 bytes) → null, é×128 (256 bytes) → tooLong', () => {
    expect(tagNameError('é'.repeat(127))).toBeNull();
    expect(tagNameError('é'.repeat(128))).toBe('tooLong');
  });

  it('a normal name → null', () => {
    expect(tagNameError('Amazon')).toBeNull();
  });
});

describe('ruleTextError (Q-U1 d)', () => {
  it('empty → empty; 100 characters → null; 101 → tooLong', () => {
    expect(ruleTextError('')).toBe('empty');
    expect(ruleTextError('  ')).toBe('empty');
    expect(ruleTextError('x'.repeat(100))).toBeNull();
    expect(ruleTextError('x'.repeat(101))).toBe('tooLong');
  });
});

describe('ruleMatches: plain text, case and accents ignored (Q-U1 e)', () => {
  it('« ssd » matches products whose name contains it, whatever the case', () => {
    expect(ruleMatches(rule('ssd', 'Informatique'), 'Disque dur interne ssd 1 To')).toBe(true);
    expect(ruleMatches(rule('ssd', 'Informatique'), 'Disque SSD Exemple 1 To')).toBe(true);
  });

  it('« ecran » matches « Écran sans fil »', () => {
    expect(ruleMatches(rule('ecran', 'Bureau'), 'Écran sans fil')).toBe(true);
  });

  it('« SSD » does not match « Clé USB Exemple »', () => {
    expect(ruleMatches(rule('SSD', 'Informatique'), 'Clé USB Exemple')).toBe(false);
  });

  it('no regular expression: « .* » is plain text', () => {
    expect(ruleMatches(rule('.*', 'Tout'), 'Clé USB Exemple')).toBe(false);
    expect(ruleMatches(rule('.*', 'Tout'), 'Câble .* Exemple')).toBe(true);
  });
});

describe('proposeTags (Q-U1 f)', () => {
  it('merchant first, then rules in their order', () => {
    const s = settings({ rules: [rule('ssd', 'Informatique'), rule('disque', 'Stockage')] });
    expect(
      proposeTags({
        merchantTagName: 'Amazon',
        productName: 'Disque SSD Exemple 1 To',
        settings: s,
      }),
    ).toEqual([
      { name: 'Amazon', origin: 'merchant' },
      { name: 'Informatique', origin: 'rule' },
      { name: 'Stockage', origin: 'rule' },
    ]);
  });

  it('deduplicated by key: merchant « Amazon » and rule tag « amazon » give one entry', () => {
    const s = settings({ rules: [rule('ssd', 'amazon')] });
    expect(
      proposeTags({
        merchantTagName: 'Amazon',
        productName: 'Disque SSD Exemple 1 To',
        settings: s,
      }),
    ).toEqual([{ name: 'Amazon', origin: 'merchant' }]);
  });

  it('merchantTag: false → no merchant tag', () => {
    const s = settings({ merchantTag: false, rules: [rule('ssd', 'Informatique')] });
    expect(
      proposeTags({
        merchantTagName: 'Amazon',
        productName: 'Disque SSD Exemple 1 To',
        settings: s,
      }),
    ).toEqual([{ name: 'Informatique', origin: 'rule' }]);
  });

  it('merchantTagName: null (manual entry) → no merchant tag', () => {
    expect(
      proposeTags({ merchantTagName: null, productName: 'Clé USB Exemple', settings: settings() }),
    ).toEqual([]);
  });

  it.each([null, ''])('productName %j → no rule evaluated, merchant only', (productName) => {
    const s = settings({ rules: [rule('', 'Vide'), rule('a', 'Lettre')] });
    expect(proposeTags({ merchantTagName: 'Amazon', productName, settings: s })).toEqual([
      { name: 'Amazon', origin: 'merchant' },
    ]);
  });

  it('several matching rules → all tags, without duplicates (US2-5)', () => {
    const s = settings({
      rules: [
        rule('ssd', 'Informatique'),
        rule('disque', 'informatique'),
        rule('exemple', 'Bureau'),
      ],
    });
    expect(
      proposeTags({
        merchantTagName: 'Amazon',
        productName: 'Disque SSD Exemple 1 To',
        settings: s,
      }),
    ).toEqual([
      { name: 'Amazon', origin: 'merchant' },
      { name: 'Informatique', origin: 'rule' },
      { name: 'Bureau', origin: 'rule' },
    ]);
  });
});

describe('findExisting (Q-U1 g)', () => {
  const existing = [
    { id: 't1', name: 'Amazon' },
    { id: 't2', name: 'Bureau' },
  ];

  it('id still present → that tag', () => {
    expect(findExisting({ name: 'Amazon', id: 't1' }, existing)).toEqual({
      id: 't1',
      name: 'Amazon',
    });
  });

  it('id missing from the fresh list but same key under another id → that one (T-9)', () => {
    expect(findExisting({ name: 'Amazon', id: 't1' }, [{ id: 't9', name: 'amazon' }])).toEqual({
      id: 't9',
      name: 'amazon',
    });
  });

  it('two tags of the same key: the first one wins (T-10)', () => {
    const twins = [
      { id: 'a', name: 'Ecran' },
      { id: 'b', name: 'Écran' },
    ];
    expect(findExisting({ name: 'ÉCRAN' }, twins)).toEqual({ id: 'a', name: 'Ecran' });
  });

  it('no match → null', () => {
    expect(findExisting({ name: 'Cuisine' }, existing)).toBeNull();
    expect(findExisting({ name: 'Cuisine' }, [])).toBeNull();
  });
});

describe('unionIds (Q-U1 h)', () => {
  it('current tags first, without duplicates', () => {
    expect(unionIds(['old'], ['t1', 'old', 't1'])).toEqual(['old', 't1']);
  });

  it('keeps every current id', () => {
    expect(unionIds(['a', 'b'], [])).toEqual(['a', 'b']);
  });
});

describe('fold (moved from LocationPicker.vue, same behaviour, Q-U1 i)', () => {
  it.each([
    ['Étagère', 'etagere'],
    ['Œuvre', 'oeuvre'],
    ['æ', 'ae'],
    ['ĳ', 'ij'],
  ])('%s → %s', (input, expected) => {
    expect(fold(input)).toBe(expected);
  });
});

describe('constants (Q-U1 j)', () => {
  it('limits are fixed', () => {
    expect(MAX_TAG_BYTES).toBe(255);
    expect(MAX_RULE_TEXT).toBe(100);
    expect(MAX_TAGS_PER_PRODUCT).toBe(50);
  });

  it('default settings', () => {
    expect(DEFAULT_TAG_SETTINGS).toEqual({ v: 1, merchantTag: true, rules: [] });
  });
});

describe('proposeTags: at most MAX_TAGS_PER_PRODUCT (review 014, point 2)', () => {
  it('order kept: merchant first, then the rules in order, cut at 50', () => {
    const rules = Array.from({ length: 60 }, (_, i) => rule('ssd', `Tag ${i}`, `r${i}`));
    const out = proposeTags({ merchantTagName: 'Amazon', productName: 'Disque SSD', settings: settings({ rules }) });
    expect(out).toHaveLength(50);
    expect(out[0]).toEqual({ name: 'Amazon', origin: 'merchant' });
    expect(out[49]).toEqual({ name: 'Tag 48', origin: 'rule' });
  });
});

describe('fold source: escaped combining range (review 014, point 4)', () => {
  it('the source uses the \\u0300-\\u036f escape, no literal combining character', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(__dirname, '../../src/shared/fold.ts'), 'utf8');
    expect(src).toContain('[\\u0300-\\u036f]');
    expect(src).not.toMatch(/[̀-ͯ]/);
  });
});
