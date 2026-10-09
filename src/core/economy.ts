// Экономика: сдача груза по назначению, покупки улучшений и припасов.
import { ITEMS, KNIFE, SUPPLIES, UPGRADES, effects, type ItemType, type LevelCost, type SupplyKind, type UpgradeId } from '../config/balance.ts';
import type { CargoItem } from './cargo.ts';
import type { SaveData } from './save.ts';
import { total as beltTotal, type Belt } from './supplies.ts';

export interface Settlement {
  coins: number;
  parts: number;
  counts: Partial<Record<ItemType, number>>;
  capsule: boolean;
}

/** Обработка доставленного груза: ценности → монеты, материалы → детали, капсула → цель. */
export function settle(items: readonly CargoItem[]): Settlement {
  const s: Settlement = { coins: 0, parts: 0, counts: {}, capsule: false };
  for (const it of items) {
    const def = ITEMS[it.type];
    s.counts[it.type] = (s.counts[it.type] ?? 0) + 1;
    if (def.kind === 'valuable') s.coins += def.price;
    else if (def.kind === 'material') s.parts += 1;
    else if (def.kind === 'goal') s.capsule = true;
    // припасы и снаряжение в связку не попадают
  }
  return s;
}

export function upgradeCost(id: UpgradeId, level: number): LevelCost | null {
  return UPGRADES[id].costs[level] ?? null;
}

export function maxLevel(id: UpgradeId): number {
  return UPGRADES[id].costs.length;
}

export type BuyCheck = { ok: true; cost: LevelCost } | { ok: false; reason: 'max' | 'coins' | 'parts' | 'knife'; cost: LevelCost | null };

export function canBuyUpgrade(save: SaveData, id: UpgradeId): BuyCheck {
  const cost = upgradeCost(id, save.upgrades[id]);
  if (!cost) return { ok: false, reason: 'max', cost: null };
  if (id === 'tools' && !save.knife.owned) return { ok: false, reason: 'knife', cost };
  if (save.coins < cost.coins) return { ok: false, reason: 'coins', cost };
  if (save.parts < cost.parts) return { ok: false, reason: 'parts', cost };
  return { ok: true, cost };
}

/** Покупка уровня: сначала проверка цены и доступности, кошелёк не уходит в минус. */
export function buyUpgrade(save: SaveData, id: UpgradeId): boolean {
  const check = canBuyUpgrade(save, id);
  if (!check.ok) return false;
  save.coins -= check.cost.coins;
  save.parts -= check.cost.parts;
  save.upgrades[id] += 1;
  save.stats.purchases += 1;
  // Резак/улучшенные инструменты повышают максимум прочности — нож сразу получает новый максимум
  if (id === 'tools' && save.knife.owned) save.knife.durability = effects.knifeMax(save.upgrades.tools);
  return true;
}

export function knifeMax(save: SaveData): number {
  return effects.knifeMax(save.upgrades.tools);
}

/** Сколько единиц прочности можно починить: ограничено максимумом и кошельком. */
export function repairableUnits(save: SaveData, wanted: number): number {
  if (!save.knife.owned) return 0;
  const missing = knifeMax(save) - save.knife.durability;
  const affordable = Math.floor(save.coins / KNIFE.repairCost);
  return Math.max(0, Math.min(wanted, missing, affordable));
}

/** Ремонт ножа на базе: KNIFE.repairCost монет за единицу, кошелёк не уходит в минус. Возвращает число починенных единиц. */
export function repairKnife(save: SaveData, wanted: number): number {
  const units = repairableUnits(save, wanted);
  if (units <= 0) return 0;
  save.coins -= units * KNIFE.repairCost;
  save.knife.durability += units;
  return units;
}

export function canBuySupply(save: SaveData, belt: Belt, kind: SupplyKind, n: number): boolean {
  const def = SUPPLIES[kind];
  if (n <= 0) return false;
  if (beltTotal(belt, kind) + n > def.cap) return false;
  return save.coins >= def.price * n;
}

/** Покупка припасов на базе → base. save.supplies и belt.base — один объект. */
export function buySupply(save: SaveData, belt: Belt, kind: SupplyKind, n: number): boolean {
  if (!canBuySupply(save, belt, kind, n)) return false;
  save.coins -= SUPPLIES[kind].price * n;
  belt.base[kind] += n;
  return true;
}
