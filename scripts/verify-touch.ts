/**
 * Headless browser smoke test for the touch overlay + portrait layout (the one
 * part simcheck/soak can't reach — it needs a DOM, pointer events and a real
 * viewport). Boots the Vite dev server in-process, drives it with Playwright
 * Chromium, and asserts:
 *   - Auto enablement: overlay hidden on a non-touch context, shown on a touch
 *     context (game reads navigator.maxTouchPoints / pointer:coarse).
 *   - The four zones exist with sane geometry (flippers lower halves, plunger
 *     bottom-right, nudge upper area).
 *   - Touch actually reaches Input: a plunger-zone tap in attract opens the
 *     table browser, and holding a flipper zone lights its `active` class.
 *   - Portrait reflow renders and no console/page errors fire in either layout.
 * Screenshots land in the OS temp dir; their paths print at the end.
 *
 * Run with `npm run verify:touch`. Needs Playwright's Chromium
 * (`npx playwright install chromium`) — the system libs work on WSL2/most
 * Linux without `install-deps`.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type BrowserContext } from "playwright";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
}

const shots = mkdtempSync(join(tmpdir(), "pinball-touch-"));

// tsx compiles this file with esbuild's keepNames, which injects `__name(...)`
// calls into the arrow bodies we hand to page.evaluate — but that helper isn't
// defined in the browser. Shim it as an identity global before any page runs.
async function withShim(ctx: BrowserContext): Promise<BrowserContext> {
  await ctx.addInitScript(() => {
    // @ts-expect-error — runtime shim, not typed on window
    globalThis.__name ||= (fn: unknown) => fn;
  });
  return ctx;
}

let server: ViteDevServer | undefined;
let browser: Browser | undefined;
try {
  server = await createServer({ server: { port: 0 }, logLevel: "warn" });
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error("vite did not report a local URL");
  browser = await chromium.launch();

  // ── non-touch: Auto must keep the overlay OFF ──────────────────────────────
  {
    const ctx = await withShim(await browser.newContext({ viewport: { width: 1280, height: 720 }, hasTouch: false }));
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    const shown = await page.evaluate(() => {
      const o = document.querySelector<HTMLElement>(".touch-overlay");
      return !!o && getComputedStyle(o).display !== "none";
    });
    check("non-touch device hides the overlay (Auto off)", !shown);
    await ctx.close();
  }

  // ── touch portrait: overlay on, zones sane, no errors ──────────────────────
  {
    const errs: string[] = [];
    const ctx = await withShim(await browser.newContext({
      viewport: { width: 430, height: 920 },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
    }));
    const page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    const info = await page.evaluate(() => {
      const o = document.querySelector<HTMLElement>(".touch-overlay");
      const rect = (sel: string) => {
        const el = document.querySelector(sel);
        return el ? el.getBoundingClientRect() : null;
      };
      return {
        shown: !!o && getComputedStyle(o).display !== "none",
        mtp: navigator.maxTouchPoints,
        left: rect(".touch-flipper-left"),
        right: rect(".touch-flipper-right"),
        plunger: rect(".touch-plunger"),
        nudge: rect(".touch-nudge"),
        vh: window.innerHeight,
        vw: window.innerWidth,
      };
    });
    check("touch device shows the overlay (Auto on)", info.shown, `maxTouchPoints=${info.mtp}`);
    check("all four zones present", !!(info.left && info.right && info.plunger && info.nudge));
    if (info.left && info.right && info.plunger && info.nudge) {
      const midY = info.vh / 2;
      check("flipper zones sit in the lower half", info.left.top >= midY && info.right.top >= midY);
      check("left flipper is left, right is right", info.left.left < info.right.left);
      check(
        "plunger zone is bottom-right",
        info.plunger.right >= info.vw - 2 && info.plunger.bottom >= info.vh - 2,
      );
      // nudge covers the open area from the top down to where the flippers begin
      check(
        "nudge zone covers the upper area, meeting the flippers",
        info.nudge.top < 2 && info.nudge.bottom > midY && Math.abs(info.nudge.bottom - info.left.top) <= 2,
      );
    }

    // holding a flipper zone lights it (pointerdown handler ran → Input driven)
    const active = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>(".touch-flipper-left")!;
      const r = el.getBoundingClientRect();
      const opts = { pointerId: 1, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, bubbles: true };
      el.dispatchEvent(new PointerEvent("pointerdown", opts));
      const lit = el.classList.contains("active");
      el.dispatchEvent(new PointerEvent("pointerup", opts));
      return lit;
    });
    check("holding a flipper zone lights it", active);

    // a plunger tap in attract opens the table browser → the boolean reached Game
    const p = info.plunger!;
    await page.touchscreen.tap(p.x + p.width / 2, p.y + p.height / 2);
    await page.waitForTimeout(700);
    const browserOpen = await page.evaluate(() => {
      const o = document.querySelector<HTMLElement>(".tablesel-overlay");
      return !!o && getComputedStyle(o).display !== "none";
    });
    check("plunger tap in attract reaches Input (opens table browser)", browserOpen);

    await page.screenshot({ path: join(shots, "portrait.png") });
    check("no console/page errors in portrait", errs.length === 0, errs.slice(0, 3).join(" | "));
    await ctx.close();
  }

  // ── touch landscape: overlay on, layout unchanged, no errors ───────────────
  {
    const errs: string[] = [];
    const ctx = await withShim(await browser.newContext({ viewport: { width: 1280, height: 720 }, hasTouch: true }));
    const page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const shown = await page.evaluate(() => {
      const o = document.querySelector<HTMLElement>(".touch-overlay");
      return !!o && getComputedStyle(o).display !== "none";
    });
    check("overlay present in landscape", shown);
    await page.screenshot({ path: join(shots, "landscape.png") });
    check("no console/page errors in landscape", errs.length === 0, errs.slice(0, 3).join(" | "));
    await ctx.close();
  }
} catch (e) {
  check("verify-touch ran without throwing", false, String(e).split("\n")[0]);
} finally {
  await browser?.close();
  await server?.close();
}

console.log(`\nscreenshots: ${shots}`);
console.log(failures === 0 ? "verify:touch: all checks passed" : `verify:touch: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
