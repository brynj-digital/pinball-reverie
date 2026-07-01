import "./style.css";
import { Game } from "./core/Game";

const app = document.querySelector<HTMLDivElement>("#app")!;
const canvas = document.createElement("canvas");
canvas.id = "playfield";
app.appendChild(canvas);

new Game(canvas).start();
