# Ashen Oath — source

The playable build lives at the repository root (served by GitHub Pages). This folder holds what it is built from.

## Layout

- `src/page.html` — HUD, menus and overlays (HTML + CSS)
- `src/00_core.js` … `src/80_main.js` — the game, concatenated in file-name order into one module:
  - `00_core` renderer, quality presets, post-processing · `10_textures` procedural textures · `12_assets` Poly Haven asset loading
  - `20_rig` procedural skeleton, IK, cloth · `30_characters` player and Boss I (The Ashen Knight) · `35_herald` Boss II model (The Pale Herald)
  - `40_arena`, `45_world` the Last Cathedral · `50_vfx` particles, trails, rings · `60_audio` procedural sound and music
  - `70_combat` player controller, boss AI, Boss I moves · `75_herald` Boss II moves, conjured daggers, blade rain · `80_main` camera, UI, flow, boot
- `build.py` — writes `dist/index.html` (and `dist/test.html` for the tests)
- `make_pages.py` — turns `dist/` into the GitHub Pages bundle (`pages/`: full HTML document, manifest, icons, assets, fonts)
- `tests/` — Playwright checks and the balance bots (`t20.mjs`: N fights per bot, e.g. `node t20.mjs expert,human 6 herald`)

## Build and publish

```
cd source
mkdir -p dist && cp -r ../assets ../fonts dist/   # the bundled assets and fonts
python3 build.py                                 # dist/index.html, dist/test.html
python3 make_pages.py                            # pages/  → copy its contents to the repository root and push
```

## Tests

The tests use Playwright with Chromium and serve `dist/` on port 8123 (`./serve.sh`). `tests/test.mjs` serves three.js r169
from a local checkout at `source/three-src/` (`build/` and `examples/jsm/` of the three.js repository at tag r169) instead of the CDN.
Copy the tests next to `test.mjs` paths as needed (they import `./test.mjs`).

Credits: textures, boulder model and night HDRI from Poly Haven (CC0); fonts Cinzel and Cormorant Garamond (SIL OFL).
