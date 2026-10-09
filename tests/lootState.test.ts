import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFailure, checkUniqueIds, markDelivered, markMoved, scatterPositions, worldItems } from '../src/core/lootState.ts';
import type { LootSpawn } from '../src/config/map.ts';
import type { LootRecord } from '../src/core/save.ts';

const spawns: LootSpawn[] = [
  { id: 'a', type: 'shard', x: 10, y: 10 },
  { id: 'b', type: 'harpoons', x: 20, y: 20 },
  { id: 'c', type: 'ore', x: 30, y: 30 },
  { id: 'd', type: 'o2', x: 40, y: 40 },
];
const byId = new Map(spawns.map((s) => [s.id, s]));

test('worldItems: доставленное и израсходованное исчезает, перемещённое лежит на новом месте с остатком', () => {
  const loot: Record<string, LootRecord> = {};
  assert.equal(worldItems(spawns, loot).length, 4);
  assert.equal(worldItems(spawns, loot).find((w) => w.id === 'b')?.n, 2);
  markDelivered(loot, 'a');
  loot.d = { s: 'c' };
  markMoved(loot, 'b', 50.4, 60.6, 1);
  const w = worldItems(spawns, loot);
  assert.deepEqual(w.map((i) => i.id), ['b', 'c']);
  assert.deepEqual([w[0].x, w[0].y, w[0].n], [50, 61, 1]);
});

test('перестановка предметов в конфиге не меняет состояние собранного', () => {
  const loot: Record<string, LootRecord> = { a: { s: 'd' }, c: { s: 'w', x: 1, y: 2 } };
  const ids = (list: LootSpawn[]) => worldItems(list, loot).map((i) => `${i.id}:${i.x},${i.y}`).sort();
  assert.deepEqual(ids(spawns), ids([...spawns].reverse()));
  assert.deepEqual(ids(spawns), ['b:20,20', 'c:1,2', 'd:40,40']);
});

test('scatterPositions даёт свободные различимые точки, не по центру, если он занят', () => {
  const pts = scatterPositions(7, 100, 100, (x, y) => !(x === 100 && y === 100));
  assert.equal(pts.length, 7);
  assert.ok(pts.every((p) => !(p.x === 100 && p.y === 100)));
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    assert.ok(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) >= 18, 'точки не слипаются');
  }
});

test('applyFailure: груз и пачки с остатком перемещены, пустые пачки израсходованы', () => {
  const loot: Record<string, LootRecord> = {};
  const placed = applyFailure(loot, byId, ['a', 'c'], [{ id: 'b', kind: 'harpoons', n: 1 }, { id: 'd', kind: 'o2', n: 0 }], 300, 300, () => true);
  assert.equal(placed.length, 3);
  assert.equal(loot.a.s, 'w');
  assert.equal(loot.c.s, 'w');
  assert.equal(loot.b.s, 'w');
  if (loot.b.s === 'w') {
    assert.equal(loot.b.n, 1);
    assert.ok(Math.hypot(loot.b.x - 300, loot.b.y - 300) < 80, 'пачка рядом с точкой провала');
  }
  assert.deepEqual(loot.d, { s: 'c' });
  const world = worldItems(spawns, loot);
  assert.deepEqual(world.map((w) => w.id).sort(), ['a', 'b', 'c']);
});

test('дубликаты id обнаруживаются', () => {
  assert.deepEqual(checkUniqueIds(spawns), []);
  assert.deepEqual(checkUniqueIds([...spawns, { id: 'a', type: 'shard', x: 0, y: 0 }]), ['a']);
});
