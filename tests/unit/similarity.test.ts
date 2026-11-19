import {
  MAX_QUERY_WORDS,
  MAX_SIMILAR_SHOWN,
  MIN_COMMON_WORDS,
  MIN_WORD_LENGTH,
  SIMILARITY_THRESHOLD,
  SIMILAR_PAGE_SIZE,
  STOP_WORDS,
  compareNames,
  normalizeName,
  queryWords,
  rankSimilar,
  significantWords,
} from '@/shared/similarity';

describe('normalizeName (015, FR-004 step 1)', () => {
  it.each([
    ['', ''],
    ['  ', ''],
    ['Câble USB-C 2 m noir', 'cable usb c 2 m noir'],
    ['Œuf  à  la  coque!', 'oeuf a la coque'],
    ['27"', '27'],
  ])('%j → %j', (input, expected) => {
    expect(normalizeName(input)).toBe(expected);
  });
});

describe('significantWords (015, FR-004 step 2)', () => {
  it.each([
    ['Lampe de bureau', ['lampe', 'bureau']],
    ['Noir noir NOIR', ['noir']],
    ['De la', []],
    ["L'écran", ['ecran']],
    ['Câble USB-C 2 m noir', ['cable', 'usb', 'noir']],
  ])('%j → %j', (input, expected) => {
    expect(significantWords(input)).toEqual(expected);
  });

  it('keeps "to" (a unit, not a stop word)', () => {
    expect(significantWords('Disque SSD Exemple 1 To')).toContain('to');
  });

  it('drops 1-character words', () => {
    expect(significantWords('a b c Lampe')).toEqual(['lampe']);
  });
});

describe('compareNames: reference set (015, SC-001), both directions', () => {
  const close: [string, string, number][] = [
    ['Câble USB-C 2 m noir', 'Cable usb c noir 2m', 1],
    ['Logitech M185 Souris sans fil, Gris', 'Souris sans fil Logitech M185', 1],
    ['Perceuse visseuse Bosch 18V', 'Perceuse visseuse Bosch 18V', 1],
    ['Perceuse Bosch', 'Perceuse visseuse Bosch 18V', 1],
    ['Lampe de bureau LED', 'Lampe LED', 1],
    ['Clavier sans fil Exemple Pro', 'Clavier sans fil Exemple Mini', 0.8],
    ['Disque SSD Exemple 1 To', 'Disque SSD Exemple 2 To', 1],
    ['ÉTAGÈRE murale chêne', 'etagere murale chene', 1],
    ['Câble', 'Câble', 1],
    ['Câble', 'câble !', 1],
  ];
  const notClose: [string, string, number][] = [
    ['Clavier sans fil Exemple', 'Clavier filaire Exemple', 2 / 3],
    ['Câble USB', 'Hub USB', 0.5],
    ['Câble USB-C 2 m noir', 'Lampe de bureau', 0],
    ['Câble', 'Câble HDMI', 0],
    ['Câbles', 'Câble', 0],
    ['De la', 'Le', 0],
  ];

  it.each(close)('close: %j / %j', (a, b, score) => {
    expect(compareNames(a, b)).toEqual({ close: true, score });
    expect(compareNames(b, a)).toEqual({ close: true, score });
  });

  it.each(notClose)('not close: %j / %j', (a, b, score) => {
    expect(compareNames(a, b)).toEqual({ close: false, score });
    expect(compareNames(b, a)).toEqual({ close: false, score });
  });

  it('no significant word on one side → { close: false, score: 0 }', () => {
    expect(compareNames('De la', 'Le')).toEqual({ close: false, score: 0 });
    expect(compareNames('', 'Lampe LED')).toEqual({ close: false, score: 0 });
  });
});

describe('compareNames: thresholds (015, FR-004 step 4)', () => {
  const words = (n: number, prefix = 'w') => Array.from({ length: n }, (_, i) => `${prefix}${i}x`);
  const pair = (size: number, common: number) => {
    const a = words(size);
    const b = [...a.slice(0, common), ...words(size - common, 'z')];
    return [a.join(' '), b.join(' ')] as const;
  };

  it.each([
    [3, 2, false],
    [4, 3, false],
    [5, 4, true],
    [10, 8, true],
    [10, 7, false],
  ])('%i words, %i in common → close = %s', (size, common, expected) => {
    const [a, b] = pair(size, common);
    expect(compareNames(a, b).close).toBe(expected);
    expect(compareNames(b, a).close).toBe(expected);
    expect(compareNames(a, b).score).toBe(common / size);
  });
});

