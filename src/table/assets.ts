/**
 * Per-table browser assets (Vite ?raw imports — this module must stay out of
 * the Node scripts; specs.ts is the Node-safe half of the registry).
 *
 * The playfield SVG is both physics source (→ SvgCollision) and art (the
 * renderer rasterizes the same text at display scale): one file, both jobs.
 * DMD scenes are Claude Design sprite-strip masters baked to dot frames at
 * load by dmd/bake.ts (plan §5c) — never live SVG on the grid.
 */
import type { TableId } from "./specs";
import type { Song } from "../audio/songs";
import { MIDWAY_SONG, MOONDIAL_SONG, TIDEBREAKER_SONG } from "../audio/songs";

import moondialPlayfield from "../../design/tables/moondial/playfield.svg?raw";
import moondialBackglass from "../../design/tables/moondial/backglass.svg?raw";
import tidebreakerPlayfield from "../../design/tables/tidebreaker/playfield.svg?raw";
import tidebreakerBackglass from "../../design/tables/tidebreaker/backglass.svg?raw";
import midwayPlayfield from "../../design/tables/midway/playfield.svg?raw";
import midwayBackglass from "../../design/tables/midway/backglass.svg?raw";

import orbitScene from "../../design/dmd-scenes/orbit.svg?raw";
import multiplierScene from "../../design/dmd-scenes/multiplier.svg?raw";
import eclipseScene from "../../design/dmd-scenes/eclipse.svg?raw";
import bankScene from "../../design/dmd-scenes/bank.svg?raw";
import telescopeScene from "../../design/dmd-scenes/telescope.svg?raw";
import sonarScene from "../../design/dmd-scenes/sonar.svg?raw";
import winchScene from "../../design/dmd-scenes/winch.svg?raw";
import leviathanScene from "../../design/dmd-scenes/leviathan.svg?raw";
import coasterScene from "../../design/dmd-scenes/coaster.svg?raw";
import strikerScene from "../../design/dmd-scenes/striker.svg?raw";
import ghosttrainScene from "../../design/dmd-scenes/ghosttrain.svg?raw";
import wheelScene from "../../design/dmd-scenes/wheel.svg?raw";
import fireworksScene from "../../design/dmd-scenes/fireworks.svg?raw";

export interface TableAssets {
  playfieldSvg: string;
  backglassSvg: string;
  /** Table-specific DMD scenes: key → sprite-strip master + frame count. */
  dmdScenes: Record<string, { svg: string; frames: number }>;
  song: Song;
}

export const TABLE_ASSETS: Record<TableId, TableAssets> = {
  moondial: {
    playfieldSvg: moondialPlayfield,
    backglassSvg: moondialBackglass,
    dmdScenes: {
      orbit: { svg: orbitScene, frames: 8 },
      moon: { svg: multiplierScene, frames: 6 },
      eclipse: { svg: eclipseScene, frames: 9 },
      bank: { svg: bankScene, frames: 7 },
      telescope: { svg: telescopeScene, frames: 8 },
    },
    song: MOONDIAL_SONG,
  },
  tidebreaker: {
    playfieldSvg: tidebreakerPlayfield,
    backglassSvg: tidebreakerBackglass,
    dmdScenes: {
      sonar: { svg: sonarScene, frames: 6 },
      winch: { svg: winchScene, frames: 8 },
      leviathan: { svg: leviathanScene, frames: 9 },
    },
    song: TIDEBREAKER_SONG,
  },
  midway: {
    playfieldSvg: midwayPlayfield,
    backglassSvg: midwayBackglass,
    dmdScenes: {
      coaster: { svg: coasterScene, frames: 8 },
      striker: { svg: strikerScene, frames: 8 },
      ghost: { svg: ghosttrainScene, frames: 7 },
      wheel: { svg: wheelScene, frames: 8 },
      fireworks: { svg: fireworksScene, frames: 8 },
    },
    song: MIDWAY_SONG,
  },
};
