import { test } from 'node:test';
import assert from 'node:assert/strict';
import { endDive, foundCount, pickupPack, total, use, type Belt } from '../src/core/supplies.ts';
import { freshSave, loadSave, writeSave, type StorageLike } from '../src/core/save.ts';
import { applyFailure, markConsumed, worldItems } from '../src/core/lootState.ts';
import type { LootSpawn } from '../src/config/map.ts';

function memStorage(): StorageLike {
  const data: Record<string, string> = {};
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; }, removeItem: (k) => { delete data[k]; } };
}
const spawns: LootSpawn[] = [
  { id: 'h2-harp-1', type: 'harpoons', x: 928, y: 1404 },
  { id: 'h2-o2-1', type: 'o2', x: 928, y: 1340 },
  { id: 'h2-ore-01', type: 'ore', x: 980, y: 1412 },
];
const byId = new Map(spawns.map((s) => [s.id, s]));
const free = () => true;

test('подбор пачки с учётом лимита пояса', () => {
  const belt: Belt = { base: { o2: 3, harpoons: 9 }, packs: [] };
  assert.equal(pickupPack(belt, { id: 'h2-o2-1', kind: 'o2', n: 1 }), false);
  assert.equal(pickupPack(belt, { id: 'h2-harp-1', kind: 'harpoons', n: 2 }), false);
  belt.base.harpoons = 8;
  assert.equal(pickupPack(belt, { id: 'h2-harp-1', kind: 'harpoons', n: 2 }), true);
  assert.equal(total(belt, 'harpoons'), 10);
  assert.equal(foundCount(belt, 'harpoons'), 2);
});

test('use: сначала найденная пачка, затем base с немедленным сохранением; после перезагрузки потраченное не возвращается', () => {
  const storage = memStorage();
  const save = freshSave();
  save.supplies.harpoons = 1;
  writeSave(save, storage);
  const belt: Belt = { base: save.supplies, packs: [] };
  pickupPack(belt, { id: 'h2-harp-1', kind: 'harpoons', n: 2 });
  let saves = 0;
  const onBase = () => { saves += 1; writeSave(save, storage); };
  assert.equal(use(belt, 'harpoons', onBase), 'found');
  assert.equal(use(belt, 'harpoons', onBase), 'found');
  assert.equal(saves, 0);
  assert.equal(use(belt, 'harpoons', onBase), 'base');
  assert.equal(saves, 1);
  assert.equal(use(belt, 'harpoons', onBase), null);
  assert.equal(loadSave(storage).supplies.harpoons, 0);
});

test('провал: пачка с нечётным остатком выкладывается у точки провала один раз, без исходной копии', () => {
  const save = freshSave();
  const belt: Belt = { base: save.supplies, packs: [] };
  pickupPack(belt, { id: 'h2-harp-1', kind: 'harpoons', n: 2 });
  use(belt, 'harpoons', () => {});
  const { returned, consumed } = endDive(belt, false);
  assert.deepEqual(returned, [{ id: 'h2-harp-1', kind: 'harpoons', n: 1 }]);
  assert.deepEqual(consumed, []);
  assert.deepEqual(belt.packs, []);
  assert.deepEqual(belt.base, { o2: 1, harpoons: 0 });
  const placed = applyFailure(save.loot, byId, [], returned, 500, 700, free);
  assert.equal(placed.length, 1);
  assert.deepEqual(save.loot['h2-harp-1'], { s: 'w', x: 500, y: 700, n: 1 });
  const world = worldItems(spawns, save.loot).filter((w) => w.id === 'h2-harp-1');
  assert.equal(world.length, 1);
  assert.equal(world[0].n, 1);
  assert.deepEqual([world[0].x, world[0].y], [500, 700]);
});

test('полностью использованная пачка и использованный баллончик не появляются на исходном месте', () => {
  const save = freshSave();
  const belt: Belt = { base: save.supplies, packs: [] };
  pickupPack(belt, { id: 'h2-harp-1', kind: 'harpoons', n: 2 });
  pickupPack(belt, { id: 'h2-o2-1', kind: 'o2', n: 1 });
  use(belt, 'harpoons', () => {});
  use(belt, 'harpoons', () => {});
  use(belt, 'o2', () => {});
  const { returned, consumed } = endDive(belt, false);
  assert.deepEqual(returned, []);
  assert.deepEqual(consumed.sort(), ['h2-harp-1', 'h2-o2-1']);
  for (const id of consumed) markConsumed(save.loot, id);
  const ids = worldItems(spawns, save.loot).map((w) => w.id);
  assert.deepEqual(ids, ['h2-ore-01']);
});

test('успех: остаток пачки в запас базы ровно один раз, пачка израсходована', () => {
  const save = freshSave();
  const belt: Belt = { base: save.supplies, packs: [] };
  pickupPack(belt, { id: 'h2-harp-1', kind: 'harpoons', n: 2 });
  use(belt, 'harpoons', () => {});
  const r = endDive(belt, true);
  assert.deepEqual(r.merged, { o2: 0, harpoons: 1 });
  assert.deepEqual(r.consumed, ['h2-harp-1']);
  assert.deepEqual(belt.base, { o2: 1, harpoons: 1 });
  const again = endDive(belt, true);
  assert.deepEqual(again.merged, { o2: 0, harpoons: 0 });
  assert.deepEqual(belt.base, { o2: 1, harpoons: 1 });
});

test('inFlight при перезагрузке даёт тот же результат, что обычный провал', () => {
  const direct = freshSave();
  const belt: Belt = { base: direct.supplies, packs: [] };
  pickupPack(belt, { id: 'h2-harp-1', kind: 'harpoons', n: 2 });
  use(belt, 'harpoons', () => {});
  const inFlight = { x: 600, y: 900, cargoIds: ['h2-ore-01'], packs: belt.packs.map((p) => ({ ...p })) };
  const { returned } = endDive(belt, false);
  applyFailure(direct.loot, byId, ['h2-ore-01'], returned, 600, 900, free);
  const viaReload = freshSave();
  applyFailure(viaReload.loot, byId, inFlight.cargoIds, inFlight.packs, inFlight.x, inFlight.y, free);
  assert.deepEqual(viaReload.loot, direct.loot);
});
