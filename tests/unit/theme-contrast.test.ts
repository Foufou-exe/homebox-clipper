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
