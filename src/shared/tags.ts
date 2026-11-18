/**
 * HomeBox tags proposed for each product (spec 014, data-model.md). Pure functions only: no storage, network
 * or clock access, nothing logged. Tag names and rule texts are user data: never written to a log.
 */
import { fold } from './fold';
import type { TagChoice, TagOption } from './types';

/** HomeBox limit: MaxLen(255) on the tag name, counted in UTF-8 bytes (research R4). */
export const MAX_TAG_BYTES = 255;
/** Characters of the text of a rule. */
export const MAX_RULE_TEXT = 100;
/** Tags sent for one product. */
export const MAX_TAGS_PER_PRODUCT = 50;

export interface TagRule {
  /** `crypto.randomUUID()` at creation; never sent nor displayed. */
  id: string;
  /** Text looked for in the product name: normalised, 1 to 100 characters. */
  contains: string;
  /** Name of the proposed tag: normalised, 1 to 255 UTF-8 bytes. */
  tag: string;
}

export interface TagSettings {
  v: 1;
  /** Proposes the store name as a tag (FR-009). */
  merchantTag: boolean;
  /** Input order; no priority (every matching rule applies). */
  rules: TagRule[];
}

/** Defaults: the store name is proposed, no rule. Consumers copy it before changing it. */
export const DEFAULT_TAG_SETTINGS: TagSettings = { v: 1, merchantTag: true, rules: [] };

/** Display state of a tag of a product, in the memory of the summary only. */
export interface TagLine {
  /** `tagKey(name)`, unique in the list of the product. */
  key: string;
  /** Displayed name (the HomeBox spelling when the tag exists). */
  name: string;
  id: string | null;
  origin: 'merchant' | 'rule' | 'user';
  /** True when proposed and when added. */
  checked: boolean;
}

/** Computed, never stored. */
export type TagStatus = 'existing' | 'new' | 'unverified';

/** NFC, any run of whitespace becomes one space, trimmed. */
export function normalizeTagName(s: string): string {
  return s.normalize('NFC').replace(/\s+/g, ' ').trim();
}

/** Comparison key: case, accents and spacing ignored. */
export function tagKey(s: string): string {
  return fold(normalizeTagName(s));
}

const utf8Bytes = (s: string) => new TextEncoder().encode(s).length;

export function tagNameError(s: string): 'empty' | 'tooLong' | null {
  const name = normalizeTagName(s);
  if (name === '') return 'empty';
  return utf8Bytes(name) > MAX_TAG_BYTES ? 'tooLong' : null;
}

export function ruleTextError(s: string): 'empty' | 'tooLong' | null {
  const text = normalizeTagName(s);
  if (text === '') return 'empty';
  return text.length > MAX_RULE_TEXT ? 'tooLong' : null;
}

/** Plain-text containment, case and accents ignored: never a regular expression. */
export function ruleMatches(rule: TagRule, productName: string): boolean {
  const needle = tagKey(rule.contains);
  return needle !== '' && tagKey(productName).includes(needle);
}

/**
 * Tags proposed for a product: merchant (if enabled and known), then the rules in order; deduplicated by key and
 * cut at `MAX_TAGS_PER_PRODUCT` (the import message refuses more).
 */
export function proposeTags(input: {
  merchantTagName: string | null;
  productName: string | null;
  settings: TagSettings;
}): { name: string; origin: 'merchant' | 'rule' }[] {
  const out: { name: string; origin: 'merchant' | 'rule' }[] = [];
  const seen = new Set<string>();
  const add = (raw: string, origin: 'merchant' | 'rule') => {
    const name = normalizeTagName(raw);
    if (tagNameError(name) !== null) return;
    const key = tagKey(name);
    if (seen.has(key) || out.length >= MAX_TAGS_PER_PRODUCT) return;
    seen.add(key);
    out.push({ name, origin });
  };
  if (input.settings.merchantTag && input.merchantTagName) add(input.merchantTagName, 'merchant');
  const productName = input.productName;
  if (productName) {
    for (const rule of input.settings.rules) if (ruleMatches(rule, productName)) add(rule.tag, 'rule');
  }
  return out;
}

/** Matches a chosen tag with the existing ones: id still present, otherwise the first of the same key, otherwise null. */
export function findExisting(choice: TagChoice, existing: readonly TagOption[]): TagOption | null {
  if (choice.id !== undefined) {
    const byId = existing.find((t) => t.id === choice.id);
    if (byId) return byId;
  }
  const key = tagKey(choice.name);
  return existing.find((t) => tagKey(t.name) === key) ?? null;
}

/** Union without duplicates, order kept (current tags of the object first). */
export function unionIds(current: readonly string[], added: readonly string[]): string[] {
  return [...new Set([...current, ...added])];
}
