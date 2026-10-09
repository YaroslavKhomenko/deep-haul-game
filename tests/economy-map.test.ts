import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, KNIFE, SUPPLIES, UPGRADES } from '../src/config/balance.ts';
import { MAP, STAGES } from '../src/config/map.ts';

const cost = (id: keyof typeof UPGRADES, from: number, to: number) => UPGRADES[id].costs.slice(from, to).reduce((s, c) => s + c.coins, 0);
const parts = (id: keyof typeof UPGRADES, from: number, to: number) => UPGRADES[id].costs.slice(from, to).reduce((s, c) => s + c.parts, 0);

function stageSums(filter: (y: number) => boolean) {
  let coins = 0, partsN = 0;
  for (const l of MAP.loot) {
    if (!filter(l.y)) continue;
    const def = ITEMS[l.type];
    if (def.kind === 'valuable') coins += def.price;
    if (def.kind === 'material') partsN += 1;
  }
  return { coins, parts: partsN };
}

test('этап A (вход, хаб 1, карманы) покрывает Баллон 1–4, Тягу 1–2, Фонарь 1 и ремонт с запасом 15%', () => {
  const have = stageSums((y) => y < STAGES.aMaxY);
  const need = cost('tank', 0, 4) + cost('haul', 0, 2) + cost('lantern', 0, 1) + 2 * KNIFE.repairCost;
  assert.ok(have.coins >= need * 1.15, `A: ${have.coins} монет против ${need}`);
  assert.ok(have.parts >= parts('tank', 0, 4) + parts('haul', 0, 2), `A детали: ${have.parts}`);
});

test('этап B (хаб 2 и карманы) покрывает Баллон 5–6, Тягу 3, Фонарь 2, Оружие 1 + 10 гарпунов, Инструменты 1, 2 баллончика', () => {
  const have = stageSums((y) => y >= STAGES.aMaxY && y < STAGES.bMaxY);
  const need = cost('tank', 4, 6) + cost('haul', 2, 3) + cost('lantern', 1, 2) + cost('weapon', 0, 1) + 10 * SUPPLIES.harpoons.price + cost('tools', 0, 1) + 2 * SUPPLIES.o2.price;
  assert.ok(have.coins >= need * 1.15, `B: ${have.coins} монет против ${need}`);
  const needParts = parts('tank', 4, 6) + parts('haul', 2, 3) + parts('lantern', 1, 2) + parts('weapon', 0, 1) + parts('tools', 0, 1);
  assert.ok(have.parts >= needParts, `B детали: ${have.parts} против ${needParts}`);
});

test('этап C (глубина) покрывает Тягу 4–5, Баллон 7–8, Ласты 1–2 и 4 баллончика', () => {
  const have = stageSums((y) => y >= STAGES.bMaxY);
  const need = cost('haul', 3, 5) + cost('tank', 6, 8) + cost('fins', 0, 2) + 4 * SUPPLIES.o2.price;
  assert.ok(have.coins >= need * 1.15, `C: ${have.coins} монет против ${need}`);
  const needParts = parts('haul', 3, 5) + parts('tank', 6, 8) + parts('fins', 0, 2);
  assert.ok(have.parts >= needParts, `C детали: ${have.parts} против ${needParts}`);
});

test('вся карта: монеты и детали с запасом над полным путём к капсуле', () => {
  const all = stageSums(() => true);
  const needCoins = cost('tank', 0, 8) + cost('haul', 0, 5) + cost('fins', 0, 2) + cost('lantern', 0, 2) + cost('weapon', 0, 1) + cost('tools', 0, 1) + 10 * SUPPLIES.harpoons.price + 6 * SUPPLIES.o2.price + 5 * KNIFE.repairCost;
  const needParts = parts('tank', 0, 8) + parts('haul', 0, 5) + parts('fins', 0, 2) + parts('lantern', 0, 2) + parts('weapon', 0, 1) + parts('tools', 0, 1);
  assert.ok(all.coins >= needCoins * 1.15, `всего ${all.coins} монет против ${needCoins}`);
  assert.ok(all.parts >= needParts * 1.2, `всего ${all.parts} деталей против ${needParts}`);
});
