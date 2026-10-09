// Состояние погружения: кислород, предупреждения, причины завершения.
import { OXYGEN } from '../config/balance.ts';

export type DiveEnd = 'success' | 'oxygen' | 'abort';
export type WarnLevel = 'ok' | 'soft' | 'hard' | 'out';

export interface DiveState {
  active: boolean;
  oxygen: number;
  maxOxygen: number;
  elapsed: number;
  maxDepthM: number;
  ended: DiveEnd | null;
}

export function newDive(maxOxygen: number): DiveState {
  return { active: false, oxygen: maxOxygen, maxOxygen, elapsed: 0, maxDepthM: 0, ended: null };
}

/** Тик под водой: 1 с запаса за 1 с игры, в том числе при остановке. */
export function tick(state: DiveState, dt: number, infinite = false): void {
  if (!state.active || state.ended) return;
  state.elapsed += dt;
  if (!infinite) state.oxygen = Math.max(0, state.oxygen - dt);
}

export function warnLevel(state: DiveState): WarnLevel {
  if (state.oxygen <= 0) return 'out';
  const f = state.oxygen / state.maxOxygen;
  if (f <= OXYGEN.warnHard) return 'hard';
  if (f <= OXYGEN.warnSoft) return 'soft';
  return 'ok';
}

/**
 * Разрешение шага: вход в безопасную зону имеет приоритет над окончанием кислорода
 * в том же шаге симуляции (ТЗ раздел 2).
 */
export function resolve(state: DiveState, inBase: boolean): DiveEnd | null {
  if (!state.active || state.ended) return state.ended;
  if (inBase) state.ended = 'success';
  else if (state.oxygen <= 0) state.ended = 'oxygen';
  return state.ended;
}

export function addOxygen(state: DiveState, seconds: number): void {
  state.oxygen = Math.min(state.maxOxygen, state.oxygen + seconds);
}
