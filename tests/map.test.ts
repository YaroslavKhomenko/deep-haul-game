import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP } from '../src/config/map.ts';
import { buildWallGrid, isWallAt } from '../src/core/grid.ts';
import { checkUniqueIds } from '../src/core/lootState.ts';

const grid = buildWallGrid(MAP.water, MAP.width, MAP.height);

test('id предметов и сетей уникальны', () => {
  assert.deepEqual(checkUniqueIds(MAP.loot), []);
  assert.equal(new Set(MAP.nets.map((n) => n.id)).size, MAP.nets.length);
});

test('весь лут лежит в воде (с запасом на размер спрайта)', () => {
  const bad = MAP.loot.filter((l) => [[0, 0], [6, 0], [-6, 0], [0, 6], [0, -6]].some(([dx, dy]) => isWallAt(grid, l.x + dx, l.y + dy)));
  assert.deepEqual(bad.map((b) => b.id), []);
});

test('предметы не слипаются (≥ 20 px) и причал, спавн, существа — в воде', () => {
  for (let i = 0; i < MAP.loot.length; i++) for (let j = i + 1; j < MAP.loot.length; j++) {
    const a = MAP.loot[i], b = MAP.loot[j];
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 20, `${a.id} и ${b.id} слишком близко`);
  }
  assert.equal(isWallAt(grid, MAP.spawn.x, MAP.spawn.y), false);
  for (const c of MAP.creatures) assert.equal(isWallAt(grid, c.x, c.y), false, c.kind);
  for (const n of MAP.nets) {
    for (let y = n.y + 8; y < n.y + n.h; y += 16) assert.equal(isWallAt(grid, n.x + 8, y), false, `сеть ${n.id} в стене`);
  }
});
