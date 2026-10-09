import { test } from 'node:test';
import assert from 'node:assert/strict';
import { approach, normalizeInput, speedMultiplier, targetSpeed } from '../src/core/movement.ts';

test('до нормального веса — таблица ТЗ: 0/50/100% → 100/89/67%', () => {
  for (const [w, expected] of [[0, 1], [3, 0.889], [6, 0.667]] as [number, number][]) {
    assert.ok(Math.abs(speedMultiplier(w, 6) - expected) < 0.002, `W=${w}`);
  }
  assert.equal(Math.round(targetSpeed(140, 6, 6)), 93);
});

test('выше нормального веса — резкий спад: 1.25C → 49%, 1.5C → 27%, 2C → 9.5%', () => {
  assert.ok(Math.abs(speedMultiplier(7.5, 6) - 0.485) < 0.005);
  assert.ok(Math.abs(speedMultiplier(9, 6) - 0.267) < 0.005);
  assert.ok(Math.abs(speedMultiplier(12, 6) - 0.095) < 0.005);
  assert.ok(speedMultiplier(12, 6) > 0.05, 'движение не блокируется');
});

test('капсула (24) при тяге 21 → ~59%, при тяге 15 → ~21%', () => {
  assert.ok(Math.abs(speedMultiplier(24, 21) - 0.594) < 0.01);
  assert.ok(Math.abs(speedMultiplier(24, 15) - 0.211) < 0.01);
});

test('покупка тяги 6→9 при W=6 даёт ~93→115 px/с', () => {
  assert.equal(Math.round(targetSpeed(140, 6, 9)), 115);
});

test('approach сходится и не зависит от шага; диагональ нормализована', () => {
  let a = 0;
  for (let i = 0; i < 100; i++) a = approach(a, 100, 0.016, 0.15);
  let b = 0;
  for (let i = 0; i < 50; i++) b = approach(b, 100, 0.032, 0.15);
  assert.ok(Math.abs(a - b) < 1.5 && a > 99.9);
  const v = normalizeInput(1, 1);
  assert.ok(Math.abs(Math.hypot(v.x, v.y) - 1) < 1e-9);
  assert.deepEqual(normalizeInput(0, 0), { x: 0, y: 0 });
});
