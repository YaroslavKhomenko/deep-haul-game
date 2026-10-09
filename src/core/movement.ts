// Чистые расчёты движения и веса (ТЗ раздел 2, перегруз — правка по первому тесту).
import { DIVER } from '../config/balance.ts';

/**
 * До нормального веса — кривая ТЗ 1/(1+0.5r²) (100% → 67% при W = C).
 * Выше — резкий спад (2/3)/(1+6(r−1)²): 1.25C → 49%, 1.5C → 27%, 2C → 9.5%. Движение не блокируется.
 */
export function speedMultiplier(weight: number, haul: number, coef = DIVER.slowCoef, overloadCoef = DIVER.overloadCoef): number {
  const r = weight / haul;
  if (r <= 1) return 1 / (1 + coef * r * r);
  const atLimit = 1 / (1 + coef);
  return atLimit / (1 + overloadCoef * (r - 1) * (r - 1));
}

export function targetSpeed(v0: number, weight: number, haul: number): number {
  return v0 * speedMultiplier(weight, haul);
}

/** Экспоненциальное приближение к цели с постоянной времени tau (независимо от частоты кадров). */
export function approach(current: number, target: number, dt: number, tau: number): number {
  if (tau <= 0) return target;
  const k = 1 - Math.exp(-dt / tau);
  return current + (target - current) * k;
}

export function normalizeInput(x: number, y: number): { x: number; y: number } {
  const len = Math.hypot(x, y);
  if (len < 1e-6) return { x: 0, y: 0 };
  return { x: x / len, y: y / len };
}
