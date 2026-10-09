// Пояс припасов: base (куплены на базе, в сохранении) и пачки found (найдены в погружении, с id и точным остатком).
import { SUPPLIES, type SupplyKind } from '../config/balance.ts';
import { emptyCount, type Pack, type SupplyCount } from './save.ts';

export type { Pack, SupplyCount };
export { emptyCount };

export interface Belt {
  /** Ссылка на save.supplies — постоянный запас. */
  base: SupplyCount;
  /** Найденные пачки текущего погружения; остаются в списке до конца захода (пустые — чтобы пометить как израсходованные). */
  packs: Pack[];
}

export const SUPPLY_KINDS: SupplyKind[] = ['o2', 'harpoons'];

export function foundCount(belt: Belt, kind: SupplyKind): number {
  return belt.packs.reduce((s, p) => (p.kind === kind ? s + p.n : s), 0);
}

export function total(belt: Belt, kind: SupplyKind): number {
  return belt.base[kind] + foundCount(belt, kind);
}

export function canPickup(belt: Belt, kind: SupplyKind, amount: number): boolean {
  return total(belt, kind) + amount <= SUPPLIES[kind].cap;
}

/** Подбор найденной пачки → на пояс. false, если пояс полон. */
export function pickupPack(belt: Belt, pack: Pack): boolean {
  if (!canPickup(belt, pack.kind, pack.n)) return false;
  belt.packs.push({ ...pack });
  return true;
}

/**
 * Использование единицы: сначала самая старая найденная пачка с остатком, затем base.
 * При списании base вызывается onBaseChanged — вызывающий сохраняет немедленно.
 */
export function use(belt: Belt, kind: SupplyKind, onBaseChanged: () => void): 'found' | 'base' | null {
  const pack = belt.packs.find((p) => p.kind === kind && p.n > 0);
  if (pack) {
    pack.n -= 1;
    return 'found';
  }
  if (belt.base[kind] > 0) {
    belt.base[kind] -= 1;
    onBaseChanged();
    return 'base';
  }
  return null;
}

/**
 * Завершение погружения. success: остатки пачек → в base, все пачки израсходованы (consumed).
 * fail: пачки с остатком возвращаются в мир (returned, точный n), пустые — consumed. Пояс пачек очищается.
 */
export function endDive(belt: Belt, success: boolean): { merged: SupplyCount; returned: Pack[]; consumed: string[] } {
  const merged = emptyCount();
  const returned: Pack[] = [];
  const consumed: string[] = [];
  for (const p of belt.packs) {
    if (success) {
      merged[p.kind] += p.n;
      belt.base[p.kind] += p.n;
      consumed.push(p.id);
    } else if (p.n > 0) returned.push({ ...p });
    else consumed.push(p.id);
  }
  belt.packs = [];
  return { merged, returned, consumed };
}
