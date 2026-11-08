import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
