# Demo GIF

`homebox-clipper-demo.gif` is the animation shown in the "Demo" section of `README.md` and
`README.fr.md` (about 28 s, 960 px wide, under 2 MB).

It is a **real screen recording**: a real Amazon.fr order imported into a test HomeBox instance with the
released extension. Every piece of personal data is covered by an opaque grey box: browser address and
bookmarks bars, name, delivery address, payment method, order number (page, popup, invoice file name,
HomeBox notes) and the HomeBox instance address. Every frame of the final GIF was checked, visually and with
OCR, before it was committed. The raw recording is never stored in the repository.

## Regenerate

There is no automatic generator for the real recording: record the screen, then crop, mask and convert with
`ffmpeg` (`palettegen` / `paletteuse`), and check every frame of the result before committing it.

A fully fictitious variant (order `000-0000000-0000000`, seller `Example Seller`, generated picture and
invoice, throwaway HomeBox instance exposed as `https://homebox.example.com`) can be regenerated with the
local, git-ignored script `specs/003-photo-and-location/qa-harness/readme-demo.mjs`:

```sh
bun install --frozen-lockfile --ignore-scripts && bunx wxt prepare && bun run build
QA_REPO="$PWD" node specs/003-photo-and-location/qa-harness/readme-demo.mjs
```
