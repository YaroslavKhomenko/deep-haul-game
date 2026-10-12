// Чистые правила прототипа уровня: сохранение, разгрузка по назначению, подстанция, покупки, ремонт ножа,
// последняя безопасная точка, размещение груза при провале, текущая цель. Без Phaser — покрыто тестами.
import { ITEMS } from '../config/balance.ts';
import type { LootSpawn } from '../config/map.ts';
import type { CargoItem } from '../core/cargo.ts';
import { markDelivered, markMoved, scatterPositions, type WorldItem } from '../core/lootState.ts';
import type { LootRecord, StorageLike } from '../core/save.ts';
import {
  COMPONENTS_NEEDED, CRATE_SUPPLIES, ENGINE_ID, GATE_ID, LEVEL_KNIFE, LEVEL_UPGRADES, MANDATORY_NETS,
  upgradeMax, type BaseId, type LevelUpgradeId,
} from './config.ts';

export const LEVEL_SAVE_KEY = 'deep-haul-level1-v1';

export interface LevelDiveLog {
  n: number;
  from: BaseId;
  to: BaseId;
  result: 'success' | 'oxygen' | 'abort' | 'reload';
  durationS: number;
  gold: number;
  supplies: number;
  delivered: Partial<Record<string, number>>;
  installed: number;
  kept: string[];
  placed: number;
  purchases: string[];
  repairs: number;
  minO2: number;
  notes: string[];
}

export interface LevelSave {
  v: 1;
  gold: number;
  supplies: number;
  upgrades: Record<LevelUpgradeId, number>;
  knife: { owned: boolean; durability: number };
  loot: Record<string, LootRecord>;
  netsCut: string[];
  substation: { installed: string[]; restored: boolean };
  /** Последняя посещённая работающая база: обновляется при каждом входе в её зону. */
  lastSafe: BaseId;
  /** Уникальные детали, оставшиеся в связке на базе (нельзя сдать на этой базе). */
  carried: string[];
  /** Снимок активной вылазки: перезагрузка страницы = провал в этой точке. */
  inFlight: { x: number; y: number; cargoIds: string[] } | null;
  hints: string[];
  completed: boolean;
  stats: {
    dives: number;
    fails: number;
    deliveries: number;
    purchases: number;
    repairs: number;
    goldEarned: number;
    suppliesEarned: number;
    playMs: number;
    firstPurchaseMs: number | null;
    substationMs: number | null;
    completedMs: number | null;
  };
  log: LevelDiveLog[];
  devTouched: boolean;
}

export function freshLevelSave(): LevelSave {
  return {
    v: 1,
    gold: 0,
    supplies: 0,
    upgrades: { oxygen: 0, lantern: 0, fins: 0, tow: 0 },
    knife: { owned: false, durability: 0 },
    loot: {},
    netsCut: [],
    substation: { installed: [], restored: false },
    lastSafe: 'boat',
    carried: [],
    inFlight: null,
    hints: [],
    completed: false,
    stats: {
      dives: 0, fails: 0, deliveries: 0, purchases: 0, repairs: 0, goldEarned: 0, suppliesEarned: 0, playMs: 0,
      firstPurchaseMs: null, substationMs: null, completedMs: null,
    },
    log: [],
    devTouched: false,
  };
}

function defaultStorage(): StorageLike | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* приватный режим */
  }
  return null;
}

export function loadLevelSave(storage: StorageLike | null = defaultStorage()): LevelSave {
  const fresh = freshLevelSave();
  if (!storage) return fresh;
  try {
    const raw = storage.getItem(LEVEL_SAVE_KEY);
    if (!raw) return fresh;
    const p = JSON.parse(raw) as Partial<LevelSave>;
    if (p.v !== 1) return fresh;
    return {
      ...fresh,
      ...p,
      upgrades: { ...fresh.upgrades, ...(p.upgrades ?? {}) },
      knife: { ...fresh.knife, ...(p.knife ?? {}) },
      loot: p.loot && typeof p.loot === 'object' ? p.loot : {},
      netsCut: Array.isArray(p.netsCut) ? p.netsCut : [],
      substation: { ...fresh.substation, ...(p.substation ?? {}) },
      carried: Array.isArray(p.carried) ? p.carried : [],
      hints: Array.isArray(p.hints) ? p.hints : [],
      stats: { ...fresh.stats, ...(p.stats ?? {}) },
      log: Array.isArray(p.log) ? p.log : [],
    };
  } catch {
    return fresh;
  }
}

export function writeLevelSave(data: LevelSave, storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(LEVEL_SAVE_KEY, JSON.stringify(data));
  } catch {
    /* нет места — игра идёт без сохранения */
  }
}

