import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages serves a project site from a subpath
// (https://brynj-digital.github.io/pinball-reverie/), so assets must be
// referenced relative to that base. Dev stays at "/", but preview must match
// the build base — it serves dist/ as-is, with the base already baked into
// the HTML's asset URLs.
export default defineConfig(({ command, isPreview }) => ({
  base: command === "build" || isPreview ? "/pinball-reverie/" : "/",
  plugins: [
    // Installable PWA: manifest + Workbox service worker, both scoped under
    // the Pages base. `display: fullscreen` is the point — launched from the
    // home screen there is no browser chrome (iOS downgrades to standalone).
    // Everything is a static asset, so precaching the whole build makes the
    // game fully playable offline, including the lazy three.js chunk.
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/apple-touch-icon.png"],
      manifest: {
        name: "Pinball Reverie",
        short_name: "Pinball",
        description:
          "Retro pinball in the spirit of the classics — four tables, real physics, DMD and chiptunes.",
        display: "fullscreen",
        background_color: "#0c0d14",
        theme_color: "#0c0d14",
        icons: [
          { src: "icons/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/pwa-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icons/pwa-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,webmanifest}"],
      },
    }),
  ],
}));
