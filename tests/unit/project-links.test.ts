import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { flushPromises, mount } from '@vue/test-utils';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { send } from '@/shared/messages';
import { PROJECT_LINKS } from '@/shared/project-links';
import { releaseNotesUrl } from '@/shared/project-links';
import type { ConfigView } from '@/shared/types';
import OptionsApp from '@/ui/options/App.vue';
import PopupApp from '@/ui/popup/App.vue';
import { loadCatalog, setTestLanguage } from './i18n-harness';

vi.mock('@/shared/messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/messages')>()),
  send: vi.fn(),
}));

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');
const SUPPORT = 'https://github.com/Foufou-exe/homebox-clipper/issues';
const GITHUB = 'https://github.com/Foufou-exe/homebox-clipper';
const config = (over: Partial<ConfigView> = {}): ConfigView => ({
  configured: true,
  baseUrl: 'https://homebox.example.com',
  lastCheck: { status: 'ok', version: '0.27.0', at: '2026-10-22T10:00:00Z' },
  ...over,
});

describe('PROJECT_LINKS (FR-003, FR-004, SC-003)', () => {
  it('exact addresses', () => {
    expect(PROJECT_LINKS.support).toBe(SUPPORT);
    expect(PROJECT_LINKS.github).toBe(GITHUB);
  });

  it.each(Object.entries(PROJECT_LINKS))('%s: no query string, no fragment', (_name, href) => {
    const url = new URL(href);
    expect(url.search).toBe('');
    expect(url.hash).toBe('');
  });

  it('ProjectLinks.vue makes no request, log, message or programmatic navigation (FR-007, FR-013)', () => {
    const source = read('src/ui/components/ProjectLinks.vue');
    for (const forbidden of ['fetch', 'XMLHttpRequest', 'sendMessage', 'console.', 'tabs.create', 'window.open']) {
      expect(source, forbidden).not.toContain(forbidden);
    }
    expect(source).not.toMatch(/@click|v-if/);
  });

  it('the addresses live only in src/shared/project-links.ts', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|vue|yml|html)$/.test(name) && !path.endsWith(join('shared', 'project-links.ts'))) {
          if (readFileSync(path, 'utf8').includes('github.com/')) offenders.push(path);
        }
      }
    };
    walk(resolve(root, 'src'));
    expect(offenders).toEqual([]);
  });
});

function expectLinks(scope: { findAll: (s: string) => { attributes: (n?: string) => Record<string, string> | string }[] }) {
  const links = scope.findAll('a');
  expect(links).toHaveLength(2);
  const attr = (i: number, n: string) => links[i]!.attributes(n) as string;
  expect(attr(0, 'href')).toBe(PROJECT_LINKS.support);
  expect(attr(1, 'href')).toBe(PROJECT_LINKS.github);
  for (const i of [0, 1]) {
    expect(attr(i, 'target')).toBe('_blank');
    expect(attr(i, 'rel')).toContain('noopener');
    expect(attr(i, 'rel')).toContain('noreferrer');
  }
}

