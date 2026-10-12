// Маршруты уровня: расстояния по клеткам воды (BFS без срезания углов), скорость с грузом, оценка возврата и предупреждения.
import { speedMultiplier } from '../core/movement.ts';
import { TILE } from '../core/grid.ts';
import { LEVEL_WARN, upgradeValue, type LevelUpgradeId } from './config.ts';

export interface PassGrid {
  cols: number;
  rows: number;
  passable: Uint8Array;
}

function nearestPassable(g: PassGrid, x: number, y: number): number {
  const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
  for (let r = 0; r <= 3; r++) {
    let best = -1, bestD = Infinity;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= g.cols || ny >= g.rows) continue;
      const i = ny * g.cols + nx;
      if (g.passable[i] && dx * dx + dy * dy < bestD) { bestD = dx * dx + dy * dy; best = i; }
    }
    if (best >= 0) return best;
  }
  return -1;
}

/** Шаги BFS от точки до всех клеток (−1 — недостижимо). */
export function bfsFrom(g: PassGrid, x: number, y: number): Int32Array {
  const dist = new Int32Array(g.cols * g.rows).fill(-1);
  const start = nearestPassable(g, x, y);
  if (start < 0) return dist;
  const q = [start];
  dist[start] = 0;
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    const cx = i % g.cols, cy = (i - cx) / g.cols;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= g.cols || ny >= g.rows) continue;
      const j = ny * g.cols + nx;
      if (!g.passable[j] || dist[j] !== -1) continue;
      if (dx && dy && (!g.passable[cy * g.cols + nx] || !g.passable[ny * g.cols + cx])) continue;
      dist[j] = dist[i] + 1;
      q.push(j);
    }
  }
  return dist;
}

/** Шаги от точки до цели по уже посчитанному полю (ближайшая проходимая клетка цели). */
export function stepsTo(g: PassGrid, field: Int32Array, x: number, y: number): number {
  const i = nearestPassable(g, x, y);
  return i < 0 ? -1 : field[i];
}

export function pathPx(steps: number): number {
  return steps * TILE * LEVEL_WARN.pathFactor;
}

/** Скорость дайвера уровня с грузом weight при текущих Ластах и Буксире. */
export function levelSpeed(upgrades: Record<LevelUpgradeId, number>, weight: number): number {
  return upgradeValue('fins', upgrades.fins) * speedMultiplier(weight, upgradeValue('tow', upgrades.tow));
}

export type O2Warn = 'ok' | 'soft' | 'hard' | 'out';

/** Предупреждение с учётом возврата: оценка времени до ближайшей базы с текущим грузом. */
export function oxygenWarning(o2: number, maxO2: number, returnSec: number): O2Warn {
  if (o2 <= 0) return 'out';
  if (o2 <= Math.max(LEVEL_WARN.hardFloor * maxO2, returnSec * LEVEL_WARN.hardMul + LEVEL_WARN.hardAdd)) return 'hard';
  if (o2 <= Math.max(LEVEL_WARN.softFloor * maxO2, returnSec * LEVEL_WARN.softMul + LEVEL_WARN.softAdd)) return 'soft';
  return 'ok';
}
