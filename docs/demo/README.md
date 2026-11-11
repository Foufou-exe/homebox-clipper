# Demo GIF

`homebox-clipper-demo.gif` is the animation shown at the top of `README.md` and `README.fr.md`
(about 20 s, 960 px wide, under 1 MB). It uses only fictitious data: the order `000-0000000-0000000`,
the seller `Example Seller`, a generated hammer picture and a generated PDF invoice, and a throwaway
HomeBox instance exposed as `https://homebox.example.com`.

## Regenerate

The generator is `readme-demo.mjs`, a local script that is git-ignored (it lives next to the QA harness in
`specs/003-photo-and-location/qa-harness/`, which is not tracked). It needs Docker, Chromium, `ffmpeg`,
`openssl` and the harness `node_modules` (`playwright-core`).

```sh
bun install --frozen-lockfile --ignore-scripts && bunx wxt prepare && bun run build
QA_REPO="$PWD" node specs/003-photo-and-location/qa-harness/readme-demo.mjs
```

The script starts a throwaway HomeBox container (`qa-readme-homebox`, volume `qa-readme-hb-data`, bound to
loopback only), records a sequence of 1280x800 frames (Amazon order page, popup, location search, import,
item page in HomeBox), assembles them with `ffmpeg` (`palettegen` / `paletteuse`), then removes the container
and the volume, even on error. It never touches a personal HomeBox instance. Pass a path as the first argument to
write the GIF elsewhere.
