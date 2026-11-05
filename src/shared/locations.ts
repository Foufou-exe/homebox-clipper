import type { TreeItem } from '@/background/homebox/types';
import type { LocationOption } from './types';

/** Profondeur maximale suivie : protège d'un cycle ou d'une réponse anormale sans lever d'exception. */
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
 * Aplatit l'arbre des emplacements en liste triée par chemin (R1). Écarte les nœuds qui ne sont pas des
 * lieux et leur descendance, tolère `children` absent, et s'arrête à `MAX_DEPTH`.
 * Le nom seul n'identifie pas un lieu (homonymes) : `id` fait foi.
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
