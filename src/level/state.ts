// Состояние режима уровня между сценами.
import { upgradeValue, type BaseId } from './config.ts';
import type { CargoItem } from '../core/cargo.ts';
import { newDive, type DiveState } from '../core/dive.ts';
import { loadLevelSave, writeLevelSave, type Arrival, type LevelSave } from './rules.ts';

export interface SortieResult {
  kind: 'success' | 'oxygen' | 'abort' | 'reload' | 'start';
  arrival: Arrival | null;
  installed: number;
  restoredNow: boolean;
  placed: number;
  failDepthM: number;
  base: BaseId;
}

export interface CurrentSortie {
  from: BaseId;
  purchases: string[];
  repairs: number;
  minO2: number;
  notes: string[];
  /** Компоненты, установленные в этой вылазке, и включение подстанции — для итога на экране базы. */
  installed: number;
  restored: boolean;
}

export interface LevelState {
  save: LevelSave;
  cargo: CargoItem[];
  dive: DiveState;
  infiniteO2: boolean;
  devActive: boolean;
  autoPause: boolean;
  last: SortieResult | null;
  current: CurrentSortie;
  /** Текущая база (на экране базы) или база старта вылазки. */
  base: BaseId;
}

export function newSortie(from: BaseId): CurrentSortie {
  return { from, purchases: [], repairs: 0, minO2: Infinity, notes: [], installed: 0, restored: false };
}

function create(): LevelState {
  const save = loadLevelSave();
  return {
    save,
    cargo: [],
    dive: newDive(upgradeValue('oxygen', save.upgrades.oxygen)),
    infiniteO2: false,
    devActive: false,
    autoPause: true,
    last: null,
    current: newSortie(save.lastSafe),
    base: save.lastSafe,
  };
}

export const levelState: LevelState = create();

export function persistLevel(): void {
  writeLevelSave(levelState.save);
}
