import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** WCAG 2.x contrast between two `hsl(h s% l%)` colors of theme.css. */
function ratio(a: string, b: string): number {
  const lum = (hsl: string) => {
    const [h, s, l] = (hsl.match(/[\d.]+/g) ?? []).map(Number) as [number, number, number];
    const sat = s / 100;
    const lig = l / 100;
    const k = (n: number) => (n + h / 30) % 12;
    const f = (n: number) => lig - sat * Math.min(lig, 1 - lig) * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(f(0)) + 0.7152 * lin(f(8)) + 0.0722 * lin(f(4));
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const css = readFileSync(resolve(__dirname, '../../src/ui/theme.css'), 'utf8');
const variables = (block: string) => Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*(hsl\([^)]*\))/g)].map((m) => [m[1]!, m[2]!]));
const blocks = {
  clair: variables(css.slice(css.indexOf(':root {'), css.indexOf(":root[data-theme='dark']"))),
  sombre: variables(css.slice(css.indexOf(":root[data-theme='dark']"), css.indexOf('@media (prefers-color-scheme: dark)'))),
  systeme: variables(css.slice(css.indexOf('@media (prefers-color-scheme: dark)'))),
};

describe('action text contrast (--accent-text on --bg, WCAG AA 4.5:1)', () => {
  it.each(Object.entries(blocks))('theme %s', (_name, vars) => {
    expect(vars['--accent-text']).toBeDefined();
    expect(ratio(vars['--accent-text']!, vars['--bg']!)).toBeGreaterThanOrEqual(4.5);
  });

  it('the "Modifier" (Edit) button (.link) uses --accent-text', () => {
    const view = readFileSync(resolve(__dirname, '../../src/ui/popup/SummaryView.vue'), 'utf8');
    expect(view).toMatch(/\.link\s*{[^}]*color:\s*var\(--accent-text\)/);
  });

  it('project links (.project-link) use --accent-text on a --bg footer (004, FR-011)', () => {
    const links = readFileSync(resolve(__dirname, '../../src/ui/components/ProjectLinks.vue'), 'utf8');
    expect(links).toMatch(/\.project-link\s*{[^}]*color:\s*var\(--accent-text\)/);
    const popup = readFileSync(resolve(__dirname, '../../src/ui/popup/App.vue'), 'utf8');
    expect(popup).toMatch(/\.project-footer\s*{[^}]*background:\s*var\(--bg\)/);
  });
});

