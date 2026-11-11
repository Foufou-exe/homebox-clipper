# Chrome Web Store screenshots

Ten PNG files, 1280x800, full bleed, fictitious data only (order `000-0000000-0000000`, seller
`Example Seller`, price `19,99 €`, instance `https://homebox.example.com`). Scenes: 1 summary,
2 imported item, 3 settings, 4 location search with a two-product order, 5 dark theme. Each exists in
English (`-en`) and French (`-fr`).

They are produced from the real extension build (popup and options page) and a throwaway HomeBox
container. The generator script is local and ignored by git, in the main checkout:
`specs/003-photo-and-location/qa-harness/store-shots.mjs` (it reuses `lib.mjs` from the same folder).

To regenerate (Docker, Chromium at `/usr/bin/chromium`, and `bun` are required):

```sh
bun install --frozen-lockfile --ignore-scripts && bunx wxt prepare && bun run build
QA_REPO="$PWD" node <main-checkout>/specs/003-photo-and-location/qa-harness/store-shots.mjs "$PWD/docs/store/screenshots"
```

The script creates a disposable HomeBox container (`qa-store-homebox` and its volume), runs the English
then the French pass, and removes the container and volume at the end. It never uses the personal
instance or the `homebox/` folder.
