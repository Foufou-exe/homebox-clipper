import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MERCHANTS } from '@/content/merchants/registry';

const md = readFileSync(resolve(__dirname, '../../MERCHANTS.md'), 'utf8');

/** Lignes de tableau des sections « Supported » et « Partial » (identifiants de statut en anglais). */
function supportedRows(): string[] {
  const rows: string[] = [];
  let active = false;
  for (const line of md.split('\n')) {
    if (line.startsWith('## ')) active = /Supported|Partial/.test(line);
    else if (active && line.startsWith('|')) rows.push(line);
  }
  return rows;
}

describe('MERCHANTS.md : cohérence avec le registre', () => {
  it('le registre contient au moins un extracteur avec des domaines', () => {
    expect(MERCHANTS.length).toBeGreaterThan(0);
    for (const m of MERCHANTS) expect(m.domains.length).toBeGreaterThan(0);
  });

  it.each(MERCHANTS.map((m) => [m.id, m.domains] as const))(
    '%s : chaque domaine figure dans une ligne Supported ou Partial',
    (_id, domains) => {
      const rows = supportedRows();
      for (const domain of domains) {
        expect(rows.some((row) => row.includes(`\`${domain}\``))).toBe(true);
      }
    },
  );

  it('les sections vides affichent la mention « Aucun pour l\'instant »', () => {
    expect(md).toMatch(/_Aucun pour l'instant\._/);
  });
});