describe('import history status badges (012, Q-U26, WCAG AA 4.5:1)', () => {
  const pairs = [
    ['complete', '--success-fg', '--success-bg'],
    ['partial', '--warn-fg', '--warn-bg'],
    ['running', '--warn-fg', '--warn-bg'],
    ['failed', '--danger-fg', '--danger-bg'],
  ] as const;

  it.each(Object.entries(blocks).flatMap(([name, vars]) => pairs.map(([status, fg, bg]) => [name, status, vars, fg, bg] as const)))(
    'theme %s, badge %s',
    (_name, _status, vars, fg, bg) => {
      expect(ratio(vars[fg]!, vars[bg]!)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('HistoryList.vue uses these tokens for each badge and has a visible link focus', () => {
    const src = readFileSync(resolve(__dirname, '../../src/ui/components/HistoryList.vue'), 'utf8');
    for (const [status, fg, bg] of pairs) {
      const rule = new RegExp(`\\.badge-${status}[^{]*{[^}]*background:\\s*var\\(${bg}\\)[^}]*color:\\s*var\\(${fg}\\)`);
      expect(src, status).toMatch(rule);
    }
    expect(src).toMatch(/a:focus-visible\s*{[^}]*outline:\s*2px solid var\(--accent\)/);
  });
});

describe('automatic lock card (013, T022)', () => {
  const src = readFileSync(resolve(__dirname, '../../src/ui/options/LockCard.vue'), 'utf8');
  const style = src.slice(src.indexOf('<style'));

  it('only theme variables for colors (no literal color)', () => {
    expect(style).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/);
    for (const m of style.matchAll(/(?:^|[\s;{])(?:color|background(?:-color)?|border(?:-color)?|outline):\s*([^;]+);/g)) {
      const value = m[1]!;
      if (/none|transparent|inherit|^0$/.test(value.trim())) continue;
      expect(value, m[0]).toMatch(/var\(--/);
    }
  });

  it('a visible focus on the radios', () => {
    expect(style).toMatch(/focus-visible\s*{[^}]*outline:\s*2px solid var\(--accent\)/);
  });

  it.each(Object.entries(blocks))('theme %s: the help text (--muted on --bg-card or --bg) is readable', (_name, vars) => {
    const bg = vars['--bg-card'] ?? vars['--card'] ?? vars['--bg'];
    expect(ratio(vars['--muted']!, bg!)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(vars['--fg']!, bg!)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('update banner (013, T040)', () => {
  const src = readFileSync(resolve(__dirname, '../../src/ui/components/UpdateBanner.vue'), 'utf8');
  const style = src.slice(src.indexOf('<style'));

  it('only theme variables for colors (no literal color)', () => {
    expect(style).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/);
  });

  it('the notice uses --chip-fg on --chip-bg, the link --accent-text or --chip-fg', () => {
    expect(style).toMatch(/\.update-banner\s*{[^}]*background:\s*var\(--chip-bg\)[^}]*color:\s*var\(--chip-fg\)/);
  });

  it.each(Object.entries(blocks))('theme %s: --chip-fg on --chip-bg is readable (AA)', (_name, vars) => {
    expect(ratio(vars['--chip-fg']!, vars['--chip-bg']!)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('version number (013, T055)', () => {
  const links = readFileSync(resolve(__dirname, '../../src/ui/components/ProjectLinks.vue'), 'utf8');

  it('.project-version uses --muted or --fg', () => {
    expect(links).toMatch(/\.project-version\s*{[^}]*color:\s*var\(--(muted|fg)\)/);
  });

  it.each(Object.entries(blocks))('theme %s: --muted on --bg is readable (AA)', (_name, vars) => {
    expect(ratio(vars['--muted']!, vars['--bg']!)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('tag mentions « new » / « not verified » (014, T029 c, FR-021)', () => {
  const src = readFileSync(resolve(__dirname, '../../src/ui/components/TagPicker.vue'), 'utf8');
  const style = src.slice(src.indexOf('<style'));

  it('only theme variables for colors (no literal color)', () => {
    expect(style).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/);
  });

  it('« new » uses --chip-fg on --chip-bg, « not verified » --warn-fg on --warn-bg', () => {
    expect(style).toMatch(/\.badge-new\s*{[^}]*background:\s*var\(--chip-bg\)[^}]*color:\s*var\(--chip-fg\)/);
    expect(style).toMatch(/\.badge-unverified\s*{[^}]*background:\s*var\(--warn-bg\)[^}]*color:\s*var\(--warn-fg\)/);
  });

  it.each(Object.entries(blocks))('theme %s: both mentions are readable (AA)', (_name, vars) => {
    expect(ratio(vars['--chip-fg']!, vars['--chip-bg']!)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(vars['--warn-fg']!, vars['--warn-bg']!)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('automatic tags card (014, T046)', () => {
  const src = readFileSync(resolve(__dirname, '../../src/ui/options/TagsCard.vue'), 'utf8');
  const style = src.slice(src.indexOf('<style'));

  it('only theme variables for colors (no literal color)', () => {
    expect(style).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/);
    for (const m of style.matchAll(/(?:^|[\s;{])(?:color|background(?:-color)?|border(?:-color)?|outline):\s*([^;]+);/g)) {
      const value = m[1]!;
      if (/none|transparent|inherit|^0$/.test(value.trim())) continue;
      expect(value, m[0]).toMatch(/var\(--/);
    }
  });

  it.each(Object.entries(blocks))('theme %s: help (--muted) and errors (--danger-fg) readable on --bg', (_name, vars) => {
    expect(ratio(vars['--muted']!, vars['--bg']!)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(vars['--danger-fg']!, vars['--bg']!)).toBeGreaterThanOrEqual(4.5);
  });
});
