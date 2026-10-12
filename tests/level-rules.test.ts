import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  arriveAtBase, buyLevelUpgrade, canBuyUpgrade, cutWithKnife, failDive, freshLevelSave, goalText, installComponents,
  loadLevelSave, placeFailedCargo, repairLevelKnife, respawnBase, takeKnife, writeLevelSave,
} from '../src/level/rules.ts';
import type { CargoItem } from '../src/core/cargo.ts';
import type { StorageLike } from '../src/core/save.ts';
import { worldItems } from '../src/core/lootState.ts';
import { LEVEL } from '../src/level/map.ts';

const c = (id: string, type: CargoItem['type'], weight: number): CargoItem => ({ id, type, weight });
const mem = (): StorageLike => { const d: Record<string, string> = {}; return { getItem: (k) => d[k] ?? null, setItem: (k, v) => { d[k] = v; }, removeItem: (k) => { delete d[k]; } }; };
const free = () => true;

test('разгрузка у лодки: золото, припасы, компонент остаётся в связке, база запомнена', () => {
  const s = freshLevelSave();
  const a = arriveAtBase(s, 'boat', [c('h1-sh-01', 'shard', 1), c('h1-ore-01', 'ore', 2), c('w1-crate', 'crate', 2), c('h2-comp-a', 'component', 3)]);
  assert.equal(a.gold, 12);
  assert.equal(a.supplies, 2);
  assert.deepEqual(a.kept.map((k) => k.id), ['h2-comp-a']);
  assert.deepEqual(s.carried, ['h2-comp-a']);
  assert.equal(s.gold, 12);
  assert.equal(s.supplies, 2);
  assert.equal(s.lastSafe, 'boat');
  assert.equal(s.loot['h1-sh-01'].s, 'd');
  assert.equal(s.loot['h2-comp-a'], undefined);
});

test('вход в работающую подстанцию без груза обновляет последнюю безопасную точку; обесточенная — нет', () => {
  const s = freshLevelSave();
  arriveAtBase(s, 'sub', []);
  assert.equal(s.lastSafe, 'boat', 'обесточенная подстанция не база');
  s.substation.restored = true;
  const a = arriveAtBase(s, 'sub', []);
  assert.equal(a.gold, 0);
  assert.equal(s.lastSafe, 'sub');
  assert.equal(respawnBase(s), 'sub');
  arriveAtBase(s, 'boat', []);
  assert.equal(s.lastSafe, 'boat');
});

test('компоненты: первый не включает подстанцию, второй включает и открывает решётку', () => {
  const s = freshLevelSave();
  const cargo = [c('h2-comp-a', 'component', 3), c('h2-ore-01', 'ore', 2)];
  const r1 = installComponents(s, cargo);
  assert.deepEqual(r1, { installed: ['h2-comp-a'], restoredNow: false });
  assert.deepEqual(cargo.map((x) => x.id), ['h2-ore-01']);
  assert.equal(s.netsCut.includes('gate'), false);
  const r2 = installComponents(s, [c('w2-comp-b', 'component', 3)]);
  assert.equal(r2.restoredNow, true);
  assert.equal(s.substation.restored, true);
  assert.equal(s.netsCut.includes('gate'), true);
  assert.equal(s.loot['w2-comp-b'].s, 'd');
});

test('двигатель: на подстанции остаётся в связке, у лодки — ремонт и победа один раз', () => {
  const s = freshLevelSave();
  s.substation.restored = true;
  const atSub = arriveAtBase(s, 'sub', [c('engine', 'engine', 13), c('h3-cr-01', 'crystal', 4)]);
  assert.equal(atSub.gold, 24);
  assert.deepEqual(s.carried, ['engine']);
  assert.equal(s.completed, false);
  const atBoat = arriveAtBase(s, 'boat', atSub.kept);
  assert.equal(atBoat.completedNow, true);
  assert.equal(s.completed, true);
  assert.deepEqual(s.carried, []);
  assert.equal(arriveAtBase(s, 'boat', [c('x', 'engine', 13)]).completedNow, false);
});

test('сценарий: подстанция с двигателем → кислород восстановлен → гибель по пути к лодке → возврат на подстанцию, двигатель в точке провала', () => {
  const s = freshLevelSave();
  s.substation.restored = true;
  s.lastSafe = 'boat';
  const a = arriveAtBase(s, 'sub', [c('engine', 'engine', 13)]);
  assert.equal(s.lastSafe, 'sub');
  const placed = placeFailedCargo(s, a.kept, 690, 800, free);
  assert.equal(failDive(s), 'sub');
  assert.deepEqual(placed.map((p) => [p.id, p.x, p.y]), [['engine', 690, 800]]);
  const world = worldItems(LEVEL.loot, s.loot).find((w) => w.id === 'engine')!;
  assert.deepEqual([world.x, world.y], [690, 800]);
  assert.deepEqual(s.carried, []);
  assert.match(goalText(s, []), /Заберите двигатель там, где он остался/);
});

