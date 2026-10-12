// Навигация к базе: проходимость с запасом на габарит дайвера и закрытые сети, BFS от причала, направление без срезания углов.
import type { Rect } from '../config/map.ts';
import { TILE, type WallGrid } from './grid.ts';

export interface NavGrid {
  cols: number;
  rows: number;
  passable: Uint8Array;
  dist: Int32Array;
}

/** Клетка проходима, если она и 8 соседей — вода, и она не перекрыта закрытой сетью (с запасом в клетку). */
export function buildPassable(g: WallGrid, blocked: readonly Rect[]): Uint8Array {
  const { cols, rows, wall } = g;
  const pass = new Uint8Array(cols * rows);
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
    let ok = true;
    for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= cols || y >= rows || wall[y * cols + x] === 1) { ok = false; break; }
    }
    pass[cy * cols + cx] = ok ? 1 : 0;
  }
  for (const b of blocked) {
    const c0 = Math.floor(b.x / TILE) - 1, c1 = Math.ceil((b.x + b.w) / TILE) + 1;
    const r0 = Math.floor(b.y / TILE) - 1, r1 = Math.ceil((b.y + b.h) / TILE) + 1;
    for (let cy = r0; cy < r1; cy++) for (let cx = c0; cx < c1; cx++) {
      if (cx >= 0 && cy >= 0 && cx < cols && cy < rows) pass[cy * cols + cx] = 0;
    }
  }
  return pass;
}

export function buildNav(g: WallGrid, docks: Rect | readonly Rect[], blocked: readonly Rect[]): NavGrid {
  const { cols, rows } = g;
  const passable = buildPassable(g, blocked);
  const dist = new Int32Array(cols * rows).fill(-1);
  const queue: number[] = [];
  for (const dock of Array.isArray(docks) ? docks : [docks as Rect]) {
    const c0 = Math.floor(dock.x / TILE), c1 = Math.ceil((dock.x + dock.w) / TILE);
    const r0 = Math.floor(dock.y / TILE), r1 = Math.ceil((dock.y + dock.h) / TILE);
    for (let cy = r0; cy < r1; cy++) for (let cx = c0; cx < c1; cx++) {
      const i = cy * cols + cx;
      if (cx >= 0 && cy >= 0 && cx < cols && cy < rows && passable[i] && dist[i] !== 0) { dist[i] = 0; queue.push(i); }
    }
  }
  let head = 0;
  while (head < queue.length) {
    const i = queue[head++];
    const cx = i % cols, cy = (i - cx) / cols;
    const d = dist[i] + 1;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
      const j = y * cols + x;
      if (!passable[j] || dist[j] !== -1) continue;
      // диагональ только если обе ортогональные соседки проходимы (не режем углы)
      if (dx && dy && (!passable[cy * cols + x] || !passable[y * cols + cx])) continue;
      dist[j] = d;
      queue.push(j);
    }
  }
  return { cols, rows, passable, dist };
}

/** Прямая между центрами клеток проходит только по проходимым клеткам. */
export function passableLine(nav: NavGrid, c0: number, r0: number, c1: number, r1: number): boolean {
  const steps = Math.max(Math.abs(c1 - c0), Math.abs(r1 - r0)) * 2;
  if (steps === 0) return true;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const cx = Math.round(c0 + (c1 - c0) * t), cy = Math.round(r0 + (r1 - r0) * t);
    if (!nav.passable[cy * nav.cols + cx]) return false;
  }
  return true;
}

function nearestPassable(nav: NavGrid, cx: number, cy: number): number {
  for (let r = 0; r <= 3; r++) {
    let best = -1, bestD = Infinity;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= nav.cols || y >= nav.rows) continue;
      const i = y * nav.cols + x;
      if (nav.passable[i] && nav.dist[i] >= 0) {
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = i; }
      }
    }
    if (best >= 0) return best;
  }
  return -1;
}

/**
 * Направление к базе из точки мира: спуск по полю расстояний и выбор самой дальней клетки пути,
 * видимой по прямой через проходимые клетки (стрелка ведёт к ближайшему доступному повороту).
 */
export function directionHome(nav: NavGrid, x: number, y: number): { angle: number; tx: number; ty: number; steps: number } | null {
  const start = nearestPassable(nav, Math.floor(x / TILE), Math.floor(y / TILE));
  if (start < 0 || nav.dist[start] <= 0) return null;
  const path: number[] = [start];
  let cur = start;
  for (let k = 0; k < 80; k++) {
    const cx = cur % nav.cols, cy = (cur - cx) / nav.cols;
    let next = -1, bestD = nav.dist[cur];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= nav.cols || ny >= nav.rows) continue;
      const j = ny * nav.cols + nx;
      if (nav.dist[j] >= 0 && nav.dist[j] < bestD) { bestD = nav.dist[j]; next = j; }
    }
    if (next < 0) break;
    path.push(next);
    cur = next;
    if (nav.dist[cur] === 0) break;
  }
  const sc = start % nav.cols, sr = (start - sc) / nav.cols;
  let target = path[Math.min(1, path.length - 1)];
  for (let i = path.length - 1; i >= 1; i--) {
    const c = path[i] % nav.cols, r = (path[i] - c) / nav.cols;
    if (passableLine(nav, sc, sr, c, r)) { target = path[i]; break; }
  }
  const tc = target % nav.cols, tr = (target - tc) / nav.cols;
  const tx = tc * TILE + TILE / 2, ty = tr * TILE + TILE / 2;
  return { angle: Math.atan2(ty - y, tx - x), tx, ty, steps: nav.dist[start] };
}
