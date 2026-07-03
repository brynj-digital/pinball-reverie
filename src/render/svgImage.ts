/**
 * Load SVG text as an image with its intrinsic size forced to w×h px.
 * Shared by both renderers: browsers rasterize SVG images at their intrinsic
 * size, so the master's width/height attrs are rewritten to the target pixel
 * size before loading — that keeps the art vector-crisp at any scale.
 */
export function loadSvgAt(
  svgText: string,
  w: number,
  h: number,
  onload: (img: HTMLImageElement) => void,
  label = "svg",
): void {
  // strip any existing root width/height (any order/spacing), then inject
  // ours — a single adjacency-dependent regex silently no-ops on reordered
  // attributes and the art rasterizes blurry at intrinsic size
  const sized = svgText
    .replace(/(<svg[^>]*?)\s+width="[^"]*"/, "$1")
    .replace(/(<svg[^>]*?)\s+height="[^"]*"/, "$1")
    .replace(/<svg/, `<svg width="${w}" height="${h}"`);
  const url = URL.createObjectURL(new Blob([sized], { type: "image/svg+xml" }));
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    onload(img);
  };
  img.onerror = () => {
    URL.revokeObjectURL(url); // don't leak the blob URL on failure
    console.error(`${label} SVG image failed to load — using fallback rendering`);
  };
  img.src = url;
}
