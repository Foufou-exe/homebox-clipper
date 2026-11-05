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

  it('chemins multi-niveaux : id string, name = dernier segment, path du lieu racine au lieu lui-même', () => {
    const tree = [node('m', 'Maison', [node('g', 'Garage', [node('e', 'Étagère', [])])])];
    expect(flattenTree(tree)).toEqual([
      { id: 'm', name: 'Maison', path: ['Maison'] },
      { id: 'g', name: 'Garage', path: ['Maison', 'Garage'] },
      { id: 'e', name: 'Étagère', path: ['Maison', 'Garage', 'Étagère'] },
    ]);
  });

  it('homonymes à des endroits différents : deux entrées, identifiées par leur id', () => {
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

  it('tolère children absent (feuille) comme children vide', () => {
    const result = flattenTree([node('a', 'A'), node('b', 'B', [])]);
    expect(result.map((l) => l.id)).toEqual(['a', 'b']);
  });

  it('écarte un nœud de type item et toute sa descendance', () => {
    const tree = [
      node('m', 'Maison', [
        node('i', 'Clavier', [node('l-sous-objet', 'Faux lieu sous un objet')], 'item'),
        node('g', 'Garage'),
      ]),
    ];
    expect(flattenTree(tree).map((l) => l.id)).toEqual(['m', 'g']);
  });

  it('trie par chemin, insensible aux accents (« Étagère » avant « Zoo »), parent avant enfants', () => {
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

  it('s’arrête à une profondeur de 32 sans lever d’exception (réponse anormale)', () => {
    let deepest: TreeItem = node('n40', 'N40');
    for (let i = 39; i >= 1; i--) deepest = node(`n${i}`, `N${i}`, [deepest]);
    const result = flattenTree([deepest]);
    expect(result).toHaveLength(32);
    expect(Math.max(...result.map((l) => l.path.length))).toBe(32);
  });

  it('un cycle dans la réponse est borné par la profondeur', () => {
    const a = node('a', 'A', []);
    a.children = [a];
    expect(() => flattenTree([a])).not.toThrow();
    expect(flattenTree([a])).toHaveLength(32);
  });
});