describe('popup: project footer (US1, FR-001, FR-005, FR-012)', () => {
  const states: [string, ConfigView][] = [
    ['not configured', { configured: false }],
    ['configured and locked', config({ locked: true })],
    ['configured and unlocked', config({ locked: false })],
  ];

  it.each(states)('%s', async (_name, view) => {
    vi.mocked(send).mockResolvedValue(view as never);
    const wrapper = mount(PopupApp);
    await flushPromises();
    const footer = wrapper.find('footer');
    expect(footer.exists()).toBe(true);
    expect(footer.element.closest('.content')).toBeNull();
    expect(wrapper.find('.content a').exists()).toBe(false);
    expectLinks(footer);
    expect(wrapper.find('header a').exists()).toBe(false);
    expect(wrapper.find('header button[aria-label="Configuration"]').exists()).toBe(true);
  });

  it('the footer is displayed from the first render (loading screen)', () => {
    vi.mocked(send).mockReturnValue(new Promise(() => {}) as never);
    const wrapper = mount(PopupApp);
    expect(wrapper.find('footer').exists()).toBe(true);
  });

  it('clicking a link makes no navigation call from the extension (FR-007)', async () => {
    vi.mocked(send).mockResolvedValue({ configured: false } as never);
    const create = vi.spyOn(fakeBrowser.tabs, 'create');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const wrapper = mount(PopupApp);
    await flushPromises();
    for (const a of wrapper.findAll('footer a')) await a.trigger('click');
    expect(create).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('options: "Help and project" section (US2, FR-002)', () => {
  it('a section after "Appearance" with title, explanation and two links', async () => {
    vi.mocked(send).mockResolvedValue({ configured: false } as never);
    const wrapper = mount(OptionsApp);
    await flushPromises();
    const titles = wrapper.findAll('h2').map((h) => h.text());
    const help = titles.indexOf('Aide et projet');
    expect(help).toBeGreaterThan(-1);
    expect(help).toBe(titles.indexOf('Apparence') + 1);
    expect(titles).toHaveLength(help + 1);
    const section = wrapper.findAll('section').find((x) => x.find('h2').exists() && x.find('h2').text() === 'Aide et projet')!;
    expect(section.find('p').text()).toContain('Un bug ou un nouveau marchand');
    expectLinks(section);
    expect(section.findAll('a').map((a) => a.text())).toEqual(['Support', 'GitHub']);
  });
});

describe('accessibility and language (US3, FR-009, FR-010, SC-005)', () => {
  it('ProjectLinks.vue defines a visible focus for links', () => {
    const source = read('src/ui/components/ProjectLinks.vue');
    expect(source).toMatch(/a\.project-link:focus-visible\s*{[^}]*outline:\s*2px solid var\(--accent\)/);
  });

  it.each(['fr', 'en'] as const)('texts and accessible names come from the %s catalog', async (lang) => {
    setTestLanguage(lang);
    const catalog = loadCatalog(lang);
    vi.mocked(send).mockResolvedValue({ configured: false } as never);
    const wrapper = mount(PopupApp);
    await flushPromises();
    const [support, github] = wrapper.findAll('footer a');
    expect(support!.text()).toBe(catalog['links.support']);
    expect(github!.text()).toBe(catalog['links.github']);
    expect(support!.attributes('aria-label')).toBe(catalog['links.supportAria']);
    expect(github!.attributes('aria-label')).toBe(catalog['links.githubAria']);
  });

  it('the French accessible name is the exact expected sentence', async () => {
    vi.mocked(send).mockResolvedValue({ configured: false } as never);
    const wrapper = mount(PopupApp);
    await flushPromises();
    expect(wrapper.find('footer a').attributes('aria-label')).toBe(
      'Support : ouvrir les issues du projet sur GitHub (nouvel onglet)',
    );
  });
});

describe('releaseNotesUrl (013, Q-U6, FR-013)', () => {
  it('a release tag address for a valid version', () => {
    expect(releaseNotesUrl('0.4.0')).toBe('https://github.com/Foufou-exe/homebox-clipper/releases/tag/v0.4.0');
  });

  it.each(['x', '', '1.0.0/../x', 'v0.4.0', '1.2.3.4.5'])('null for %j (nothing else can enter the address)', (v) => {
    expect(releaseNotesUrl(v)).toBeNull();
  });

  it('github.com/ still only appears in src/shared/project-links.ts (UpdateBanner.vue included)', () => {
    expect(read('src/ui/components/UpdateBanner.vue')).not.toContain('github.com/');
  });
});

describe('version number next to the project links (013, Q-U9, FR-017)', () => {
  const manifest = (version: string) =>
    vi.spyOn(fakeBrowser.runtime, 'getManifest').mockReturnValue({ version } as never);

  it('popup footer: "Version x" after the two links, from getManifest()', async () => {
    manifest('0.4.0');
    vi.mocked(send).mockResolvedValue({ configured: false } as never);
    const wrapper = mount(PopupApp);
    await flushPromises();
    const footer = wrapper.find('footer');
    expectLinks(footer);
    const version = footer.get('.project-version');
    expect(version.element.tagName).toBe('SPAN');
    expect(version.text()).toBe('Version 0.4.0');
    const children = [...footer.get('.project-links').element.children];
    expect(children.indexOf(version.element)).toBe(children.length - 1);
    expect(children.filter((c) => c.tagName === 'A')).toHaveLength(2);
  });

  it('options "Help and project": the same version, two links still', async () => {
    manifest('0.4.0');
    vi.mocked(send).mockResolvedValue({ configured: false } as never);
    const wrapper = mount(OptionsApp);
    await flushPromises();
    const section = wrapper.findAll('section').find((x) => x.find('h2').exists() && x.find('h2').text() === 'Aide et projet')!;
    expectLinks(section);
    expect(section.get('.buttons .project-version').text()).toBe('Version 0.4.0');
  });

  it.each([
    ['throws', () => vi.spyOn(fakeBrowser.runtime, 'getManifest').mockImplementation(() => { throw new Error('x'); })],
    ['unreadable version', () => manifest('<b>x</b>')],
    ['no version', () => vi.spyOn(fakeBrowser.runtime, 'getManifest').mockReturnValue({} as never)],
  ])('getManifest %s: the two links, no version, no exception', async (_label, setup) => {
    setup();
    vi.mocked(send).mockResolvedValue({ configured: false } as never);
    const wrapper = mount(PopupApp);
    await flushPromises();
    expectLinks(wrapper.find('footer'));
    expect(wrapper.find('.project-version').exists()).toBe(false);
  });

  it('the version follows the manifest (US3-3: after an update, the new value)', async () => {
    vi.mocked(send).mockResolvedValue({ configured: false } as never);
    manifest('0.4.0');
    const before = mount(PopupApp);
    await flushPromises();
    expect(before.get('.project-version').text()).toBe('Version 0.4.0');
    manifest('0.5.0');
    const after = mount(PopupApp);
    await flushPromises();
    expect(after.get('.project-version').text()).toBe('Version 0.5.0');
  });

  it('the component reads the version without request, message, log or navigation', () => {
    const source = read('src/ui/components/ProjectLinks.vue');
    expect(source).toContain('getManifest');
    for (const forbidden of ['fetch', 'sendMessage', 'console.', 'tabs.create', 'window.open']) {
      expect(source, forbidden).not.toContain(forbidden);
    }
    expect(source).not.toMatch(/@click/);
    // The links are never conditional; only the version may be absent.
    for (const line of source.split('\n').filter((l) => l.includes('<a '))) expect(line).not.toMatch(/v-if|v-show/);
  });
});

describe('options: « Automatic tags » card order (014, T046)', () => {
  it('after « Garantie », before « Apparence » and « Aide et projet »', async () => {
    vi.mocked(send).mockResolvedValue({ configured: false } as never);
    const wrapper = mount(OptionsApp);
    await flushPromises();
    const titles = wrapper.findAll('h2').map((h) => h.text());
    const tags = titles.indexOf('Tags automatiques');
    expect(tags).toBeGreaterThan(-1);
    expect(titles[tags - 1]).toBe('Garantie');
    expect(titles[tags + 1]).toBe('Apparence');
    expect(titles[tags + 2]).toBe('Aide et projet');
  });
});
