import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canPick, cargoValue, cargoWeight, isOverloaded, popLast, type CargoItem } from '../src/core/cargo.ts';

const item = (id: string, type: CargoItem['type'], weight: number): CargoItem => ({ id, type, weight });

test('W = 2C и ещё один предмет: лишний не подбирается', () => {
  const items = [item('a', 'crystal', 4), item('b', 'crystal', 4), item('c', 'crystal', 4)];
  assert.equal(cargoWeight(items), 12);
  assert.equal(canPick(items, 1, 6), false);
  assert.equal(canPick(items.slice(0, 2), 4, 6), true);
  assert.equal(isOverloaded(items, 6), true);
  assert.equal(isOverloaded([item('d', 'shard', 1)], 6), false);
});

test('сброс и повторный подбор: предмет не теряется и не дублируется', () => {
  const items = [item('h1-sh-01', 'shard', 1), item('h1-ore-01', 'ore', 2)];
  const dropped = popLast(items);
  assert.equal(dropped?.id, 'h1-ore-01');
  assert.equal(items.length, 1);
  items.push(dropped!);
  assert.deepEqual(items.map((i) => i.id), ['h1-sh-01', 'h1-ore-01']);
  assert.equal(cargoValue(items), 12);
});

test('капсула участвует в перегрузе: подбор только при C ≥ 12', () => {
  assert.equal(canPick([], 24, 6), false);
  assert.equal(canPick([], 24, 9), false);
  assert.equal(canPick([], 24, 12), true);
});
