import { loadCatalog, makeGetMessage } from './i18n-harness';

// fake-browser n'implémente pas `i18n.getMessage` : tous les tests lisent le vrai catalogue fr.yml
// via le harnais. Un test qui veut contrôler les textes appelle `vi.mock('@/platform/i18n')` lui-même.
vi.mock('@/platform/i18n', () => ({
  getMessage: makeGetMessage(loadCatalog('fr')),
  getUILanguage: () => 'fr',
}));
