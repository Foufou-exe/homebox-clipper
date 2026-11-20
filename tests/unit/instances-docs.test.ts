import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Documentation of several HomeBox instances (spec 016, FR-031, Q-U9). Reads the files of the working tree; fixed
 * values only, never a git reference.
 */
const root = resolve(__dirname, '../..');
/** Text with line breaks folded, for sentences wrapped in the Markdown source. */
const prose = (path: string) => readFileSync(resolve(root, path), 'utf8').replace(/\s+/g, ' ');

describe('documentation of several HomeBox instances (016, FR-031, Q-U9, T101)', () => {
  it('PRIVACY.md: several instances, one permission per exact origin, deletion per instance, opaque inst, one passphrase', () => {
    const doc = prose('PRIVACY.md');
    expect(doc).toContain('homeboxInstances');
    expect(doc).toMatch(/several HomeBox instances/i);
    expect(doc).toMatch(/its own access permission/i);
    expect(doc).toMatch(/exact origin/i);
    expect(doc).toMatch(/no other instance uses it/i);
    expect(doc).toMatch(/Deleting an instance/);
    expect(doc).toMatch(/its history entries/i);
    expect(doc).toContain('`inst`');
    expect(doc).toMatch(/opaque identifier/i);
    expect(doc).toMatch(/a single passphrase/i);
    expect(doc).toContain('Delete all settings');
  });

  it('PRIVACY.fr.md: the same elements in French', () => {
    const doc = prose('PRIVACY.fr.md');
    expect(doc).toContain('homeboxInstances');
    expect(doc).toMatch(/plusieurs instances HomeBox/i);
    expect(doc).toMatch(/sa propre permission d’accès/i);
    expect(doc).toMatch(/origine exacte/i);
    expect(doc).toMatch(/aucune autre instance ne l’utilise/i);
    expect(doc).toMatch(/Supprimer une instance/);
    expect(doc).toMatch(/ses entrées d’historique/i);
    expect(doc).toContain('`inst`');
    expect(doc).toMatch(/identifiant opaque/i);
    expect(doc).toMatch(/une seule phrase de passe/i);
    expect(doc).toContain('Supprimer toute la configuration');
  });

  it('Architecture: storage, session v2, targeted messages, inst, no downgrade, orchestrator and snapshot unchanged', () => {
    const doc = prose('docs/wiki/Architecture.md');
    for (const term of [
      'homeboxInstances',
      'lastInstanceId',
      'lastLocationByInstance',
      '`{ v: 2, keys',
      'instanceId',
      '`inst`',
      'orchestrator-call-sequence',
    ]) {
      expect(doc, term).toContain(term);
    }
    expect(doc).toMatch(/downgrad/i);
    expect(doc).toMatch(/migration is idempotent/i);
    expect(doc).toMatch(/orchestrator[^.]{0,80}unchanged/i);
  });

  it('Configuration: add, rename, test, change, delete an instance; limit 10; passphrase asked at every add; change it', () => {
    const doc = prose('docs/wiki/Configuration.md');
    for (const term of [
      'Add an instance',
      'Rename',
      'Test the connection',
      'Change the address or key',
      'Delete this instance',
      'Change the passphrase',
      'Delete all settings',
    ]) {
      expect(doc, term).toContain(term);
    }
    expect(doc).toMatch(/up to 10 instances/i);
    expect(doc).toMatch(/passphrase is asked at every add/i);
  });

  it('Usage: instance selector from two instances, last successful import proposed, resume to the instance of origin', () => {
    const doc = prose('docs/wiki/Usage.md');
    expect(doc).toMatch(/HomeBox instance selector/i);
    expect(doc).toMatch(/two instances or more/i);
    expect(doc).toMatch(/last successful import/i);
    expect(doc).toMatch(/always resumed on the instance it was started on/i);
  });

  it('Security and privacy: one key per instance, address as associated data, permission removed when unused, nothing to another instance', () => {
    const doc = prose('docs/wiki/Security-and-privacy.md');
    expect(doc).toMatch(/each instance has its own API key/i);
    expect(doc).toMatch(/associated data/i);
    expect(doc).toMatch(/removed as soon as no instance uses it/i);
    expect(doc).toMatch(/never sent to another instance/i);
  });

  it('Troubleshooting and FAQ: the instance codes and the forgotten passphrase with several instances', () => {
    const doc = prose('docs/wiki/Troubleshooting-and-FAQ.md');
    for (const code of [
      'INSTANCE_NOT_FOUND',
      'INSTANCE_LIMIT',
      'INSTANCE_EXISTS',
      'INSTANCE_NAME_INVALID',
      'INSTANCE_NAME_TAKEN',
      'INSTANCE_BUSY',
      'KEY_UNREADABLE',
    ]) {
      expect(doc, code).toContain(`\`${code}\``);
    }
    expect(doc).toMatch(/forgot[^.]{0,120}several instances[^.]{0,200}Delete all settings/i);
  });

  it('README: one line on several HomeBox instances, in English and in French', () => {
    expect(prose('README.md')).toMatch(/several HomeBox instances/i);
    expect(prose('README.fr.md')).toMatch(/plusieurs instances HomeBox/i);
  });

  it('no real address or key: only fictitious example domains and key prefixes', () => {
    for (const path of [
      'PRIVACY.md',
      'PRIVACY.fr.md',
      'docs/wiki/Architecture.md',
      'docs/wiki/Configuration.md',
      'docs/wiki/Usage.md',
      'docs/wiki/Security-and-privacy.md',
      'docs/wiki/Troubleshooting-and-FAQ.md',
    ]) {
      const doc = prose(path);
      expect(doc, path).not.toMatch(/hb_[A-Za-z0-9]{12,}/);
      for (const host of doc.match(/https?:\/\/[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []) {
        expect(host, path).toMatch(
          /^https?:\/\/([a-z0-9-]+\.)*(example\.(com|org|net)|amazon\.[a-z.]+|github\.com|vuejs\.org|wxt\.dev)$|^http:\/\/localhost/i,
        );
      }
    }
  });
});
