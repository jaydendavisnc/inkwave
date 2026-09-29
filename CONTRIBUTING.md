# Contributing to INKWAVE

Thanks for your interest! INKWAVE is a plain ES-module three.js project with no build step, so getting started takes a minute.

## Running locally

```bash
git clone https://github.com/jaydendavisnc/inkwave.git
cd inkwave
npm install          # only needed for the headless tools (puppeteer-core)
npm start            # serves http://localhost:8490 (and your LAN address)
```

Open the URL in Chrome, Edge or Firefox. Everything reloads on refresh; there is no bundler.

## Before opening a pull request

```bash
npm run check        # node --check on every module
npm run smoke        # boots the game headlessly and plays 8 s on autopilot (needs Google Chrome installed)
```

Keep pull requests focused. If you change gameplay tuning, say what you measured and how (see `tools/measure-handling.mjs` and `tools/film.py` for the deterministic capture helpers).

## Project map

| Path | What lives there |
|---|---|
| `src/core` | renderer + post chain, input, event bus |
| `src/game` | actors, weapons, bots, camera rig, character rig + animation, match flow |
| `src/world` | stage layouts, level geometry, ink painting, textures, environment, props |
| `src/fx` | particles, screen effects, event → effect wiring |
| `src/ui` | menus, HUD, map diorama, icons |
| `src/audio` | procedural sound effects and music |
| `docs` | event contract, module contracts, character rig reference |
| `server` | room relay. Same Worker as the site; `wrangler.jsonc` at the repo root |
| `public` | built static site (`npm run build`). The Worker's asset directory; do not edit |
| `tools` | dev server, labs, headless capture and measurement scripts, release |

## Code style

Match the surrounding code: 2-space indent, single quotes, no semicolon-free style, comments that explain *why*. No per-frame allocations in hot paths. New stages must keep both halves identical (the layout is mirrored by a 180° rotation).

## Reporting bugs

Open an issue with your browser + GPU, the stage, and steps to reproduce. A screenshot or short clip helps a lot.
