import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Documentation of the entity type choice (spec 023, issue #102). Fixed values only, never a git reference. */
const read = (path: string) => readFileSync(resolve(__dirname, '../..', path), 'utf8');
const prose = (path: string) => read(path).replace(/\s+/g, ' ');

describe('PRIVACY.md and PRIVACY.fr.md', () => {
  it('EN: types read from your instance, identifier of the chosen type sent only to it, last type kept locally and erased with the instance', () => {
    const en = prose('PRIVACY.md');
    expect(en).toContain('lastEntityTypeByInstance');
    expect(en).toMatch(/GET \/api\/v1\/entity-types/);
    expect(en).toMatch(/item type[^|]*chosen in the summary/i);
    expect(en).toMatch(/identifier of the last item type used[^|]*erased with the instance/i);
    expect(en).toMatch(/never created, changed or deleted/i);
  });

  it('FR: same statements', () => {
    const fr = prose('PRIVACY.fr.md');
    expect(fr).toContain('lastEntityTypeByInstance');
    expect(fr).toMatch(/GET \/api\/v1\/entity-types/);
    expect(fr).toMatch(/type d'objet[^|]*choisi dans le récapitulatif/i);
    expect(fr).toMatch(/identifiant du dernier type d'objet utilisé[^|]*effacé avec l'instance/i);
    expect(fr).toMatch(/jamais créé, modifié ni supprimé/i);
  });
});

describe('wiki and store listing', () => {
  it('Usage: an « Item type » section with the default, the single-type case and the older versions', () => {
    const usage = prose('docs/site/src/content/docs/usage.md'); // ADAPTED (028): path moved to the documentation site
    expect(usage).toMatch(/## Item type/);
    expect(usage).toMatch(/at least two item types/i);
    expect(usage).toMatch(/server default/i);
    expect(usage).toMatch(/last type you used/i);
    expect(usage).toMatch(/no type is sent/i);
  });

  it('Architecture: entity-type/list, the body of the creation and the memory', () => {
    const arch = prose('docs/site/src/content/docs/contributing/architecture.md'); // ADAPTED (028): path moved to the documentation site
    expect(arch).toContain('entity-type/list');
    expect(arch).toContain('ENTITY_TYPE_NOT_FOUND');
    expect(arch).toContain('lastEntityTypeByInstance');
  });

  it('Security and privacy: the table lists the memory (identifier only) and its erasure', () => {
    const sec = prose('docs/site/src/content/docs/security-and-privacy.md'); // ADAPTED (028): path moved to the documentation site
    expect(sec).toMatch(/Last item type used, per instance \(`lastEntityTypeByInstance`\)/);
  });

  it('Store listing: the storage statement mentions the last item type of each instance (EN and FR)', () => {
    const listing = prose('docs/store/listing.md');
    expect(listing).toMatch(/last item type used for each instance/i);
    expect(listing).toMatch(/dernier type d'objet utilisé pour chaque instance/i);
  });
});
