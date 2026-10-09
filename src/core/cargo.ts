// Груз: список предметов, вес, правила подбора и сброса (ТЗ раздел 2).
import { DIVER, ITEMS, type ItemType } from '../config/balance.ts';

export interface CargoItem {
  /** Стабильный id предмета карты. */
  id: string;
  type: ItemType;
  weight: number;
}

export function cargoWeight(items: readonly CargoItem[]): number {
  return items.reduce((s, i) => s + i.weight, 0);
}

export function cargoValue(items: readonly CargoItem[]): number {
  return items.reduce((s, i) => s + ITEMS[i.type].price, 0);
}

/** Можно ли взять предмет: суммарный вес не должен превысить предел перегруза (200% тяги). */
export function canPick(items: readonly CargoItem[], weight: number, haul: number, limit = DIVER.overloadLimit): boolean {
  return cargoWeight(items) + weight <= haul * limit + 1e-9;
}

export function isOverloaded(items: readonly CargoItem[], haul: number): boolean {
  return cargoWeight(items) > haul;
}

/** Снять последний подобранный предмет (сброс по Q). */
export function popLast(items: CargoItem[]): CargoItem | undefined {
  return items.pop();
}
