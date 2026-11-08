import type { TreeItem } from '@/background/homebox/types';
import type { LocationOption } from './types';

/** Maximum depth followed: guards against a cycle or an abnormal response without throwing. */
export const MAX_DEPTH = 32;

const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });

function comparePaths(a: string[], b: string[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const c = collator.compare(a[i] ?? '', b[i] ?? '');
    if (c !== 0) return c;
  }
  return a.length - b.length;
}

/**
 * Flattens the location tree into a list sorted by path (R1). Discards nodes that are not
 * locations and their descendants, tolerates a missing `children`, and stops at `MAX_DEPTH`.
 * The name alone does not identify a location (homonyms): `id` is authoritative.
 */
export function flattenTree(tree: TreeItem[]): LocationOption[] {
  const out: LocationOption[] = [];
  const walk = (nodes: TreeItem[], parents: string[]) => {
    if (parents.length >= MAX_DEPTH) return;
    for (const node of nodes) {
      if (node.type !== 'location') continue;
      const path = [...parents, node.name];
      out.push({ id: String(node.id), name: node.name, path });
      if (Array.isArray(node.children)) walk(node.children, path);
    }
  };
  walk(tree, []);
  return out.sort((a, b) => comparePaths(a.path, b.path));
}
