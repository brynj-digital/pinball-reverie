import { defineConfig } from "vite";

// GitHub Pages serves a project site from a subpath
// (https://brynj-digital.github.io/pinball-reverie/), so assets must be
// referenced relative to that base. Local dev/preview stays at "/".
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/pinball-reverie/" : "/",
}));
