// Клеточная сетка стен из прямоугольников воды и выбор тайлов по соседям. Без Phaser — используется тестами и навигацией.
import type { Rect } from '../config/map.ts';

export const TILE = 16;
const COLS = 30; // tiles.png 480/16
const idx = (col: number, row: number) => row * COLS + col;

// Индексы по альфа-карте tiles.png (разметка листа — в HANDOFF)
export const TILES = {
  solid: idx(1, 1),
  fill: [idx(2, 2), idx(3, 2), idx(4, 2), idx(2, 3), idx(3, 3), idx(4, 3), idx(4, 16), idx(5, 16), idx(4, 17), idx(5, 17), idx(10, 16), idx(11, 16), idx(10, 17), idx(11, 17)],
  floor: [idx(1, 7), idx(2, 7), idx(3, 7), idx(4, 7), idx(5, 7), idx(6, 7), idx(7, 7), idx(8, 7), idx(9, 7), idx(10, 7), idx(11, 7), idx(13, 7), idx(14, 7), idx(15, 7), idx(16, 7), idx(17, 7), idx(20, 7), idx(21, 7), idx(22, 7), idx(23, 7), idx(24, 7)],
  ceiling: [idx(1, 4), idx(2, 4), idx(3, 4), idx(4, 4), idx(5, 4), idx(7, 4), idx(8, 4), idx(9, 4), idx(10, 4), idx(11, 4)],
  westFace: [idx(13, 1), idx(13, 2), idx(13, 3), idx(13, 4), idx(13, 5), idx(20, 1), idx(20, 2), idx(20, 3), idx(20, 4), idx(20, 5)],
  eastFace: [idx(19, 1), idx(19, 2), idx(19, 3), idx(19, 4), idx(19, 5), idx(28, 1), idx(28, 2), idx(28, 3), idx(28, 4), idx(28, 5)],
  cornerNW: idx(18, 14),
  cornerNE: idx(24, 14),
  cornerSW: idx(18, 20),
  cornerSE: idx(24, 20),
};

export interface WallGrid {
  cols: number;
  rows: number;
  wall: Uint8Array;
}

export function buildWallGrid(water: Rect[], width: number, height: number): WallGrid {
  const cols = Math.ceil(width / TILE);
  const rows = Math.ceil(height / TILE);
  const wall = new Uint8Array(cols * rows).fill(1);
  for (const r of water) {
    const c0 = Math.floor(r.x / TILE), c1 = Math.ceil((r.x + r.w) / TILE);
    const r0 = Math.floor(r.y / TILE), r1 = Math.ceil((r.y + r.h) / TILE);
    for (let cy = r0; cy < r1; cy++) for (let cx = c0; cx < c1; cx++) {
      if (cx >= 0 && cy >= 0 && cx < cols && cy < rows) wall[cy * cols + cx] = 0;
    }
  }
  return { cols, rows, wall };
}

export function isWallAt(g: WallGrid, x: number, y: number): boolean {
  const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
  if (cx < 0 || cy < 0 || cx >= g.cols || cy >= g.rows) return true;
  return g.wall[cy * g.cols + cx] === 1;
}

function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) >>> 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}

export function pickTile(g: WallGrid, cx: number, cy: number): number {
  const { cols, rows, wall } = g;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= cols || y >= rows ? 1 : wall[y * cols + x]);
  if (at(cx, cy) === 0) return -1;
  const n = at(cx, cy - 1) === 0, s = at(cx, cy + 1) === 0, w = at(cx - 1, cy) === 0, e = at(cx + 1, cy) === 0;
  const h = hash(cx, cy);
  const pick = (arr: number[]) => arr[h % arr.length];
  if (n && w) return TILES.cornerNW;
  if (n && e) return TILES.cornerNE;
  if (s && w) return TILES.cornerSW;
  if (s && e) return TILES.cornerSE;
  if (n) return pick(TILES.floor);
  if (s) return pick(TILES.ceiling);
  if (w) return pick(TILES.westFace);
  if (e) return pick(TILES.eastFace);
  let near = false;
  for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) {
    if (at(cx + dx, cy + dy) === 0) { near = true; break; }
  }
  return near ? pick(TILES.fill) : TILES.solid;
}