export function resetLevelSave(storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.removeItem(LEVEL_SAVE_KEY);
  } catch {
    /* ignore */
  }
}

// ---------------- Базы ----------------

export function isWorkingBase(save: LevelSave, base: BaseId): boolean {
  return base === 'boat' || save.substation.restored;
}

/** База для возврата после провала: последняя посещённая, если она работает. */
export function respawnBase(save: LevelSave): BaseId {
  return isWorkingBase(save, save.lastSafe) ? save.lastSafe : 'boat';
}

export interface Arrival {
  base: BaseId;
  gold: number;
  supplies: number;
  counts: Partial<Record<string, number>>;
  deliveredIds: string[];
  kept: CargoItem[];
  completedNow: boolean;
}

/**
 * Вход в зону работающей базы (даже без груза): последняя безопасная точка = эта база; ценности → золото,
 * ящики → припасы, двигатель у лодки → ремонт; уникальные детали, которые здесь не сдаются, остаются в связке.
 */
export function arriveAtBase(save: LevelSave, base: BaseId, cargo: readonly CargoItem[]): Arrival {
  const out: Arrival = { base, gold: 0, supplies: 0, counts: {}, deliveredIds: [], kept: [], completedNow: false };
  if (!isWorkingBase(save, base)) return { ...out, kept: [...cargo] };
  save.lastSafe = base;
  for (const it of cargo) {
    const def = ITEMS[it.type];
    let delivered = false;
    if (def.kind === 'valuable') {
      out.gold += def.price;
      delivered = true;
    } else if (def.kind === 'crate') {
      out.supplies += CRATE_SUPPLIES;
      delivered = true;
    } else if (it.type === 'engine' && base === 'boat') {
      out.completedNow = !save.completed;
      delivered = true;
    }
    if (delivered) {
      out.deliveredIds.push(it.id);
      out.counts[it.type] = (out.counts[it.type] ?? 0) + 1;
      markDelivered(save.loot, it.id);
    } else out.kept.push(it);
  }
  save.gold += out.gold;
  save.supplies += out.supplies;
  save.stats.goldEarned += out.gold;
  save.stats.suppliesEarned += out.supplies;
  if (out.deliveredIds.length) save.stats.deliveries += 1;
  if (out.completedNow) save.completed = true;
  save.carried = out.kept.map((c) => c.id);
  save.inFlight = null;
  return out;
}

/** Вход в зону обесточенной подстанции: компоненты из связки устанавливаются. При последнем подстанция включается и открывает решётку. */
export function installComponents(save: LevelSave, cargo: CargoItem[]): { installed: string[]; restoredNow: boolean } {
  const installed: string[] = [];
  if (save.substation.restored) return { installed, restoredNow: false };
  for (let i = cargo.length - 1; i >= 0; i--) {
    const it = cargo[i];
    if (it.type !== 'component' || save.substation.installed.length >= COMPONENTS_NEEDED) continue;
    save.substation.installed.push(it.id);
    markDelivered(save.loot, it.id);
    installed.push(it.id);
    cargo.splice(i, 1);
  }
  let restoredNow = false;
  if (save.substation.installed.length >= COMPONENTS_NEEDED) {
    save.substation.restored = true;
    if (!save.netsCut.includes(GATE_ID)) save.netsCut.push(GATE_ID);
    restoredNow = true;
  }
  return { installed, restoredNow };
}

// ---------------- Прокачка и нож ----------------

export function upgradeCost(id: LevelUpgradeId, level: number): number | null {
  return LEVEL_UPGRADES[id].costs[level] ?? null;
}

export function canBuyUpgrade(save: LevelSave, id: LevelUpgradeId): { ok: boolean; cost: number | null; reason?: 'max' | 'gold' } {
  const cost = upgradeCost(id, save.upgrades[id]);
  if (cost === null || save.upgrades[id] >= upgradeMax(id)) return { ok: false, cost: null, reason: 'max' };
  if (save.gold < cost) return { ok: false, cost, reason: 'gold' };
  return { ok: true, cost };
}

/** Покупка уровня: проверка цены, золото не уходит в минус. */
export function buyLevelUpgrade(save: LevelSave, id: LevelUpgradeId, nowMs = 0): boolean {
  const c = canBuyUpgrade(save, id);
  if (!c.ok || c.cost === null) return false;
  save.gold -= c.cost;
  save.upgrades[id] += 1;
  save.stats.purchases += 1;
  if (save.stats.firstPurchaseMs === null) save.stats.firstPurchaseMs = nowMs;
  return true;
}

