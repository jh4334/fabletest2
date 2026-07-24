# Visual asset sources

## Legacy CC0 archive (not used by the v4 map renderer)

- Source: https://pixel-boy.itch.io/ninja-adventure-asset-pack
- Repository: https://github.com/pixel-boy/NinjaAdventure
- License: CC0 1.0 (public domain)
- Files used:
  - `cc0/ninja-adventure/tileset_floor.png`
  - `cc0/ninja-adventure/tileset_village_abandoned.png`

These two files remain in the repository for provenance and comparison, but v4 no longer
loads them at runtime.

## Project-original v5 archive environment

`art/maps/v5-project-zero-archive.png` was generated specifically for the VERSION 5.0
world rebuild. It is an environment-only, top-down 16-bit pixel-art background for the
radial Project Zero recovery archive: central cracked core, cyan data channels, archive
pillars, and six gate approaches. Player characters, UI, and text are drawn by the game
at runtime. The image is stored locally and no external image service is called at
runtime.

## Project-original chapter map art

The seven textures in `art/maps/` were generated specifically for this project from the
approved top-down 16-bit pixel-art direction, then resized and palette-optimized locally.
They do not call an external image service at runtime.

- `prologue-boundary.png`
- `ch1-free-street.png`
- `ch2-tilted-street.png`
- `ch3-rumor-news.png`
- `ch4-sparkle-arcade.png`
- `ch5-cozy-loop.png`
- `finale-memory-core.png`

## Project-original character art

The player, Bandi, and eight boss expression sheets in `art/` were created specifically
for this project from the approved twilight storybook/pixel-game visual direction.
They are stored locally and do not call an external image service at runtime.

- `player-sheet.png`
- `bandi-sheet.png`
- `ttara-expression-sheet.png`
- `dama-expression-sheet.png`
- `giul-expression-sheet.png`
- `geureol-expression-sheet.png`
- `banjjak-expression-sheet.png`
- `lumi-expression-sheet.png`
- `goyo-expression-sheet.png`
- `yeongi-expression-sheet.png`

The eight boss sheets cover Ttara, Dama, Giul, Geureolssa, Banjjak, Lumi, Goyo,
and Yeongi. Each sheet contains closed, shaken, open, and mercy/emotional states.
