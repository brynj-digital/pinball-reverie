import "./style.css";
import { Game } from "./core/Game";
import { TABLE_SPECS, loadTableId } from "./table/specs";
import { TABLE_ASSETS } from "./table/assets";

const app = document.querySelector<HTMLDivElement>("#app")!;
const canvas = document.createElement("canvas");
canvas.id = "playfield";
app.appendChild(canvas);

// The table is chosen at boot (persisted in pinball-table-v1); switching in
// the settings overlay saves the id and reloads — a table swap replaces the
// physics world, art, rules, logic and music wholesale, so a clean boot is
// the honest implementation (the renderer swap stays live, per M9).
const tableId = loadTableId();
new Game(canvas, TABLE_SPECS[tableId], TABLE_ASSETS[tableId]).start();
