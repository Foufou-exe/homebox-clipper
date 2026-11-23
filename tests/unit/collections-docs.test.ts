import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Documentation of the target collection (spec 024, FR-018). Fixed values only, never a git reference. */
const prose = (path: string) =>
  readFileSync(resolve(__dirname, '../..', path), 'utf8').replace(/\s+/g, ' ');

describe('target collection documentation (024)', () => {
  it('PRIVACY.md: stored key, reads, header to that instance only, no log', () => {
    const en = prose('PRIVACY.md');
    expect(en).toContain('collectionByInstance');
    expect(en).toContain('GET /api/v1/groups/all');
    expect(en).toMatch(/sent only to that instance, in the `X-Tenant` header/);
    expect(en).toMatch(/No collection name or identifier is written to the logs/);
  });

  it('PRIVACY.fr.md: same statements', () => {
    const fr = prose('PRIVACY.fr.md');
    expect(fr).toContain('collectionByInstance');
    expect(fr).toContain('GET /api/v1/groups/all');
    expect(fr).toMatch(/envoyé uniquement à cette instance, dans l'en-tête `X-Tenant`/);
    expect(fr).toMatch(/Aucun nom ni identifiant de collection n'est écrit dans les journaux/);
  });

  it('wiki: settings, architecture, storage table and troubleshooting', () => {
    expect(prose('docs/site/src/content/docs/configuration.md')).toMatch(/## Target collection/); // ADAPTED (028): path moved to the documentation site
    const arch = prose('docs/site/src/content/docs/contributing/architecture.md'); // ADAPTED (028): path moved to the documentation site
    for (const s of [
      'instance/collections',
      'instance/set-collection',
      'X-Tenant',
      'COLLECTION_UNAVAILABLE',
      'COLLECTIONS_UNAVAILABLE',
    ])
      expect(arch).toContain(s);
    const row = readFileSync(resolve(__dirname, '../../docs/site/src/content/docs/security-and-privacy.md'), 'utf8') // ADAPTED (028): path moved to the documentation site
      .split('\n')
      .find((l) => l.startsWith('|') && l.includes('collectionByInstance'));
    expect(row).toMatch(/erased with the instance/i);
    expect(prose('docs/site/src/content/docs/troubleshooting-and-faq.md')).toContain('COLLECTION_UNAVAILABLE'); // ADAPTED (028): path moved to the documentation site
  });
});
