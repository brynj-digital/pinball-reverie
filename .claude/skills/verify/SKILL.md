---
name: verify
description: Build, serve and drive Pinball Reverie in a headless browser to verify UI/gameplay changes at the real surface (including touch emulation).
---

# Verifying Pinball Reverie changes in a real browser

## Build + serve — mind the base path

`npm run build` outputs `dist/` with asset URLs baked under
`/pinball-reverie/` (GitHub Pages base). `npx vite preview` serves it at
`http://localhost:4173/pinball-reverie/` — vite.config applies the base for
`command === "build" || isPreview`, so preview matches the build. Don't
"simplify" that condition to build-only: preview would fall back to base `/`
and the page loads blank (the module fetch 404s while curl looks fine,
because the SPA fallback answers non-`Sec-Fetch-Dest: script` requests with
index.html and a 200).

(`npm run dev` serves at `/` and works directly, but verifies unbundled code.)

## Driving it headless

Playwright is in `node_modules` (chromium installed). Scripts outside the
repo must import by absolute path:

```js
import { chromium } from "/home/bryn/projects/pinball-reverie/node_modules/playwright/index.mjs";
```

- Touch device: `browser.newContext({ viewport: {width:420,height:800}, hasTouch:true, isMobile:true })` —
  `touchAvailable()` (maxTouchPoints) then routes the app down its touch paths.
- Real touch gestures (swipes with proper pointer events + synthesized
  clicks): use CDP, not `page.mouse`:
  ```js
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {type:"touchStart", touchPoints:[{x,y}]});
  // ...touchMove steps... then type:"touchEnd", touchPoints:[]
  ```
- Wait ~1.5s after goto for the app to boot (SVG rasterization).

## Flows worth driving

- Attract mode is the landing state. Keyboard: `Z`/`Shift` flippers,
  `Enter` start, `Esc` settings. Touch zones: lower-left/right halves =
  flippers, bottom-right corner = plunger.
- Table select: flipper tap (or touch-tap lower-left ~x=80,y=720) in
  attract opens it; probe `.tablesel-overlay` / `.tablesel-card.focused
  .tablesel-name` / `.tablesel-hint` for state.
- Confirming a NON-current table reloads the page (table-swap-by-reload
  contract) — expect navigation.

## Gotchas

- A card/element clipped outside the viewport can't be CDP-tapped at its
  rect centre — clamp tap coords to the visible part.
- After any physics or playfield-SVG change also run `npm run simcheck`
  and `npm run soak` (CLAUDE.md rule) — but they are not a substitute for
  driving the UI.
