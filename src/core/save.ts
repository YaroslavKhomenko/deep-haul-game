// Сохранение v2: кошелёк, детали, улучшения, припасы базы, нож, состояние конечного лута, сети, inFlight, статистика, журнал.
import { START, type ItemType, type SupplyKind, type UpgradeId } from '../config/balance.ts';

export const SAVE_KEY = 'deep-haul-save-v2';

export type DiveResult = 'success' | 'oxygen' | 'abort' | 'reload';
export type SupplyCount = Record<SupplyKind, number>;

/** Пачка припаса на поясе: id предмета карты, вид и точный остаток. */
export interface Pack {
  id: string;
  kind: SupplyKind;
  n: number;
}

/** Отклонение предмета карты от спавна: доставлен / израсходован / перемещён (с остатком n для припасов). */
export type LootRecord = { s: 'd' } | { s: 'c' } | { s: 'w'; x: number; y: number; n?: number };

/** Снимок активного погружения: при загрузке с ним результат равен обычному провалу в точке x,y. */
export interface InFlight {
  x: number;
  y: number;
  cargoIds: string[];
  packs: Pack[];
}

export interface DiveLog {
  n: number;
  result: DiveResult;
  durationS: number;
  maxDepthM: number;
  delivered: Partial<Record<ItemType, number>>;
  coins: number;
  parts: number;
  supplies: { bought: SupplyCount; found: SupplyCount; used: SupplyCount; lost: SupplyCount; merged: SupplyCount };
  spentOnSupplies: number;
  spentOnRepair: number;
  purchases: string[];
  returned: { cargo: number; packs: number };
  capsule: boolean;
  dev: boolean;
  notes: string[];
}

export interface SaveData {
  v: 2;
  coins: number;
  parts: number;
  upgrades: Record<UpgradeId, number>;
  supplies: SupplyCount;
  knife: { owned: boolean; durability: number };
  loot: Record<string, LootRecord>;
  netsCut: string[];
  inFlight: InFlight | null;
  introSeen: boolean;
  capsuleDelivered: boolean;
  createdAt: number;
  stats: {
    dives: number;
    successes: number;
    fails: number;
    bestIncome: number;
    purchases: number;
    playMs: number;
    winMs: number | null;
    winDives: number | null;
  };
  log: DiveLog[];
  devTouched: boolean;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function emptyCount(): SupplyCount {
  return { o2: 0, harpoons: 0 };
}

export function freshSave(now = Date.now()): SaveData {
  return {
    v: 2,
    coins: START.coins,
    parts: START.parts,
    upgrades: { fins: 0, tank: 0, haul: 0, lantern: 0, tools: 0, weapon: 0, suit: 0 },
    supplies: { o2: START.o2, harpoons: START.harpoons },
    knife: { owned: false, durability: 0 },
    loot: {},
    netsCut: [],
    inFlight: null,
    introSeen: false,
    capsuleDelivered: false,
    createdAt: now,
    stats: { dives: 0, successes: 0, fails: 0, bestIncome: 0, purchases: 0, playMs: 0, winMs: null, winDives: null },
    log: [],
    devTouched: false,
  };
}

function defaultStorage(): StorageLike | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* приватный режим и т.п. */
  }
  return null;
}

export function loadSave(storage: StorageLike | null = defaultStorage()): SaveData {
  const fresh = freshSave();
  if (!storage) return fresh;
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return fresh;
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    if (parsed.v !== 2) return fresh;
    return {
      ...fresh,
      ...parsed,
      upgrades: { ...fresh.upgrades, ...(parsed.upgrades ?? {}) },
      supplies: { ...fresh.supplies, ...(parsed.supplies ?? {}) },
      knife: { ...fresh.knife, ...(parsed.knife ?? {}) },
      loot: parsed.loot && typeof parsed.loot === 'object' ? parsed.loot : {},
      netsCut: Array.isArray(parsed.netsCut) ? parsed.netsCut : [],
      inFlight: parsed.inFlight ?? null,
      stats: { ...fresh.stats, ...(parsed.stats ?? {}) },
      log: Array.isArray(parsed.log) ? parsed.log : [],
    };
  } catch {
    return fresh;
  }
}

export function writeSave(data: SaveData, storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    /* нет места или запрещено — игра продолжается без сохранения */
  }
}

export function resetSave(storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}
