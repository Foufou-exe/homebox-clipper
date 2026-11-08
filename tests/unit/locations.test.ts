import type { TreeItem } from '@/background/homebox/types';
import { flattenTree } from '@/shared/locations';

const node = (id: string, name: string, children?: TreeItem[], type = 'location'): TreeItem => ({
  id,
  name,
  type,
  ...(children ? { children } : {}),
});

describe('flattenTree (FR-011, R1)', () => {
  it('arbre vide → liste vide', () => {
    expect(flattenTree([])).toEqual([]);
  });

  it('multi-level paths: string id, name = last segment, path from the root location to the location itself', () => {
    const tree = [node('m', 'Maison', [node('g', 'Garage', [node('e', 'Étagère', [])])])];
    expect(flattenTree(tree)).toEqual([
      { id: 'm', name: 'Maison', path: ['Maison'] },
      { id: 'g', name: 'Garage', path: ['Maison', 'Garage'] },
      { id: 'e', name: 'Étagère', path: ['Maison', 'Garage', 'Étagère'] },
    ]);
  });

  it('homonyms in different places: two entries, identified by their id', () => {
    const tree = [
      node('m', 'Maison', [node('g1', 'Garage', [node('e1', 'Étagère')])]),
      node('a', 'Atelier', [node('e2', 'Étagère')]),
      node('g0', 'Garage'),
    ];
    const result = flattenTree(tree);
    expect(result.filter((l) => l.name === 'Étagère').map((l) => l.id).sort()).toEqual(['e1', 'e2']);
    expect(result.filter((l) => l.name === 'Garage').map((l) => l.path.join('/')).sort()).toEqual([
      'Garage',
      'Maison/Garage',
    ]);
  });

  it('tolerates a missing children (leaf) like an empty children', () => {
    const result = flattenTree([node('a', 'A'), node('b', 'B', [])]);
    expect(result.map((l) => l.id)).toEqual(['a', 'b']);
  });

  it('discards an item-type node and all its descendants', () => {
    const tree = [
      node('m', 'Maison', [
        node('i', 'Clavier', [node('l-sous-objet', 'Faux lieu sous un objet')], 'item'),
        node('g', 'Garage'),
      ]),
    ];
    expect(flattenTree(tree).map((l) => l.id)).toEqual(['m', 'g']);
  });

  it('sorts by path, accent-insensitive ("Étagère" before "Zoo"), parent before children', () => {
    const tree = [
      node('z', 'Zoo'),
      node('m', 'Maison', [node('g', 'Garage'), node('c', 'Cave')]),
      node('e', 'Étagère'),
      node('a', 'Atelier', [node('b', 'Bac')]),
    ];
    expect(flattenTree(tree).map((l) => l.path.join('/'))).toEqual([
      'Atelier',
      'Atelier/Bac',
      'Étagère',
      'Maison',
      'Maison/Cave',
      'Maison/Garage',
      'Zoo',
    ]);
  });

  it('stops at a depth of 32 without throwing (abnormal response)', () => {
    let deepest: TreeItem = node('n40', 'N40');
    for (let i = 39; i >= 1; i--) deepest = node(`n${i}`, `N${i}`, [deepest]);
    const result = flattenTree([deepest]);
    expect(result).toHaveLength(32);
    expect(Math.max(...result.map((l) => l.path.length))).toBe(32);
  });

  it('a cycle in the response is bounded by the depth', () => {
    const a = node('a', 'A', []);
    a.children = [a];
    expect(() => flattenTree([a])).not.toThrow();
    expect(flattenTree([a])).toHaveLength(32);
  });
});
