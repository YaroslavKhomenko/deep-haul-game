import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addOxygen, newDive, resolve, tick, warnLevel } from '../src/core/dive.ts';
import { effects } from '../src/config/balance.ts';

test('стартовый кислород 25 с, +5 за уровень баллона', () => {
  assert.equal(effects.oxygen(0), 25);
  assert.equal(effects.oxygen(8), 65);
});

test('кислород расходуется 1:1 и предупреждает на 30% и 15%', () => {
  const d = newDive(60);
  d.active = true;
  tick(d, 41);
  assert.equal(warnLevel(d), 'ok');
  tick(d, 1);
  assert.equal(warnLevel(d), 'soft');
  tick(d, 9);
  assert.equal(warnLevel(d), 'hard');
  tick(d, 100);
  assert.equal(d.oxygen, 0);
  assert.equal(resolve(d, false), 'oxygen');
});

test('вход в причал в том же шаге, что и O2 = 0, спасает груз', () => {
  const d = newDive(25);
  d.active = true;
  tick(d, 25);
  assert.equal(resolve(d, true), 'success');
  assert.equal(resolve(d, false), 'success');
});

test('бесконечный кислород DEV и баллончик +8 не выше максимума', () => {
  const d = newDive(25);
  d.active = true;
  tick(d, 10, true);
  assert.equal(d.oxygen, 25);
  tick(d, 10);
  addOxygen(d, 8);
  assert.equal(d.oxygen, 23);
  addOxygen(d, 100);
  assert.equal(d.oxygen, 25);
});