export function knifeRepairable(save: LevelSave, wanted: number): number {
  if (!save.knife.owned) return 0;
  const missing = LEVEL_KNIFE.max - save.knife.durability;
  const affordable = Math.floor(save.supplies / LEVEL_KNIFE.repairCost);
  return Math.max(0, Math.min(wanted, missing, affordable));
}

/** Ремонт ножа за припасы, вручную на базе. Возвращает число восстановленных единиц. */
export function repairLevelKnife(save: LevelSave, wanted: number): number {
  const n = knifeRepairable(save, wanted);
  if (n <= 0) return 0;
  save.supplies -= n * LEVEL_KNIFE.repairCost;
  save.knife.durability += n;
  save.stats.repairs += n;
  return n;
}

/** Подбор ножа: снаряжение (не груз), полная прочность. */
export function takeKnife(save: LevelSave, id: string): void {
  save.knife = { owned: true, durability: LEVEL_KNIFE.max };
  markDelivered(save.loot, id);
}

/** Разрез сети ножом. false — нельзя (нет ножа, прочность 0, решётка). */
export function cutWithKnife(save: LevelSave, netId: string): boolean {
  if (netId === GATE_ID || !save.knife.owned || save.knife.durability <= 0 || save.netsCut.includes(netId)) return false;
  save.knife.durability -= 1;
  save.netsCut.push(netId);
  return true;
}

// ---------------- Провал ----------------

/**
 * Провал (кислород 0, «Вернуться на базу», перезагрузка): груз остаётся у точки провала.
 * Уникальные детали — первыми (в центр, если он свободен), остальное по спирали; isFree решает, куда класть.
 */
export function placeFailedCargo(
  save: LevelSave,
  cargo: readonly CargoItem[],
  x: number,
  y: number,
  isFree: (x: number, y: number) => boolean,
): WorldItem[] {
  const ordered = [...cargo].sort((a, b) => Number(ITEMS[b.type].kind === 'unique') - Number(ITEMS[a.type].kind === 'unique'));
  const pts = scatterPositions(ordered.length, x, y, isFree);
  const placed: WorldItem[] = [];
  ordered.forEach((it, i) => {
    const p = pts[i];
    markMoved(save.loot, it.id, p.x, p.y);
    placed.push({ id: it.id, type: it.type, x: p.x, y: p.y, n: 1 });
  });
  save.carried = [];
  save.inFlight = null;
  return placed;
}

export function failDive(save: LevelSave): BaseId {
  save.stats.fails += 1;
  return respawnBase(save);
}

// ---------------- Цель ----------------

export function goalText(save: LevelSave, cargo: readonly CargoItem[]): string {
  if (save.completed) return 'Лодка отремонтирована — уровень пройден';
  if (cargo.some((c) => c.type === 'engine')) return 'Доставьте двигатель к лодке';
  if (save.loot[ENGINE_ID]?.s === 'w') return 'Заберите двигатель там, где он остался, и доставьте к лодке';
  if (save.stats.deliveries === 0) return 'Найдите добычу под лодкой и привезите её к лодке';
  if (save.stats.purchases === 0) return 'Купите первое улучшение на лодке';
  if (!save.knife.owned) return 'Исследуйте пещеру глубже — где-то лежит нож';
  if (!save.netsCut.some((id) => id !== GATE_ID)) return 'Разрежьте сеть ножом — удерживайте E у сети';
  const needed: readonly string[] = save.substation.restored ? ['net-n3'] : MANDATORY_NETS.filter((n) => n !== 'net-n3');
  if (save.knife.durability <= 0 && needed.some((n) => !save.netsCut.includes(n))) return 'Почините нож за припасы на лодке или подстанции';
  if (!save.substation.restored) {
    const inCargo = cargo.filter((c) => c.type === 'component').length;
    return `Восстановите подстанцию: компоненты ${save.substation.installed.length}/${COMPONENTS_NEEDED}${inCargo ? ` (${inCargo} в грузе)` : ''}`;
  }
  return 'Найдите двигатель лодки в дальней зоне';
}

/** Описание предмета для подсказки у находки. */
export function itemPurpose(spawn: Pick<LootSpawn, 'type'>): string {
  const def = ITEMS[spawn.type];
  if (spawn.type === 'knife') return 'снаряжение: режет сети';
  if (def.kind === 'crate') return `вес ${def.weight} • ${CRATE_SUPPLIES} припаса на базе`;
  if (spawn.type === 'component') return `вес ${def.weight} • отвезти к подстанции`;
  if (spawn.type === 'engine') return `вес ${def.weight} • доставить к лодке`;
  return `вес ${def.weight} • ${def.price} золота`;
}
