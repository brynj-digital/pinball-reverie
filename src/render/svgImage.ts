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

/**
 * Split a playfield SVG at its `art-rails-elevated` group (M10): the group
 * (plus the <defs> its <use> hrefs need) becomes a standalone transparent
 * overlay document, and the base document has it removed — the renderer
 * composites the overlay over/under the ball by layer. Tables without
 * elevated walls return undefined. String surgery, like the collision
 * parser — no DOMParser, same text in every renderer.
 */
export function splitElevatedOverlay(svgText: string): { base: string; overlay: string } | undefined {
  const start = svgText.indexOf('<g id="art-rails-elevated"');
  if (start < 0) return undefined;
  const re = /<\/?g\b/g;
  re.lastIndex = start;
  let depth = 0;
  let end = -1;
  for (let m = re.exec(svgText); m; m = re.exec(svgText)) {
    if (m[0] === "<g") depth++;
    else if (--depth === 0) {
      end = svgText.indexOf(">", m.index) + 1;
      break;
    }
  }
  if (end <= 0) return undefined;
  const group = svgText.slice(start, end);
  const defs = (svgText.match(/<defs>[\s\S]*?<\/defs>/g) ?? []).join("");
  const open = svgText.match(/<svg\b[^>]*>/)?.[0] ?? '<svg xmlns="http://www.w3.org/2000/svg">';
  return {
    base: svgText.slice(0, start) + svgText.slice(end),
    overlay: `${open}${defs}${group}</svg>`,
  };
}
