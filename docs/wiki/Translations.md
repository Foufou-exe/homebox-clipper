# Translations and interface texts

All the visible texts of the extension come from **catalogs**: `src/locales/en.yml` (English, the default
language and the reference) and `src/locales/fr.yml` (French). No text is hard-coded in the Vue
components or in the code of `src/ui/`.

## Which language is shown

- `default_locale` is `en` in `wxt.config.ts`: the manifest texts (`extName`, `extDescription`) come from
  `en.yml`, and French is served from `_locales/fr` when the browser is set to French.
- In the interface, `uiLanguage()` (`src/ui/i18n.ts`) picks the language from the browser's interface
  language: `fr` for `fr`, `fr-CA`..., `en` for anything else. It also drives the `lang` attribute of the
  pages and the date format (`formatDate`: `22/10/2026` in French, `22 October 2026` in English).
- The notes written in HomeBox (for example "Amazon.de order: <number>") follow the same language; the
  store name comes from the code (`MERCHANT_CATALOG`), never from the catalogs.

## Catalog format

- Nested YAML in the `@wxt-dev/i18n` format, one message per leaf.
- Keys are grouped by screen or layer: `extName`, `extDescription`, `common.*`, `header.*`, `theme.*`,
  `fields.*`, `documents.*`, `popup.*`, `summary.*`, `location.*`, `result.*`, `recovery.*`, `unlock.*`,
  `options.*`, `error.<CODE>`.
- **Naming**: segments in `camelCase`, except the last segment of `error.*`, which reuses the error code
  in `UPPER_SNAKE_CASE` (`error.UNAUTHORIZED`, `error.NOT_AN_ORDER_PAGE`).
- Dynamic values use **positional substitutions** `$1`, `$2`..., never concatenation in the code
  (example: `summary.orderNote` is "$1 order: $2", `$1` being the store and `$2` the order number).
- `extName` and `extDescription` feed the extension's name and description in the manifest.
- Forbidden in a message: the API key, an instance address, purchase data.

## Parity between `en` and `fr`

`en.yml` and `fr.yml` must always stay in step:

- **Same keys**: exactly the same set of keys in both files.
- **Same substitutions**: each key has the same `$n` placeholders in both languages.
- **No untranslated text**: a value identical in both languages (for example a proper name) must be in
  the explicit exception list of the test (`IDENTICAL_OK`), with the reason in a comment; an exception that
  has become useless also fails the test.
- **No accented character in `en.yml`**.

The parity is checked in two places: `bun run check:config` (keys and substitutions, run first by
`bun run ci` and so by the `pre-push` hook) and `tests/unit/locales.test.ts` (run by `bun run test`).

> [!IMPORTANT]
> **Rule FR-004c.** Any interface text added or changed is added or changed in **both catalogs**
> (`src/locales/en.yml` and `src/locales/fr.yml`) **in the same contribution**. A pull request that
> touches only one of the two does not pass `bun run ci`.

## Change an existing text

1. Find the key in `src/locales/en.yml` (the displayed text is the value) and its twin in `fr.yml`.
2. Change the value in **both** files. Do not rename a key without updating all its usages.
3. Run `bun run test` then `bun run ci`.

## Add a text

1. Add the key to **`en.yml` and `fr.yml`**, in the right group, with the same substitutions.
2. In a component or a module of `src/ui/`, call `t('group.key')` (or `t('group.key', [value])`) from
   `src/ui/i18n.ts`. Keys are **typed** from the catalog: an unknown key does not compile.
3. For an error code, add the code to `src/shared/errors.ts` **and** the `error.<CODE>` key (in both
   files): the test refuses a code without a message. Use `errorMessage(code)` to display it.
4. In the service worker (which does not import `src/ui/`), use `getMessage` from `src/platform/i18n.ts`.
5. Dates go through `formatDate`, file sizes through the `common.size*` keys.

The browser's message name is the key with dots replaced by underscores (`popup.pageTitle` becomes
`popup_pageTitle`). You do not have to handle it yourself.

## Add another language

Adding a language follows the same principle: a `src/locales/<language>.yml` file with all the keys, the
same substitutions as `en.yml`, and the parity test extended to it. Update `uiLanguage()` and
`formatDate` in `src/ui/i18n.ts`, which today only distinguish `fr` from the default `en`.

## What the tests check

`tests/unit/locales.test.ts`: `en`/`fr` parity (keys, substitutions, untranslated text, no accents in
`en.yml`), no empty value, an `error.<CODE>` message for each error code, presence of `extName` and
`extDescription`, and existence in the catalog of each literal key passed to `t()` or `getMessage()` in
`src/`. `tests/unit/ui-i18n-render.test.ts` checks that the displayed "Unencrypted HTTP" warning is
exactly the catalog value.

See also [Architecture](Architecture.md) (i18n layer) and [Testing-and-fixtures](Testing-and-fixtures.md).
