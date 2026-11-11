import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AMAZON_STORES } from '@/content/merchants/amazon/stores';
import { MERCHANTS } from '@/content/merchants/registry';

const md = readFileSync(resolve(__dirname, '../../MERCHANTS.md'), 'utf8');

/** Table rows of the "Supported" and "Partial" sections (status identifiers in English). */
function supportedRows(): string[] {
  const rows: string[] = [];
  let active = false;
  for (const line of md.split('\n')) {
    if (line.startsWith('## ')) active = /Supported|Partial/.test(line);
    else if (active && line.startsWith('|')) rows.push(line);
  }
  return rows;
}

describe('MERCHANTS.md: consistency with the registry', () => {
  it('the registry contains at least one extractor with domains', () => {
    expect(MERCHANTS.length).toBeGreaterThan(0);
    for (const m of MERCHANTS) expect(m.domains.length).toBeGreaterThan(0);
  });

  it.each(MERCHANTS.map((m) => [m.id, m.imageHosts] as const))(
    '%s: declares imageHosts (array of exact host names; empty = no photo)',
    (_id, hosts) => {
      expect(Array.isArray(hosts)).toBe(true);
      for (const host of hosts) expect(host).toMatch(/^[a-z0-9.-]+$/);
    },
  );

  it.each(MERCHANTS.map((m) => [m.id, m.domains] as const))(
    '%s: each domain appears in a Supported or Partial row',
    (_id, domains) => {
      const rows = supportedRows();
      for (const domain of domains) {
        expect(rows.some((row) => row.includes(`\`${domain}\``))).toBe(true);
      }
    },
  );

  it('empty sections show the "None yet" notice', () => {
    expect(md).toMatch(/_None yet\._/);
  });
});

/** Status of each store, identical in the table, MERCHANTS.md and MERCHANTS.fr.md (006, FR-015, Q-U15). */
describe('MERCHANTS.md and MERCHANTS.fr.md: status of the Amazon stores', () => {
  const docs = {
    'MERCHANTS.md': md,
    'MERCHANTS.fr.md': readFileSync(resolve(__dirname, '../../MERCHANTS.fr.md'), 'utf8'),
  };
  const STATUS = { supported: '✅ supported', testing: '🟡 testing' } as const;

  /** Table rows of a section, by section-title pattern. */
  const rowsOf = (text: string, section: RegExp) => {
    const rows: string[] = [];
    let active = false;
    for (const line of text.split('\n')) {
      if (line.startsWith('## ')) active = section.test(line);
      else if (active && line.startsWith('|')) rows.push(line);
    }
    return rows;
  };

  describe.each(Object.entries(docs))('%s', (_file, text) => {
    it('the legend defines 🟡 testing', () => {
      expect(rowsOf(text, /^## L[eé]gend/).some((row) => row.includes(STATUS.testing))).toBe(true);
    });

    it.each(AMAZON_STORES.map((s) => [s.id, s] as const))('%s: Supported row and country row carry the status of the table', (_id, s) => {
      const domain = `\`${new URL(s.origin).hostname}\``;
      const supported = rowsOf(text, /Supported/).filter((row) => row.includes(domain));
      expect(supported).toHaveLength(1);
      expect(supported[0]).toContain(STATUS[s.status]);
      const all = text.split('\n').filter((line) => line.startsWith('|') && line.includes(domain));
      // Supported row + country row, all with the same status.
      expect(all.length).toBeGreaterThanOrEqual(2);
      for (const row of all) expect(row).toContain(STATUS[s.status]);
    });
  });
});