test('провал: уникальные детали первыми в центр, остальное рядом; перезагрузка (inFlight) даёт тот же результат', () => {
  const cargo = [c('h1-ore-01', 'ore', 2), c('h2-comp-a', 'component', 3), c('h1-sh-01', 'shard', 1)];
  const a = freshLevelSave();
  const pa = placeFailedCargo(a, cargo, 900, 500, free);
  assert.equal(pa[0].id, 'h2-comp-a');
  assert.deepEqual([pa[0].x, pa[0].y], [900, 500]);
  const b = freshLevelSave();
  b.inFlight = { x: 900, y: 500, cargoIds: cargo.map((x) => x.id) };
  placeFailedCargo(b, cargo, b.inFlight.x, b.inFlight.y, free);
  assert.deepEqual(b.loot, a.loot);
  assert.equal(b.inFlight, null);
});

test('покупки: цены 10/22/40 у кислорода, золото не уходит в минус, максимум 3 уровня', () => {
  const s = freshLevelSave();
  s.gold = 31;
  assert.equal(buyLevelUpgrade(s, 'oxygen', 5000), true);
  assert.equal(s.stats.firstPurchaseMs, 5000);
  assert.equal(buyLevelUpgrade(s, 'oxygen'), false);
  assert.equal(s.gold, 21);
  s.gold = 1000;
  buyLevelUpgrade(s, 'oxygen'); buyLevelUpgrade(s, 'oxygen'); buyLevelUpgrade(s, 'oxygen');
  assert.equal(s.upgrades.oxygen, 3);
  assert.equal(canBuyUpgrade(s, 'oxygen').reason, 'max');
  assert.equal(s.gold, 1000 - 22 - 40);
});

test('нож: находка, разрез тратит прочность, при 0 не режет, решётку не режет, ремонт за припасы', () => {
  const s = freshLevelSave();
  assert.equal(cutWithKnife(s, 'net-n1'), false);
  takeKnife(s, 'w1-knife');
  assert.deepEqual(s.knife, { owned: true, durability: 2 });
  assert.equal(cutWithKnife(s, 'gate'), false);
  assert.equal(cutWithKnife(s, 'net-n1'), true);
  assert.equal(cutWithKnife(s, 'net-n2'), true);
  assert.equal(cutWithKnife(s, 'net-n3'), false);
  assert.equal(s.knife.durability, 0);
  assert.equal(repairLevelKnife(s, 2), 0, 'нет припасов');
  s.supplies = 3;
  assert.equal(repairLevelKnife(s, 5), 2);
  assert.equal(s.supplies, 1);
  assert.equal(s.knife.durability, 2);
});

test('цель ведёт по сценарию', () => {
  const s = freshLevelSave();
  assert.match(goalText(s, []), /привезите её к лодке/);
  s.stats.deliveries = 1;
  assert.match(goalText(s, []), /первое улучшение/);
  s.stats.purchases = 1;
  assert.match(goalText(s, []), /нож/);
  takeKnife(s, 'w1-knife');
  assert.match(goalText(s, []), /Разрежьте сеть/);
  cutWithKnife(s, 'net-n1');
  assert.match(goalText(s, [c('h2-comp-a', 'component', 3)]), /компоненты 0\/2 \(1 в грузе\)/);
  cutWithKnife(s, 'net-n2');
  assert.match(goalText(s, []), /компоненты 0\/2/);
  s.substation.restored = true;
  assert.match(goalText(s, []), /Почините нож/);
  s.knife.durability = 1;
  assert.match(goalText(s, []), /двигатель/);
  assert.match(goalText(s, [c('engine', 'engine', 13)]), /Доставьте двигатель/);
});

test('сохранение: последняя база, детали в связке и состояние лута переживают перезагрузку', () => {
  const st = mem();
  const s = freshLevelSave();
  s.substation.restored = true;
  arriveAtBase(s, 'sub', [c('engine', 'engine', 13)]);
  writeLevelSave(s, st);
  const l = loadLevelSave(st);
  assert.equal(l.lastSafe, 'sub');
  assert.deepEqual(l.carried, ['engine']);
  assert.equal(l.substation.restored, true);
});
