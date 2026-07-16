/*
 * Rasterize the app-icon master (design/app-icon.svg) to the PNG set the PWA
 * manifest and iOS home screen need, into public/icons/. Run via
 * `npm run icons` after any edit to the master; outputs are checked in.
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const outDir = resolve(root, "public/icons");
const svg = readFileSync(resolve(root, "design/app-icon.svg"), "utf8");

// One master serves every slot: full-bleed background, content inside the
// maskable safe circle. The 512 doubles as "any" and "maskable" purposes.
const targets = [
  { name: "pwa-192.png", size: 192 },
  { name: "pwa-512.png", size: 512 },
  { name: "apple-touch-icon.png", size: 180 },
];

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
for (const { name, size } of targets) {
  const page = await browser.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    `<style>*{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  writeFileSync(resolve(outDir, name), await page.screenshot());
  await page.close();
  console.log(`icons: wrote ${name} (${size}×${size})`);
}
await browser.close();
