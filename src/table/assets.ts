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
import {
  MIDWAY_SONG,
  MOONDIAL_SONG,
  NIGHTMAIL_SONG,
  NIGHTWAVES_SONG,
  TIDEBREAKER_SONG,
} from "../audio/songs";

import moondialPlayfield from "../../design/tables/moondial/playfield.svg?raw";
import moondialBackglass from "../../design/tables/moondial/backglass.svg?raw";
import tidebreakerPlayfield from "../../design/tables/tidebreaker/playfield.svg?raw";
import tidebreakerBackglass from "../../design/tables/tidebreaker/backglass.svg?raw";
import midwayPlayfield from "../../design/tables/midway/playfield.svg?raw";
import midwayBackglass from "../../design/tables/midway/backglass.svg?raw";
import nightmailPlayfield from "../../design/tables/nightmail/playfield.svg?raw";
import nightmailBackglass from "../../design/tables/nightmail/backglass.svg?raw";
import nightwavesPlayfield from "../../design/tables/nightwaves/playfield.svg?raw";
import nightwavesBackglass from "../../design/tables/nightwaves/backglass.svg?raw";

import orbitScene from "../../design/dmd-scenes/orbit.svg?raw";
import multiplierScene from "../../design/dmd-scenes/multiplier.svg?raw";
import eclipseScene from "../../design/dmd-scenes/eclipse.svg?raw";
import bankScene from "../../design/dmd-scenes/bank.svg?raw";
import telescopeScene from "../../design/dmd-scenes/telescope.svg?raw";
import sonarScene from "../../design/dmd-scenes/sonar.svg?raw";
import winchScene from "../../design/dmd-scenes/winch.svg?raw";
import divebellScene from "../../design/dmd-scenes/divebell.svg?raw";
import currentScene from "../../design/dmd-scenes/current.svg?raw";
import airlockScene from "../../design/dmd-scenes/airlock.svg?raw";
import hatchScene from "../../design/dmd-scenes/hatch.svg?raw";
import gutterScene from "../../design/dmd-scenes/gutter.svg?raw";
import trenchScene from "../../design/dmd-scenes/trench.svg?raw";
import leviathanScene from "../../design/dmd-scenes/leviathan.svg?raw";
import coasterScene from "../../design/dmd-scenes/coaster.svg?raw";
import strikerScene from "../../design/dmd-scenes/striker.svg?raw";
import ghosttrainScene from "../../design/dmd-scenes/ghosttrain.svg?raw";
import wheelScene from "../../design/dmd-scenes/wheel.svg?raw";
import boothScene from "../../design/dmd-scenes/booth.svg?raw";
import skyrideScene from "../../design/dmd-scenes/skyride.svg?raw";
import towerScene from "../../design/dmd-scenes/tower.svg?raw";
import stampScene from "../../design/dmd-scenes/stamp.svg?raw";
import chickenScene from "../../design/dmd-scenes/chicken.svg?raw";
import fireworksScene from "../../design/dmd-scenes/fireworks.svg?raw";
import boardScene from "../../design/dmd-scenes/board.svg?raw";
import exchangeScene from "../../design/dmd-scenes/exchange.svg?raw";
import couplingScene from "../../design/dmd-scenes/coupling.svg?raw";
import tunnelScene from "../../design/dmd-scenes/tunnel.svg?raw";
import connectionScene from "../../design/dmd-scenes/connection.svg?raw";
import sortingScene from "../../design/dmd-scenes/sorting.svg?raw";
import dialScene from "../../design/dmd-scenes/dial.svg?raw";
import mastScene from "../../design/dmd-scenes/mast.svg?raw";
import callerScene from "../../design/dmd-scenes/caller.svg?raw";
import onairScene from "../../design/dmd-scenes/onair.svg?raw";
import staticScene from "../../design/dmd-scenes/static.svg?raw";
import dawnScene from "../../design/dmd-scenes/dawn.svg?raw";

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
      divebell: { svg: divebellScene, frames: 8 },
      current: { svg: currentScene, frames: 8 },
      airlock: { svg: airlockScene, frames: 8 },
      hatch: { svg: hatchScene, frames: 8 },
      gutter: { svg: gutterScene, frames: 8 },
      trench: { svg: trenchScene, frames: 8 },
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
      booth: { svg: boothScene, frames: 8 },
      skyride: { svg: skyrideScene, frames: 8 },
      tower: { svg: towerScene, frames: 8 },
      stamp: { svg: stampScene, frames: 8 },
      chicken: { svg: chickenScene, frames: 8 },
      fireworks: { svg: fireworksScene, frames: 8 },
    },
    song: MIDWAY_SONG,
  },
  nightmail: {
    playfieldSvg: nightmailPlayfield,
    backglassSvg: nightmailBackglass,
    // gantry/incline/loop keys fall back to text scenes until authored
    dmdScenes: {
      board: { svg: boardScene, frames: 8 },
      exchange: { svg: exchangeScene, frames: 8 },
      coupling: { svg: couplingScene, frames: 8 },
      tunnel: { svg: tunnelScene, frames: 8 },
      connection: { svg: connectionScene, frames: 8 },
      sorting: { svg: sortingScene, frames: 8 },
    },
    song: NIGHTMAIL_SONG,
  },
  nightwaves: {
    playfieldSvg: nightwavesPlayfield,
    backglassSvg: nightwavesBackglass,
    dmdScenes: {
      dial: { svg: dialScene, frames: 8 },
      mast: { svg: mastScene, frames: 8 },
      caller: { svg: callerScene, frames: 8 },
      onair: { svg: onairScene, frames: 8 },
      static: { svg: staticScene, frames: 6 },
      dawn: { svg: dawnScene, frames: 9 },
    },
    song: NIGHTWAVES_SONG,
  },
};
