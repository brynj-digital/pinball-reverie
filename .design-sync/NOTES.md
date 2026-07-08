# design-sync notes

## This is an asset-master design system, not a component library

`design/` holds the editable masters for the game's design system: SVG art
(`ball.svg`, `dmd-scenes/*.svg`, `tables/*/{playfield,backglass}.svg`), rules
JSON, `tokens.css`, `STYLE-GUIDE.md`, and HTML specimens in `previews/`. There
is **no** `package.json`, Storybook, or build under `design/`.

**Do not run the generic /design-sync converter pipeline here** (no
`npm install`, no `dist` bundle, no `_ds_bundle.js` generation, no storybook
detection, no component grading). Those stages assume a React component library
and do not apply.

## The actual sync flow

The Claude Design project mirrors `design/` one-to-one (remote path
`dmd-scenes/orbit.svg` ⇄ local `design/dmd-scenes/orbit.svg`). To sync:

1. `DesignSync(finalize_plan)` with `localDir: design`, `writes` covering the
   changed/added masters (globs like `dmd-scenes/**`, `tables/**`,
   `previews/**`, plus top-level `*.svg`/`*.md`/`*.css`), `deletes: []` unless a
   master was actually removed from the repo.
2. Fence the app's manifest with `_ds_needs_recompile`, `write_files` the
   masters (`localPath` mirrors `path`), then re-write `_ds_needs_recompile`.

Preserve the project's app-generated files — `_ds_bundle.js`,
`_ds_manifest.json`, `_adherence.oxlintrc.json` — they are not part of `design/`;
never delete them. No `_ds_sync.json` anchor is written for this asset DS.

## Auth

DesignSync uses Bryn's claude.ai login. In a non-interactive session it returns
an authorization error and cannot run; re-run `/design-sync` (or `/design-login`)
in an interactive terminal.

## 2026-07-08 full-sync backlog cleared

The project had drifted well behind the repo. A full sync pushed all of
`design/`: 11 new DMD scoop/combo/kickback scenes authored this session, 6
pre-existing scenes that had never been synced (coaster, fireworks, ghosttrain,
striker, telescope, wheel), the entire Midnight Midway table
(`tables/midway/`), and refreshed drifted masters (tokens, style guide,
playfields, previews).
