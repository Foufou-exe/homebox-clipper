// @ts-check
// Documentation website of HomeBox Clipper (spec 028). Separate project: it is neither built, nor linted,
// nor tested with the extension, and never ships in the extension or in its source archive.
//
// Privacy: no analytics, no tracker, no third-party script or font at runtime (Starlight uses system
// fonts; the search is Pagefind, an index built at build time and served from this site).
import { defineConfig, passthroughImageService } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLinksValidator from 'starlight-links-validator';

const REPO = 'https://github.com/Foufou-exe/homebox-clipper';

export default defineConfig({
  // Vite 8 must not look for a tsconfig above docs/site (the extension's one needs generated files).
  vite: { tsconfig: './tsconfig.json' },
  // GitHub Pages project site: https://foufou-exe.github.io/homebox-clipper/
  site: 'https://foufou-exe.github.io',
  base: '/homebox-clipper',
  trailingSlash: 'always',
  // No image is optimized: no native `sharp` step, the site only uses SVG.
  image: { service: passthroughImageService() },
  integrations: [
    starlight({
      title: 'HomeBox Clipper',
      description: 'Import your online purchases into your HomeBox inventory, invoice included.',
      logo: { src: './src/assets/logo.svg', alt: 'HomeBox Clipper' },
      favicon: '/favicon.svg',
      defaultLocale: 'root',
      locales: {
        root: { label: 'English', lang: 'en' },
        fr: { label: 'Français', lang: 'fr' },
      },
      social: [{ icon: 'github', label: 'GitHub', href: REPO }],
      editLink: { baseUrl: `${REPO}/edit/main/docs/site/` },
      lastUpdated: true,
      customCss: ['./src/styles/custom.css'],
      plugins: [
        // The build fails on a broken internal link or anchor, in both languages, and on a page missing in
        // one language. Local links are allowed: the local HomeBox guide points to http://localhost:3100.
        starlightLinksValidator({ errorOnInvalidHashes: true, errorOnFallbackPages: true, errorOnLocalLinks: false }),
      ],
      sidebar: [
        {
          label: 'Getting started',
          translations: { fr: 'Démarrage' },
          items: ['getting-started/installation', 'configuration'],
        },
        {
          label: 'Using the extension',
          translations: { fr: 'Utilisation' },
          items: ['usage', 'supported-merchants'],
        },
        {
          label: 'Privacy and help',
          translations: { fr: 'Confidentialité et aide' },
          items: ['security-and-privacy', 'troubleshooting-and-faq'],
        },
        {
          label: 'Contributing',
          translations: { fr: 'Contribuer' },
          collapsed: true,
          items: [
            'contributing/development-setup',
            'contributing/submitting-changes',
            'contributing/commands',
            'contributing/local-homebox-instance',
            'contributing/testing-and-fixtures',
            'contributing/adding-a-merchant',
            'contributing/translations',
            'contributing/architecture',
          ],
        },
        // Users and contributors only (issue #147): maintainer documentation lives in docs/maintainer/
        // (French, in the repository) and is never published on this site.
      ],
    }),
  ],
});
