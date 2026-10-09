// Состояние конечного лута по стабильным id: применение сохранения, доставка, расход, перемещение, высыпание при провале.
import { ITEMS, type ItemType } from '../config/balance.ts';
import type { LootSpawn } from '../config/map.ts';
import type { LootRecord, Pack } from './save.ts';

export interface WorldItem {
  id: string;
  type: ItemType;
  x: number;
  y: number;
  /** Остаток для пачек припасов; 1 для остальных. */
  n: number;
}

/** Предметы, которые сейчас лежат в мире, с учётом сохранённых отклонений. */
export function worldItems(spawns: readonly LootSpawn[], loot: Record<string, LootRecord>): WorldItem[] {
  const out: WorldItem[] = [];
  for (const s of spawns) {
    const rec = loot[s.id];
    if (rec && (rec.s === 'd' || rec.s === 'c')) continue;
    const def = ITEMS[s.type];
    const baseN = def.kind === 'supply' ? def.amount ?? 1 : 1;
    if (rec && rec.s === 'w') out.push({ id: s.id, type: s.type, x: rec.x, y: rec.y, n: rec.n ?? baseN });
    else out.push({ id: s.id, type: s.type, x: s.x, y: s.y, n: baseN });
  }
  return out;
}

export function markDelivered(loot: Record<string, LootRecord>, id: string): void {
  loot[id] = { s: 'd' };
}

export function markConsumed(loot: Record<string, LootRecord>, id: string): void {
  loot[id] = { s: 'c' };
}

export function markMoved(loot: Record<string, LootRecord>, id: string, x: number, y: number, n?: number): void {
  loot[id] = n === undefined ? { s: 'w', x: Math.round(x), y: Math.round(y) } : { s: 'w', x: Math.round(x), y: Math.round(y), n };
}

/** Свободные точки по спирали вокруг (cx, cy); isFree проверяет воду и отсутствие соседей. */
export function scatterPositions(count: number, cx: number, cy: number, isFree: (x: number, y: number) => boolean, step = 22): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  if (count <= 0) return out;
  if (isFree(cx, cy)) out.push({ x: cx, y: cy });
  for (let ring = 1; ring <= 12 && out.length < count; ring++) {
    const r = ring * step;
    const pts = 6 + ring * 4;
    for (let i = 0; i < pts && out.length < count; i++) {
      const a = (i / pts) * Math.PI * 2 + ring * 0.35;
      const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r);
      if (isFree(x, y) && !out.some((p) => Math.hypot(p.x - x, p.y - y) < step * 0.9)) out.push({ x, y });
    }
  }
  while (out.length < count) out.push({ x: cx, y: cy });
  return out;
}

/**
 * Провал (кислород, аварийный возврат, перезагрузка): груз и пачки с остатком высыпаются у точки провала
 * и записываются как перемещённые; пустые пачки — израсходованы. Возвращает, что выложено в мир.
 */
export function applyFailure(
  loot: Record<string, LootRecord>,
  spawnsById: Map<string, LootSpawn>,
  cargoIds: readonly string[],
  packs: readonly Pack[],
  cx: number,
  cy: number,
  isFree: (x: number, y: number) => boolean,
): WorldItem[] {
  const live = packs.filter((p) => p.n > 0);
  for (const p of packs) if (p.n <= 0) markConsumed(loot, p.id);
  const positions = scatterPositions(cargoIds.length + live.length, cx, cy, isFree);
  const placed: WorldItem[] = [];
  let k = 0;
  for (const id of cargoIds) {
    const sp = spawnsById.get(id);
    if (!sp) continue;
    const p = positions[k++];
    markMoved(loot, id, p.x, p.y);
    placed.push({ id, type: sp.type, x: p.x, y: p.y, n: 1 });
  }
  for (const pack of live) {
    const sp = spawnsById.get(pack.id);
    if (!sp) continue;
    const p = positions[k++];
    markMoved(loot, pack.id, p.x, p.y, pack.n);
    placed.push({ id: pack.id, type: sp.type, x: p.x, y: p.y, n: pack.n });
  }
  return placed;
}

export function checkUniqueIds(spawns: readonly LootSpawn[]): string[] {
  const seen = new Set<string>();
  const dup: string[] = [];
  for (const s of spawns) {
    if (seen.has(s.id)) dup.push(s.id);
    seen.add(s.id);
  }
  return dup;
}
