import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Documentation of the completion of an existing item (spec 021, FR-028). Fixed values only, never a git reference. */
const prose = (path: string) =>
  readFileSync(resolve(__dirname, '../..', path), 'utf8').replace(/\s+/g, ' ');

describe('completion docs (021)', () => {
  const usage = prose('docs/site/src/content/docs/usage.md'); // ADAPTED (028): path moved to the documentation site
  const duplicates = usage.slice(usage.indexOf('## Duplicates'), usage.indexOf('## No invoice'));

  it('Usage.md, Duplicates section: "Complete the existing item", never overwritten, confirmation, quantity unchecked', () => {
    expect(duplicates).toContain('Complete the existing item');
    expect(duplicates).toMatch(/never overwrit/);
    expect(duplicates).toMatch(/Review the changes/);
    expect(duplicates).toMatch(/Confirm/);
    expect(duplicates).toMatch(/unchecked by default/);
    expect(duplicates).toMatch(/primary photo only when the item has none/);
    expect(duplicates).toMatch(/name, the description and the location of the item never change/);
  });

  it('the sentences frozen by duplicates-docs.test.ts are still there', () => {
    expect(duplicates).toMatch(/Create anyway/);
    expect(duplicates).toMatch(/Cancel/);
    expect(duplicates).toMatch(/not a guarantee/);
    expect(duplicates).toMatch(/The duplicate check could not be performed\./);
    expect(duplicates).toMatch(/without an order number/i);
  });

  it('Architecture.md cites import/complete-preview, preservingUpdate and the pure module', () => {
    const doc = prose('docs/site/src/content/docs/contributing/architecture.md'); // ADAPTED (028): path moved to the documentation site
    expect(doc).toContain('import/complete-preview');
    expect(doc).toContain('preservingUpdate');
    expect(doc).toContain('src/background/import/completion.ts');
    expect(doc).toMatch(/single PUT/);
  });

  it('Troubleshooting-and-FAQ.md has the ITEM_NOT_FOUND row with the exact English message', () => {
    const doc = prose('docs/site/src/content/docs/troubleshooting-and-faq.md'); // ADAPTED (028): path moved to the documentation site
    expect(doc).toContain(
      '| The chosen HomeBox item no longer exists. Nothing was changed. | `ITEM_NOT_FOUND` |',
    );
  });

  it('Security-and-privacy.md: update of an existing item only after confirmation, nothing of it logged', () => {
    const doc = prose('docs/site/src/content/docs/security-and-privacy.md'); // ADAPTED (028): path moved to the documentation site
    expect(doc).toMatch(/Completing an existing item/);
    expect(doc).toMatch(/only after the confirmation window/);
    expect(doc).toMatch(/nothing of the item read .* is logged/);
  });

  it('PRIVACY.md / PRIVACY.fr.md: the chosen item is read and updated on your instance only, after confirmation', () => {
    const en = prose('PRIVACY.md');
    expect(en).toMatch(/item you choose to complete/);
    expect(en).toMatch(
      /Read and then updated \*\*on your HomeBox instance only\*\*, after you confirm/,
    );
    const fr = prose('PRIVACY.fr.md');
    expect(fr).toMatch(/objet HomeBox que vous choisissez de compléter/);
    expect(fr).toMatch(
      /Lu puis mis à jour \*\*sur votre instance HomeBox uniquement\*\*, après votre confirmation/,
    );
  });

  it('README and store listings mention completing the existing item', () => {
    expect(prose('README.md')).toMatch(/completing the existing item/);
    for (const path of ['docs/store/listing.md', 'docs/store/amo-listing.md']) {
      const doc = prose(path);
      expect(doc, path).toMatch(/completing the existing item/);
      expect(doc, path).toMatch(/complément de l'objet existant/);
    }
  });
});
