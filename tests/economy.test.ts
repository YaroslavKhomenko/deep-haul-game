import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buySupply, buyUpgrade, canBuyUpgrade, repairKnife, repairableUnits, settle } from '../src/core/economy.ts';
import { freshSave } from '../src/core/save.ts';
import type { Belt } from '../src/core/supplies.ts';
import type { CargoItem } from '../src/core/cargo.ts';

test('сдача по назначению: ценности → монеты, материалы → детали, капсула → цель', () => {
  const items: CargoItem[] = [
    { id: 'a', type: 'shard', weight: 1 }, { id: 'b', type: 'ore', weight: 2 }, { id: 'c', type: 'crystal', weight: 4 },
    { id: 'd', type: 'parts', weight: 2 }, { id: 'e', type: 'parts', weight: 2 }, { id: 'f', type: 'capsule', weight: 24 },
  ];
  const s = settle(items);
  assert.equal(s.coins, 36);
  assert.equal(s.parts, 2);
  assert.equal(s.capsule, true);
  assert.equal(settle([]).coins, 0);
});

test('покупка: цена и уровень проверяются, кошелёк не уходит в минус; баллон 10/14, детали с 3 уровня', () => {
  const save = freshSave();
  save.coins = 24;
  assert.equal(buyUpgrade(save, 'tank'), true);
  assert.equal(buyUpgrade(save, 'tank'), true);
  assert.equal(save.coins, 0);
  assert.equal(buyUpgrade(save, 'tank'), false);
  save.coins = 100;
  const c = canBuyUpgrade(save, 'tank');
  assert.equal(c.ok, false);
  if (!c.ok) assert.equal(c.reason, 'parts');
  save.parts = 1;
  assert.equal(buyUpgrade(save, 'tank'), true);
  assert.equal(save.upgrades.tank, 3);
});

test('инструменты требуют найденный нож; покупка резака поднимает прочность до 5', () => {
  const save = freshSave();
  save.coins = 500;
  save.parts = 20;
  const noKnife = canBuyUpgrade(save, 'tools');
  assert.equal(noKnife.ok, false);
  if (!noKnife.ok) assert.equal(noKnife.reason, 'knife');
  save.knife = { owned: true, durability: 1 };
  assert.equal(buyUpgrade(save, 'tools'), true);
  assert.equal(save.knife.durability, 5);
});

test('ремонт ножа: 4 монеты за единицу, не выше максимума и не в минус', () => {
  const save = freshSave();
  save.knife = { owned: true, durability: 1 };
  save.coins = 10;
  assert.equal(repairableUnits(save, 5), 2);
  assert.equal(repairKnife(save, 5), 2);
  assert.equal(save.coins, 2);
  assert.equal(save.knife.durability, 3);
  assert.equal(repairKnife(save, 1), 0);
  save.coins = 3;
  assert.equal(repairableUnits(save, 1), 0);
  const none = freshSave();
  none.coins = 100;
  assert.equal(repairKnife(none, 1), 0);
});

test('припасы: покупка в base с учётом лимита пояса и цены', () => {
  const save = freshSave();
  save.coins = 20;
  const belt: Belt = { base: save.supplies, packs: [] };
  assert.equal(buySupply(save, belt, 'o2', 3), false);
  assert.equal(buySupply(save, belt, 'o2', 2), true);
  assert.equal(save.coins, 4);
  assert.equal(save.supplies.o2, 3);
  assert.equal(buySupply(save, belt, 'harpoons', 2), false);
  assert.equal(buySupply(save, belt, 'harpoons', 1), true);
  assert.equal(save.coins, 1);
});
