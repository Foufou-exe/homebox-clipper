import { loadCatalog, makeGetMessage, setTestLanguage, testLanguage } from './i18n-harness';

// fake-browser n'implémente pas `i18n.getMessage` : tous les tests lisent le vrai catalogue (fr.yml
// par défaut, en.yml après `setTestLanguage('en')`) via le harnais. Un test qui veut contrôler les
// textes appelle `vi.mock('@/platform/i18n')` lui-même.
vi.mock('@/platform/i18n', () => ({
  getMessage: (key: string, substitutions?: string | string[]) =>
    makeGetMessage(loadCatalog(testLanguage()))(key, substitutions),
  getUILanguage: () => testLanguage(),
}));

// Chaque test démarre en français : un test en anglais ne contamine pas les suivants.
beforeEach(() => setTestLanguage('fr'));
