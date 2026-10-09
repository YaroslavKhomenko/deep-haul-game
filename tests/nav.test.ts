import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWallGrid } from '../src/core/grid.ts';
import { buildNav, directionHome } from '../src/core/nav.ts';

// Комната A (слева, с причалом) — коридор — комната B (справа). Стартуем из правого верхнего угла B.
const water = [
  { x: 16, y: 16, w: 80, h: 128 },
  { x: 80, y: 64, w: 160, h: 48 },
  { x: 224, y: 16, w: 80, h: 128 },
];
const grid = buildWallGrid(water, 320, 160);
const dock = { x: 16, y: 16, w: 80, h: 128 };

test('стрелка ведёт к устью коридора, а не напрямую сквозь стену', () => {
  const nav = buildNav(grid, dock, []);
  const dir = directionHome(nav, 280, 24);
  assert.ok(dir, 'путь существует');
  assert.ok(Math.sin(dir!.angle) > 0.2, 'направление вниз — к коридору, не влево сквозь стену');
  assert.ok(dir!.tx <= 240 && dir!.ty >= 64 && dir!.ty <= 112, `цель в устье коридора: ${dir!.tx},${dir!.ty}`);
});

test('внутри коридора стрелка указывает прямо к базе; в комнате A путь короткий', () => {
  const nav = buildNav(grid, dock, []);
  const inCorridor = directionHome(nav, 180, 88);
  assert.ok(inCorridor && Math.abs(Math.sin(inCorridor.angle)) < 0.2 && Math.cos(inCorridor.angle) < 0, 'влево по коридору');
  assert.equal(directionHome(nav, 56, 80), null, 'в причале направления нет');
});

test('закрытая сеть блокирует маршрут, после разреза путь появляется', () => {
  const net = { x: 144, y: 64, w: 16, h: 48 };
  const blocked = buildNav(grid, dock, [net]);
  assert.equal(directionHome(blocked, 280, 24), null);
  const open = buildNav(grid, dock, []);
  assert.ok(directionHome(open, 280, 24));
});

test('габарит: узкий проход в одну клетку непроходим для маршрута', () => {
  const narrow = buildWallGrid([{ x: 16, y: 16, w: 80, h: 128 }, { x: 80, y: 80, w: 160, h: 16 }, { x: 224, y: 16, w: 80, h: 128 }], 320, 160);
  const nav = buildNav(narrow, dock, []);
  assert.equal(directionHome(nav, 280, 80), null);
});
