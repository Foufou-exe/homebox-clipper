import { fold } from './fold';

/**
 * Close product names (spec 015, FR-004). Pure functions: no log, no network, no storage.
 * The rule is always applied here, on the item name: HomeBox only supplies candidates (research R1).
 */

/** Stop words ignored (FR-004, step 2), compared after fold. Fixed list, not configurable. */
export const STOP_WORDS: ReadonlySet<string> = new Set([
  // French
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
  // English
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
]);
export const MIN_WORD_LENGTH = 2; // FR-004, step 2
export const SIMILARITY_THRESHOLD = 0.8; // FR-004, step 4
export const MIN_COMMON_WORDS = 2; // FR-004, step 4
export const MAX_SIMILAR_SHOWN = 5; // FR-010
export const MAX_QUERY_WORDS = 3; // research R1
export const SIMILAR_PAGE_SIZE = 50; // research R1

const isSignificant = (w: string) => w.length >= MIN_WORD_LENGTH && !STOP_WORDS.has(w);

/** FR-004 step 1: fold (lowercase, ligatures, accents), anything that is neither a letter nor a digit → one space. */
export function normalizeName(s: string): string {
  return fold(s)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** FR-004 step 2: distinct words of normalizeName(s), length ≥ 2, not in STOP_WORDS, in order of appearance. */
export function significantWords(s: string): string[] {
  return [...new Set(normalizeName(s).split(' ').filter(isSignificant))];
}

/** FR-004 steps 3-4. `score` = common words ÷ size of the smaller set (0 if one is empty). Symmetric. */
export function compareNames(a: string, b: string): { close: boolean; score: number } {
  const wa = significantWords(a);
  const wb = new Set(significantWords(b));
  const m = Math.min(wa.length, wb.size);
  if (m === 0) return { close: false, score: 0 };
  if (m === 1) {
    const close = normalizeName(a) === normalizeName(b);
    return { close, score: close ? 1 : 0 };
  }
  const common = wa.filter((w) => wb.has(w)).length;
  const score = common / m;
  return { close: score >= SIMILARITY_THRESHOLD && common >= MIN_COMMON_WORDS, score };
}

/**
 * At most MAX_QUERY_WORDS significant words to send to HomeBox (research R1, data-model sort): length ≥ 3 first,
 * then with a digit, then unchanged by fold (no accent: robust on servers without accent folding), then longest,
 * then order of appearance. Normalized form: never a space, `"`, `#`, `%` or `_`. [] if no significant word.
 */
export function queryWords(name: string): string[] {
  const words: { word: string; accented: boolean; index: number }[] = [];
  const seen = new Set<string>();
  for (const raw of name.toLowerCase().split(/[^\p{L}\p{N}\p{M}]+/u)) {
    const accented = fold(raw) !== raw;
    for (const word of normalizeName(raw).split(' ')) {
      if (!isSignificant(word) || seen.has(word)) continue;
      seen.add(word);
      words.push({ word, accented, index: words.length });
    }
  }
  const rank = (w: (typeof words)[number]) => [
    w.word.length >= 3 ? 0 : 1,
    /\p{N}/u.test(w.word) ? 0 : 1,
    w.accented ? 1 : 0,
    -w.word.length,
    w.index,
  ];
  const byRank = (x: number[], y: number[]) => {
    for (let i = 0; i < x.length; i++) {
      const d = (x[i] ?? 0) - (y[i] ?? 0);
      if (d !== 0) return d;
    }
    return 0;
  };
  return words
    .map((w) => ({ w, key: rank(w) }))
    .sort((x, y) => byRank(x.key, y.key))
    .slice(0, MAX_QUERY_WORDS)
    .map(({ w }) => w.word);
}

/**
 * Similar items of a product among `{ id, name }` candidates: deduplicated by id (first kept), without the ids of
 * `exclude` (certain duplicates, FR-009), close ones only, sorted (score descending, then normalizeName ascending,
 * then id ascending, by code units, never localeCompare), truncated to MAX_SIMILAR_SHOWN (FR-010).
 */
export function rankSimilar<T extends { id: string; name: string }>(
  productName: string,
  candidates: readonly T[],
  exclude: ReadonlySet<string>,
): { items: T[]; more: boolean } {
  const seen = new Set<string>();
  const close: { item: T; score: number; key: string }[] = [];
  for (const item of candidates) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    if (exclude.has(item.id)) continue;
    const { close: isClose, score } = compareNames(productName, item.name);
    if (isClose) close.push({ item, score, key: normalizeName(item.name) });
  }
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  close.sort((a, b) => b.score - a.score || cmp(a.key, b.key) || cmp(a.item.id, b.item.id));
  return {
    items: close.slice(0, MAX_SIMILAR_SHOWN).map((c) => c.item),
    more: close.length > MAX_SIMILAR_SHOWN,
  };
}
