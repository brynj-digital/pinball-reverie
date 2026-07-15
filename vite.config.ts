import { defineConfig } from "vite";

// GitHub Pages serves a project site from a subpath
// (https://brynj-digital.github.io/pinball-reverie/), so assets must be
// referenced relative to that base. Dev stays at "/", but preview must match
// the build base — it serves dist/ as-is, with the base already baked into
// the HTML's asset URLs.
export default defineConfig(({ command, isPreview }) => ({
  base: command === "build" || isPreview ? "/pinball-reverie/" : "/",
}));
