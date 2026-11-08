import { loadCatalog, makeGetMessage, setTestLanguage, testLanguage } from './i18n-harness';

// fake-browser does not implement `i18n.getMessage`: all tests read the real catalog (fr.yml
// by default, en.yml after `setTestLanguage('en')`) via the harness. A test that wants to control the
// texts calls `vi.mock('@/platform/i18n')` itself.
vi.mock('@/platform/i18n', () => ({
  getMessage: (key: string, substitutions?: string | string[]) =>
    makeGetMessage(loadCatalog(testLanguage()))(key, substitutions),
  getUILanguage: () => testLanguage(),
}));

// Each test starts in French: an English test does not contaminate the following ones.
beforeEach(() => setTestLanguage('fr'));
