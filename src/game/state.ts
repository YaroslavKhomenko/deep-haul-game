// Общее состояние игры между сценами (мета + текущее погружение).
import { effects } from '../config/balance.ts';
import type { CargoItem } from '../core/cargo.ts';
import { newDive, type DiveState } from '../core/dive.ts';
import { emptyCount, loadSave, writeSave, type DiveLog, type DiveResult, type SaveData, type SupplyCount } from '../core/save.ts';
import type { Belt } from '../core/supplies.ts';

export interface LastResult {
  result: DiveResult | null;
  coins: number;
  parts: number;
  counts: Partial<Record<string, number>>;
  merged: SupplyCount;
  returned: { cargo: number; packs: number };
  lostCargoValue: number;
  capsule: boolean;
}

export interface GameState {
  save: SaveData;
  belt: Belt;
  cargo: CargoItem[];
  dive: DiveState;
  infiniteO2: boolean;
  devActive: boolean;
  /** Пауза при потере фокуса и скрытии вкладки (ТЗ). Автопрогон выключает. */
  autoPause: boolean;
  /** Накопители текущего захода для журнала. */
  current: DiveLog;
  last: LastResult | null;
  hintsShown: Set<string>;
}

export function newLogEntry(n: number, dev: boolean): DiveLog {
  return {
    n,
    result: 'reload',
    durationS: 0,
    maxDepthM: 0,
    delivered: {},
    coins: 0,
    parts: 0,
    supplies: { bought: emptyCount(), found: emptyCount(), used: emptyCount(), lost: emptyCount(), merged: emptyCount() },
    spentOnSupplies: 0,
    spentOnRepair: 0,
    purchases: [],
    returned: { cargo: 0, packs: 0 },
    capsule: false,
    dev,
    notes: [],
  };
}

export function createState(): GameState {
  const save = loadSave();
  const belt: Belt = { base: save.supplies, packs: [] };
  const dive = newDive(effects.oxygen(save.upgrades.tank));
  return {
    save,
    belt,
    cargo: [],
    dive,
    infiniteO2: false,
    devActive: false,
    autoPause: true,
    current: newLogEntry(save.stats.dives + 1, false),
    last: null,
    hintsShown: new Set(),
  };
}

export const state: GameState = createState();

export function persist(): void {
  writeSave(state.save);
}
