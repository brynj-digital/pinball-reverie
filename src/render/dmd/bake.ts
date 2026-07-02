import { DMD_COLS, DMD_ROWS } from "./DotMatrix";

/**
 * Bake a DMD scene master (an SVG sprite strip of frameCount 128×32 cells)
 * into 4-level dot frames, once at load (plan §5c: author in SVG, bake to
 * frames — never live SVG/DOM on the grid at 60 fps). Levels quantize by
 * luminance: ≥200 lit, ≥115 mid, ≥45 dim, else off.
 */
export async function bakeDmdFrames(svgText: string, frameCount: number): Promise<Uint8Array[]> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml" }));
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = reject;
    image.src = url;
  });

  const cv = document.createElement("canvas");
  cv.width = DMD_COLS * frameCount;
  cv.height = DMD_ROWS;
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, cv.width, cv.height);

  const frames: Uint8Array[] = [];
  for (let f = 0; f < frameCount; f++) {
    const data = ctx.getImageData(f * DMD_COLS, 0, DMD_COLS, DMD_ROWS).data;
    const levels = new Uint8Array(DMD_COLS * DMD_ROWS);
    for (let i = 0; i < levels.length; i++) {
      const l = 0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2];
      levels[i] = l >= 200 ? 3 : l >= 115 ? 2 : l >= 45 ? 1 : 0;
    }
    frames.push(levels);
  }
  return frames;
}
