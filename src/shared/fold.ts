/** Lowercase and accent-free: "etagere" finds "Étagère". Moved from LocationPicker.vue (spec 014), unchanged. */
const LIGATURES: Record<string, string> = { 'œ': 'oe', 'æ': 'ae', 'ĳ': 'ij' };

export function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/[œæĳ]/g, (c) => LIGATURES[c] ?? c)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
