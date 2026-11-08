# Tests and fixtures

## Run the checks

| Command | Role |
|---------|------|
| `bun run test` | Unit and contract tests (Vitest, happy-dom environment). **Not** `bun test`. |
| `bun run test:watch` | Watch mode. |
| `bun run test:build` | Checks the production manifest (permissions, CSP); run **after** `bun run build`. |
| `bun run typecheck` | Types (`vue-tsc --noEmit`). |
| `bun run lint` | ESLint. |
| `bun run check:config` | Repository settings: JSON(C), YAML, Bun version, issue templates and labels, `en`/`fr` catalog parity. |
| `bun run ci` | Everything, in order: check:config, typecheck, lint, test, build, test:build. |

GitHub CI runs the same checks on pull requests and on `main`; run **`bun run ci` locally before every push** to catch errors early. An
optional `pre-push` hook can run it automatically (`bun run setup` offers it).

## Layout of `tests/`

| Folder | Content |
|--------|---------|
| `tests/unit/` | Parsers, Amazon.fr extractor, download, PDF, URL rule, key encryption, settings storage, router, duplicates, theme, translation catalogs (including `en`/`fr` parity), privacy, text rendering. |
| `tests/contract/` | HomeBox client and import orchestrator against a **simulated** API (success, 401, network error, non-JSON response, attachment failure after creation, recovery). |
| `tests/build/` | Check of the produced manifest (exact permissions, no static `host_permissions`, optional host permissions, CSP). |
| `tests/fixtures/` | Anonymized order pages (see below). |

## Anonymized fixtures

Each extractor is tested on recorded HTML pages. For Amazon.fr, they are in `tests/fixtures/amazon-fr/`:
single-item page with invoice, several items, several shipments, no invoice, third-party seller, old
layout, page that is not an order, content of the "Invoice" menu. The current files are **synthetic**
(written by hand from the known structure of the pages): they have not yet been compared with real
anonymized pages.

### Add or replace a fixture

1. On an order details page: right-click, "Save as", *Webpage, HTML only*, into
   `tests/fixtures/amazon-fr/raw/` (folder **ignored by git**, never commit it).
2. Copy the file out of `raw/`, then:
   - remove the `<script>`, `<style>`, `<link>`, `<iframe>` tags and the comments;
   - replace the name, the delivery address and the payment method with fictitious values
     (`Jean Exemple`, `1 rue Fictive`, `Carte se terminant par 0000`, the placeholders already used by the
     existing fixtures, since the Amazon.fr pages are in French);
   - replace the order number with `999-0000000-00000NN` and the document identifiers
     (`/documents/download/<uuid>/`) with fictitious UUIDs;
   - keep the DOM structure (tags, classes, `data-*` attributes).
3. Check that nothing personal remains:
   `grep -iE "@|\b0[67][0-9 ]{8}\b|<script" file.html` must return nothing.
4. Note the capture date and the page type in the folder's README (never the real address).

### When Amazon changes its layout

1. Capture and anonymize the new page as above.
2. Add a test that **fails** on this fixture (`tests/unit/amazon-fr-extractor.test.ts`).
3. Fix **only** `src/content/merchants/amazon-fr/selectors.ts`, adding fallback selectors rather than
   replacing the old ones when possible.

A selector fix without a fixture reproducing the new structure is not accepted.

## Notable automatic checks

- The `en` and `fr` catalogs have the same keys and the same substitutions; the literal translation keys
  used in `src/` exist in the catalog, each error code has its message, no catalog value is empty.
- The rendering of the "Unencrypted HTTP" warning matches the catalog exactly.
- The duplicate search looks for the order number in quotes and compares normalized names.
- The URL rule is tested, including against public names that imitate a private IP.
- The production manifest is compared with the exact list of allowed permissions.

To set up a test HomeBox instance and walk through the scenarios by hand:
[Local-HomeBox-instance](Local-HomeBox-instance.md). To add a merchant: [Adding-a-merchant](Adding-a-merchant.md).
