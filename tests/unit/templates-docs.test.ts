import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Documentation of the HomeBox item templates (spec 018, FR-034, Q-U6). Fixed values only, never a git reference. */
const read = (path: string) => readFileSync(resolve(__dirname, '../..', path), 'utf8');
const prose = (path: string) => read(path).replace(/\s+/g, ' ');

describe('PRIVACY.md and PRIVACY.fr.md', () => {
  it('EN: default template per instance (id and name), erased with the instance or the settings; read on the instance only; no log', () => {
    const en = prose('PRIVACY.md');
    expect(en).toContain('defaultTemplateByInstance');
    expect(en).toMatch(
      /default item template of each instance \(identifier and name of the template/i,
    );
    expect(en).toMatch(/erased with the instance or the settings/i);
    expect(en).toMatch(/templates[^.]*read[^.]*only from the HomeBox instance/i);
    expect(en).toMatch(/nothing of a template is kept after the import except this default/i);
    expect(en).toMatch(/no template name[^.]*field value[^.]*logs/i);
  });

  it('FR: same statements', () => {
    const fr = prose('PRIVACY.fr.md');
    expect(fr).toContain('defaultTemplateByInstance');
    expect(fr).toMatch(
      /modèle d'objet par défaut de chaque instance \(identifiant et nom du modèle/i,
    );
    expect(fr).toMatch(/effacé avec l'instance ou les réglages/i);
    expect(fr).toMatch(/modèles[^.]*lus[^.]*uniquement sur l'instance HomeBox/i);
    expect(fr).toMatch(
      /rien d'un modèle n'est conservé après l'import, hors ce modèle par défaut/i,
    );
    expect(fr).toMatch(/aucun nom de modèle[^.]*valeur de champ[^.]*journaux/i);
  });
});

describe('docs/wiki/Architecture.md', () => {
  const doc = prose('docs/site/src/content/docs/contributing/architecture.md'); // ADAPTED (028): path moved to the documentation site
  it('storage.local table, messages, create-item, read-back, unchanged call sequence, error codes', () => {
    const storageRow = doc.slice(doc.indexOf('| `storage.local` |'));
    expect(storageRow.slice(0, 3000)).toContain('defaultTemplateByInstance');
    for (const m of [
      'template/list',
      'template/get',
      'template/check',
      'template/get-default',
      'template/set-default',
    ])
      expect(doc).toContain(`\`${m}\``);
    expect(doc).toContain('POST /api/v1/templates/{id}/create-item');
    expect(doc).toMatch(/reads the item again/i);
    expect(doc).toContain('orchestrator-call-sequence');
    for (const code of [
      'TEMPLATES_UNAVAILABLE',
      'TEMPLATES_UNSUPPORTED',
      'TEMPLATE_NOT_FOUND',
      'TEMPLATE_CHANGED',
      'TEMPLATE_FIELDS_FAILED',
    ]) {
      expect(doc).toContain(code);
    }
  });
});

describe('docs/wiki/Security-and-privacy.md', () => {
  it('a row defaultTemplateByInstance (identifier and name, erased with the instance)', () => {
    const row = read('docs/site/src/content/docs/security-and-privacy.md') // ADAPTED (028): path moved to the documentation site
      .split('\n')
      .find((l) => l.startsWith('|') && l.includes('defaultTemplateByInstance'));
    expect(row).toBeDefined();
    expect(row).toMatch(/identifier and name/i);
    expect(row).toMatch(/erased with the instance/i);
  });
});

describe('docs/wiki/Usage.md', () => {
  const doc = prose('docs/site/src/content/docs/usage.md'); // ADAPTED (028): path moved to the documentation site
  it('template per product, None by default, location required, editable fields, values saved as text, confirmation', () => {
    expect(doc).toMatch(/template/i);
    expect(doc).toContain('None');
    expect(doc).toMatch(/location is required/i);
    expect(doc).toMatch(/custom fields[^.]*edit/i);
    expect(doc).toMatch(/saved as text/i);
    expect(doc).toContain('YYYY-MM-DD');
    expect(doc).toMatch(/description of the product (wins|comes first)/i);
    expect(doc).toMatch(/changed or deleted/i);
    expect(doc).toMatch(/nothing is created before you confirm/i);
  });
});

describe('docs/wiki/Configuration.md', () => {
  it('default template per instance; the extension must be unlocked to change it', () => {
    const doc = prose('docs/site/src/content/docs/configuration.md'); // ADAPTED (028): path moved to the documentation site
    expect(doc).toMatch(/default template/i);
    expect(doc).toMatch(/unlocked/i);
  });
});

describe('no real address nor key-like value in the template documentation', () => {
  it.each([
    'PRIVACY.md',
    'PRIVACY.fr.md',
    'docs/site/src/content/docs/contributing/architecture.md', // ADAPTED (028): path moved to the documentation site
    'docs/site/src/content/docs/security-and-privacy.md', // ADAPTED (028): path moved to the documentation site
    'docs/site/src/content/docs/usage.md', // ADAPTED (028): path moved to the documentation site
    'docs/site/src/content/docs/configuration.md', // ADAPTED (028): path moved to the documentation site
  ])('%s', (path) => {
    const doc = read(path);
    expect(doc).not.toMatch(/hb_[A-Za-z0-9]{12,}/);
    const hosts = [...doc.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1]!.toLowerCase());
    for (const h of hosts.filter(
      (x) => x.includes('homebox') && x.includes('.') && !x.includes('github'),
    ))
      expect(h).toMatch(/example\.(com|org|net)$|^homebox\.software$|sysadminsmedia/);
  });
});
