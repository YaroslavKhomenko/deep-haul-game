import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVEL } from '../src/level/map.ts';
import { CRATE_SUPPLIES, GATE_ID, LEVEL_KNIFE, MANDATORY_NETS } from '../src/level/config.ts';
import { buildWallGrid, isWallAt } from '../src/core/grid.ts';
import { buildPassable } from '../src/core/nav.ts';
import { checkUniqueIds } from '../src/core/lootState.ts';
import { bfsFrom, stepsTo } from '../src/level/route.ts';

const grid = buildWallGrid(LEVEL.water, LEVEL.width, LEVEL.height);
const boat = LEVEL.bases.boat.spawn;
const netRect = (id: string) => LEVEL.nets.find((n) => n.id === id)!;
const reachField = (closed: string[]) => {
  const passable = buildPassable(grid, closed.map(netRect));
  const g = { cols: grid.cols, rows: grid.rows, passable };
  return { g, field: bfsFrom(g, boat.x, boat.y) };
};
const reachable = (closed: string[], x: number, y: number) => {
  const { g, field } = reachField(closed);
  return stepsTo(g, field, x, y) >= 0;
};
const allNetIds = LEVEL.nets.map((n) => n.id);
const spawn = (id: string) => LEVEL.loot.find((l) => l.id === id)!;

test('id лута и сетей уникальны; лут, сети, базы и спавны — в воде', () => {
  assert.deepEqual(checkUniqueIds(LEVEL.loot), []);
  assert.equal(new Set(allNetIds).size, allNetIds.length);
  const bad = LEVEL.loot.filter((l) => [[0, 0], [6, 0], [-6, 0], [0, 6], [0, -6]].some(([dx, dy]) => isWallAt(grid, l.x + dx, l.y + dy)));
  assert.deepEqual(bad.map((b) => b.id), []);
  for (const n of LEVEL.nets) {
    for (let y = n.y + 8; y < n.y + n.h; y += 16) for (let x = n.x + 8; x < n.x + n.w; x += 16) {
      assert.equal(isWallAt(grid, x, y), false, `сеть ${n.id} в стене`);
    }
  }
  for (const b of Object.values(LEVEL.bases)) {
    assert.equal(isWallAt(grid, b.spawn.x, b.spawn.y), false, b.name);
    for (let y = b.zone.y + 8; y < b.zone.y + b.zone.h; y += 16) for (let x = b.zone.x + 8; x < b.zone.x + b.zone.w; x += 16) {
      assert.equal(isWallAt(grid, x, y), false, `зона ${b.name} в стене`);
    }
  }
});

test('предметы не слипаются (≥ 20 px)', () => {
  for (let i = 0; i < LEVEL.loot.length; i++) for (let j = i + 1; j < LEVEL.loot.length; j++) {
    const a = LEVEL.loot[i], b = LEVEL.loot[j];
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 20, `${a.id} и ${b.id}`);
  }
});

test('при открытых сетях и решётке достижимо всё: компоненты, двигатель, лут', () => {
  const { g, field } = reachField([]);
  const lost = LEVEL.loot.filter((l) => stepsTo(g, field, l.x, l.y) < 0);
  assert.deepEqual(lost.map((l) => l.id), []);
  assert.ok(stepsTo(g, field, LEVEL.bases.sub.spawn.x, LEVEL.bases.sub.spawn.y) >= 0);
});

test('решётка закрывает дальнюю зону: двигатель недостижим без восстановления подстанции', () => {
  const knifeNetsOpen = [GATE_ID];
  assert.equal(reachable(knifeNetsOpen, spawn('engine').x, spawn('engine').y), false);
  for (const id of ['h3-cr-01', 'h3-ore-01', 'er-cr-01', 'z3-crate']) assert.equal(reachable(knifeNetsOpen, spawn(id).x, spawn(id).y), false, id);
  // компоненты при этом достижимы, подстанция тоже
  for (const id of ['h2-comp-a', 'w2-comp-b']) assert.equal(reachable(knifeNetsOpen, spawn(id).x, spawn(id).y), true, id);
  assert.equal(reachable(knifeNetsOpen, LEVEL.bases.sub.spawn.x, LEVEL.bases.sub.spawn.y), true);
});

test('обязательные сети действительно преграждают путь', () => {
  assert.equal(reachable(['net-n1'], spawn('h2-comp-a').x, spawn('h2-comp-a').y), false, 'N1 → средняя зона');
  assert.equal(reachable(['net-n2'], spawn('w2-comp-b').x, spawn('w2-comp-b').y), false, 'N2 → компонент B');
  assert.equal(reachable(['net-n3'], spawn('engine').x, spawn('engine').y), false, 'N3 → двигатель');
  assert.equal(reachable([], spawn('engine').x, spawn('engine').y), true);
  assert.deepEqual([...MANDATORY_NETS].sort(), ['net-n1', 'net-n2', 'net-n3']);
});

test('свободных припасов хватает на ремонт при разрезе всех сетей ножом', () => {
  const closed = [...LEVEL.optionalNets, GATE_ID];
  const crates = LEVEL.loot.filter((l) => l.type === 'crate' && reachable(closed, l.x, l.y));
  const knifeNets = allNetIds.filter((id) => id !== GATE_ID).length;
  const needSupplies = Math.max(0, knifeNets - LEVEL_KNIFE.max) * LEVEL_KNIFE.repairCost;
  assert.ok(crates.length * CRATE_SUPPLIES >= needSupplies, `${crates.length * CRATE_SUPPLIES} припасов против ${needSupplies}`);
});