describe('queryWords (015, research R1, data-model sort)', () => {
  it.each([
    ['Logitech M185 Souris sans fil, Gris', ['m185', 'logitech', 'souris']],
    ['Câble USB-C 2 m noir', ['noir', 'usb', 'cable']],
    ['Perceuse visseuse Bosch 18V', ['18v', 'perceuse', 'visseuse']],
    ['TV LG 55 pouces OLED', ['pouces', 'oled', '55']],
    ['Câble', ['cable']],
    ['De la', []],
  ])('%j → %j', (name, expected) => {
    expect(queryWords(name)).toEqual(expected);
  });

  it('never returns a space, ", #, % or _', () => {
    for (const name of [
      'Écran 27" #1 100% top_model',
      'a_b c%d e#f "g h"',
      'Œuvre d’art — 50 % «promo»',
    ]) {
      const words = queryWords(name);
      expect(words.length).toBeLessThanOrEqual(MAX_QUERY_WORDS);
      for (const w of words) expect(w).not.toMatch(/[\s"#%_]/);
    }
  });
});

describe('rankSimilar (015, FR-009, FR-010)', () => {
  const none = new Set<string>();

  it('empty candidates → { items: [], more: false }', () => {
    expect(rankSimilar('Câble USB-C 2 m noir', [], none)).toEqual({ items: [], more: false });
  });

  it('contract example: sorted by score, then normalized name (code units), then id', () => {
    const r = rankSimilar(
      'Câble USB-C 2 m noir',
      [
        { id: 'b', name: 'Cable usb c noir 2m' },
        { id: 'a', name: 'Câble USB noir tressé' },
        { id: 'c', name: 'Câble USB-C noir' },
        { id: 'd', name: 'Câble HDMI noir' },
      ],
      none,
    );
    expect(r.items.map((e) => e.id)).toEqual(['c', 'b', 'a']);
    expect(r.more).toBe(false);
  });

  it('higher score first', () => {
    const r = rankSimilar(
      'Clavier sans fil Exemple Pro',
      [
        { id: 'x', name: 'Clavier sans fil Exemple Mini' },
        { id: 'y', name: 'Clavier sans fil Exemple Pro' },
      ],
      none,
    );
    expect(r.items.map((e) => e.id)).toEqual(['y', 'x']);
  });

  it('same normalized name → sorted by id', () => {
    const r = rankSimilar(
      'Lampe LED',
      [
        { id: 'z', name: 'Lampe LED' },
        { id: 'k', name: 'lampe led' },
      ],
      none,
    );
    expect(r.items.map((e) => e.id)).toEqual(['k', 'z']);
  });

  it('repeated id → the first one is kept', () => {
    const r = rankSimilar(
      'Lampe LED',
      [
        { id: 'a', name: 'Lampe LED' },
        { id: 'a', name: 'Lampe LED bis' },
      ],
      none,
    );
    expect(r.items).toEqual([{ id: 'a', name: 'Lampe LED' }]);
  });

  it('an id of exclude is ignored (certain duplicates, FR-009)', () => {
    const r = rankSimilar(
      'Lampe LED',
      [
        { id: 'a', name: 'Lampe LED' },
        { id: 'b', name: 'Lampe LED' },
      ],
      new Set(['a']),
    );
    expect(r.items.map((e) => e.id)).toEqual(['b']);
  });

  it('6 close → 5 and more: true; 5 close → more: false', () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ id: `i${i}`, name: `Lampe LED ${i + 1}` }));
    const r6 = rankSimilar('Lampe LED', six, none);
    expect(r6.items).toHaveLength(MAX_SIMILAR_SHOWN);
    expect(r6.items.map((e) => e.id)).toEqual(['i0', 'i1', 'i2', 'i3', 'i4']);
    expect(r6.more).toBe(true);
    const r5 = rankSimilar('Lampe LED', six.slice(0, 5), none);
    expect(r5.items).toHaveLength(5);
    expect(r5.more).toBe(false);
  });

  it('excluded and duplicated ids do not count towards more', () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ id: `i${i}`, name: `Lampe LED ${i + 1}` }));
    expect(rankSimilar('Lampe LED', six, new Set(['i5'])).more).toBe(false);
    expect(rankSimilar('Lampe LED', [...six.slice(0, 5), six[0]!], none).more).toBe(false);
  });

  it('non-close candidates are dropped', () => {
    expect(
      rankSimilar('Câble USB-C 2 m noir', [{ id: 'l', name: 'Lampe de bureau' }], none),
    ).toEqual({
      items: [],
      more: false,
    });
  });

  it('product name without a significant word → { items: [], more: false }', () => {
    expect(rankSimilar('De la', [{ id: 'a', name: 'De la' }], none)).toEqual({
      items: [],
      more: false,
    });
  });
});

describe('similarity constants (015)', () => {
  it('exports the documented values', () => {
    expect(MIN_WORD_LENGTH).toBe(2);
    expect(SIMILARITY_THRESHOLD).toBe(0.8);
    expect(MIN_COMMON_WORDS).toBe(2);
    expect(MAX_SIMILAR_SHOWN).toBe(5);
    expect(MAX_QUERY_WORDS).toBe(3);
    expect(SIMILAR_PAGE_SIZE).toBe(50);
  });

  it('STOP_WORDS is the fixed list of 28 words, without "to" or "sans"', () => {
    expect([...STOP_WORDS].sort()).toEqual(
      [
        'de',
        'du',
        'des',
        'la',
        'le',
        'les',
        'un',
        'une',
        'et',
        'ou',
        'pour',
        'avec',
        'en',
        'au',
        'aux',
        'sur',
        'par',
        'dans',
        'the',
        'and',
        'for',
        'with',
        'of',
        'an',
        'or',
        'in',
        'on',
        'by',
      ].sort(),
    );
    expect(STOP_WORDS.size).toBe(28);
    expect(STOP_WORDS.has('to')).toBe(false);
    expect(STOP_WORDS.has('sans')).toBe(false);
  });
});
