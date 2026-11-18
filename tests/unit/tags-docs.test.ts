import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Documentation of the automatic tags (spec 014, FR-020). Fixed values only, never a git reference. */
const read = (path: string) => readFileSync(resolve(__dirname, '../..', path), 'utf8');
const prose = (path: string) => read(path).replace(/\s+/g, ' ');

describe('store listing (docs/store/listing.md)', () => {
  const doc = read('docs/store/listing.md');
  const en = doc.slice(doc.indexOf('EN:\n'), doc.indexOf('FR :\n'));
  const fr = doc.slice(doc.indexOf('FR :\n'), doc.indexOf('### Permission justifications'));

  it('EN and FR descriptions mention the suggested tags and the local rules', () => {
    expect(en).toMatch(/tags/i);
    expect(en).toMatch(/rules/i);
    expect(fr).toMatch(/tags/i);
    expect(fr).toMatch(/règles/i);
  });

  it('privacy and security: tags created only after confirmation, no new recipient (EN and FR)', () => {
    const enPrivacy = doc.slice(doc.indexOf('PRIVACY AND SECURITY'), doc.indexOf('SUPPORTED STORES'));
    const frPrivacy = doc.slice(doc.indexOf('CONFIDENTIALITÉ ET SÉCURITÉ'), doc.indexOf('MARCHANDS PRIS EN CHARGE'));
    expect(enPrivacy).toMatch(/tags[^\n]*after your confirmation/i);
    expect(enPrivacy).toMatch(/no new recipient/i);
    expect(frPrivacy).toMatch(/tags[^\n]*après votre confirmation/i);
    expect(frPrivacy).toMatch(/aucun nouveau destinataire/i);
  });

  it('the storage justification covers the tag rules (EN and FR)', () => {
    const storage = doc.slice(doc.indexOf('**storage**'), doc.indexOf('**activeTab**'));
    expect(storage).toMatch(/tag/i);
    expect(storage).toMatch(/règles de tags|tag rules/i);
  });

  it('the permission list stays exactly storage, activeTab, scripting and the optional host access (fixed values)', () => {
    const permissions = [...doc.matchAll(/^\*\*([a-zA-Z_]+)\*\*\s*$/gm)].map((m) => m[1]);
    expect(permissions).toEqual(['storage', 'activeTab', 'scripting']);
    expect(doc).toContain('The manifest declares `storage`, `activeTab`, `scripting` and the optional host permissions');
    expect(doc).toContain('`https://*/*` and `http://*/*`. There is no static `host_permissions`');
  });
});

describe('wiki', () => {
  it('Usage.md: suggested tags in the summary, « new » / « not verified », tags not added and Retry, the options card', () => {
    const doc = prose('docs/wiki/Usage.md');
    expect(doc).toMatch(/tags/i);
    expect(doc).toMatch(/new/);
    expect(doc).toMatch(/not verified/i);
    expect(doc).toMatch(/Tags not added/);
    expect(doc).toMatch(/Automatic tags/);
  });

  it('Configuration.md: rules (contains, no regular expression), store-name option, kept when settings are deleted', () => {
    const doc = prose('docs/wiki/Configuration.md');
    expect(doc).toMatch(/Automatic tags/);
    expect(doc).toMatch(/contains/i);
    expect(doc).toMatch(/regular expression/i);
    expect(doc).toMatch(/store name/i);
    expect(doc).toMatch(/kept/i);
  });

  it('Security-and-privacy.md: tagSettings in the storage table, tags never in the history, no tag name logged', () => {
    const doc = read('docs/wiki/Security-and-privacy.md');
    const table = doc.slice(doc.indexOf('Where data is stored'));
    expect(table).toContain('tagSettings');
    const text = doc.replace(/\s+/g, ' ');
    expect(text).toMatch(/tags?[^.]*never[^.]*history/i);
    expect(text).toMatch(/no tag name[^.]*log|tag names?[^.]*never[^.]*log/i);
  });
});
