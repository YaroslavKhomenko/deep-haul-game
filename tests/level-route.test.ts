// Модельный прогон уровня: жадный игрок планирует вылазки по реальной карте (BFS по клеткам воды),
// учитывая кислород, скорость с грузом, сети и прочность ножа, припасы, подстанцию и двигатель.
// Каждая стратегия должна дойти до ремонта лодки без перезапуска.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, type ItemType } from '../src/config/balance.ts';
import { COMPONENTS_NEEDED, CRATE_SUPPLIES, GATE_ID, LEVEL_KNIFE, LEVEL_UPGRADES, upgradeValue, type LevelUpgradeId } from '../src/level/config.ts';
import { LEVEL } from '../src/level/map.ts';
import { buildWallGrid } from '../src/core/grid.ts';
import { buildPassable } from '../src/core/nav.ts';
import { bfsFrom, levelSpeed, pathPx, stepsTo, type PassGrid } from '../src/level/route.ts';

type P = { x: number; y: number };
type Base = 'boat' | 'sub';
const grid = buildWallGrid(LEVEL.water, LEVEL.width, LEVEL.height);
const BOAT: P = LEVEL.bases.boat.spawn;
const SUB: P = LEVEL.bases.sub.spawn;
const PICK_S = 1.5;
const CUT_S = LEVEL_KNIFE.cutTime;
const BASE_S = 6;
const MARGIN = 0.85;

const passCache = new Map<string, PassGrid>();
const fieldCache = new Map<string, Int32Array>();
function dist(a: P, b: P, open: ReadonlySet<string>): number {
  const closed = LEVEL.nets.filter((n) => !open.has(n.id));
  const ck = closed.map((n) => n.id).sort().join(',');
  let g = passCache.get(ck);
  if (!g) {
    g = { cols: grid.cols, rows: grid.rows, passable: buildPassable(grid, closed) };
    passCache.set(ck, g);
  }
  const fk = `${ck}|${a.x},${a.y}`;
  let f = fieldCache.get(fk);
  if (!f) {
    f = bfsFrom(g, a.x, a.y);
    fieldCache.set(fk, f);
  }
  const s = stepsTo(g, f, b.x, b.y);
  return s < 0 ? Infinity : pathPx(s);
}

// Сети, которые нужно открыть, чтобы добраться до точки от лодки.
const allOpen = new Set(LEVEL.nets.map((n) => n.id));
function requiredNets(p: P): string[] {
  const req: string[] = [];
  for (const n of LEVEL.nets) {
    const open = new Set(allOpen);
    open.delete(n.id);
    if (dist(BOAT, p, open) === Infinity) req.push(n.id);
  }
  return req;
}

interface WorldItem { id: string; type: ItemType; x: number; y: number; req: string[] }
interface Sim {
  up: Record<LevelUpgradeId, number>;
  gold: number; supplies: number; goldEarned: number; suppliesUsed: number;
  knife: { owned: boolean; dur: number };
  open: Set<string>;
  installed: number; restored: boolean;
  world: Map<string, WorldItem>;
  lastSafe: Base;
  carryEngine: boolean;
  done: boolean;
  trips: number; fails: number; time: number;
  firstPurchaseTrip: number | null; restoredTrip: number | null;
  purchases: string[];
  log: string[];
}

interface Strategy {
  name: string;
  order: LevelUpgradeId[];
  optionalFirst?: boolean;
  failEngine?: 'leg1' | 'leg2';
}

const NORMAL: LevelUpgradeId[] = ['oxygen', 'tow', 'lantern', 'fins', 'oxygen', 'tow', 'fins', 'oxygen', 'tow', 'lantern', 'fins', 'lantern'];
const LANTERN_FINS_FIRST: LevelUpgradeId[] = ['lantern', 'fins', 'lantern', 'fins', 'lantern', 'fins', 'oxygen', 'tow', 'oxygen', 'tow', 'oxygen', 'tow'];

function newSim(): Sim {
  const world = new Map<string, WorldItem>();
  for (const l of LEVEL.loot) world.set(l.id, { id: l.id, type: l.type, x: l.x, y: l.y, req: requiredNets(l) });
  return {
    up: { oxygen: 0, lantern: 0, fins: 0, tow: 0 }, gold: 0, supplies: 0, goldEarned: 0, suppliesUsed: 0,
    knife: { owned: false, dur: 0 }, open: new Set(), installed: 0, restored: false, world, lastSafe: 'boat',
    carryEngine: false, done: false, trips: 0, fails: 0, time: 0, firstPurchaseTrip: null, restoredTrip: null, purchases: [], log: [],
  };
}

const weightOf = (t: ItemType) => ITEMS[t].weight;
const norm = (s: Sim) => upgradeValue('tow', s.up.tow);
const speed = (s: Sim, w: number) => levelSpeed(s.up, w);
const workingBases = (restored: boolean): [Base, P][] => (restored ? [['boat', BOAT], ['sub', SUB]] : [['boat', BOAT]]);

function shop(s: Sim, st: Strategy): void {
  const bought: Record<LevelUpgradeId, number> = { oxygen: 0, lantern: 0, fins: 0, tow: 0 };
  for (const id of st.order) {
    bought[id] += 1;
    if (s.up[id] >= bought[id]) continue;
    const cost = LEVEL_UPGRADES[id].costs[s.up[id]];
    if (cost === undefined) continue;
    if (s.gold < cost) break;
    s.gold -= cost;
    s.up[id] += 1;
    s.purchases.push(`${id}${s.up[id]}`);
    if (s.firstPurchaseTrip === null) s.firstPurchaseTrip = s.trips;
  }
  // ремонт: если есть закрытые сети, которые игрок собирается резать
  const wanted = LEVEL.nets.filter((n) => n.id !== GATE_ID && !s.open.has(n.id) && (st.optionalFirst || !LEVEL.optionalNets.includes(n.id)));
  if (s.knife.owned && s.knife.dur < LEVEL_KNIFE.max && wanted.length) {
    const n = Math.min(LEVEL_KNIFE.max - s.knife.dur, Math.floor(s.supplies / LEVEL_KNIFE.repairCost));
    s.knife.dur += n;
    s.supplies -= n * LEVEL_KNIFE.repairCost;
    s.suppliesUsed += n * LEVEL_KNIFE.repairCost;
  }
}

function value(s: Sim, it: WorldItem, st: Strategy): number {
  const def = ITEMS[it.type];
  let v = 0;
  if (it.type === 'knife') v = s.knife.owned ? 0 : 120;
  else if (it.type === 'component') v = s.restored ? 0 : 80;
  else if (it.type === 'engine') v = s.restored ? 600 : 0;
  else if (it.type === 'crate') v = s.supplies < 4 ? 14 : 4;
  else v = def.price;
  if (st.optionalFirst && it.req.some((n) => LEVEL.optionalNets.includes(n) && !s.open.has(n))) v *= 5;
  return v;
}

function trip(s: Sim, st: Strategy): void {
  const start: Base = s.lastSafe === 'sub' && s.restored ? 'sub' : 'boat';
  let pos: P = start === 'sub' ? SUB : BOAT;
  const o2 = upgradeValue('oxygen', s.up.oxygen) * MARGIN;
  let t = 0;
  let W = s.carryEngine ? weightOf('engine') : 0;
  const open = new Set(s.open);
  let dur = s.knife.dur;
  const picks: WorldItem[] = [];
  let comps = 0;
  s.trips += 1;

  const backTime = (from: P, w: number, compsCarried: number): number => {
    if (compsCarried > 0 && !s.restored) {
      const toSub = dist(from, SUB, open) / speed(s, w);
      const restoresNow = s.installed + compsCarried >= COMPONENTS_NEEDED;
      return toSub + (restoresNow ? 0 : dist(SUB, BOAT, open) / speed(s, w - compsCarried * weightOf('component')));
    }
    return Math.min(...workingBases(s.restored).map(([, b]) => dist(from, b, open) / speed(s, w)));
  };

  // От лодки в дальнюю зону можно попасть только через зону подстанции: вход в неё завершает вылазку.
  const farWanted = s.restored && start === 'boat' && !s.carryEngine && [...s.world.values()].some((it) => it.req.includes(GATE_ID) && value(s, it, st) > 0);
  if (farWanted) {
    const tt = dist(BOAT, SUB, s.open) / speed(s, 0);
    s.lastSafe = 'sub';
    s.time += tt + BASE_S;
    s.log.push(`#${s.trips} boat→sub ${tt.toFixed(0)}с: переход к подстанции`);
    return;
  }

  // Двигатель уже в связке: везём к лодке.
  if (!s.carryEngine) {
    for (;;) {
      let best: { it: WorldItem; cut: string[]; reach: number; score: number } | null = null;
      for (const it of s.world.values()) {
        if (picks.includes(it)) continue;
        const v = value(s, it, st);
        if (v <= 0) continue;
        if (it.req.includes(GATE_ID) && !s.restored) continue;
        const cut = it.req.filter((n) => !open.has(n));
        if (cut.some((n) => n === GATE_ID) || (cut.length && (!s.knife.owned && !picks.some((p) => p.type === 'knife')))) continue;
        const durAvail = picks.some((p) => p.type === 'knife') && !s.knife.owned ? LEVEL_KNIFE.max : dur;
        if (cut.length > durAvail) continue;
        const w = weightOf(it.type);
        if (it.type === 'engine' ? W + w > 2 * norm(s) : w > 0 && W + w > norm(s)) continue;
        const openWith = new Set([...open, ...cut]);
        const d = dist(pos, it, openWith);
        if (!Number.isFinite(d)) continue;
        const reach = d / speed(s, W) + cut.length * CUT_S + PICK_S;
        const compsAfter = comps + (it.type === 'component' ? 1 : 0);
        for (const n of cut) open.add(n);
        const back = backTime(it, W + w, compsAfter);
        for (const n of cut) if (!s.open.has(n) && !picks.some((p) => p.req.includes(n))) open.delete(n);
        if (t + reach + back > o2) continue;
        const score = v / reach;
        if (!best || score > best.score) best = { it, cut, reach, score };
      }
      if (!best) break;
      for (const n of best.cut) {
        open.add(n);
        if (!(picks.some((p) => p.type === 'knife') && !s.knife.owned)) dur -= 1;
        else dur = LEVEL_KNIFE.max - 1;
      }
      t += best.reach;
      pos = best.it;
      picks.push(best.it);
      if (best.it.type === 'knife') { s.knife.owned = true; dur = Math.max(dur, LEVEL_KNIFE.max - 0); }
      W += weightOf(best.it.type);
      if (best.it.type === 'component') comps += 1;
      if (best.it.type === 'engine') break;
    }
  }

  // Сценарий 4а: гибель с двигателем между камерой двигателя и подстанцией.
  const engineNow = picks.some((p) => p.type === 'engine') || s.carryEngine;
  if (st.failEngine === 'leg1' && picks.some((p) => p.type === 'engine') && s.fails === 0) {
    const fail: P = { x: 1280, y: 1500 };
    for (const p of picks) s.world.set(p.id, { ...p, x: fail.x, y: fail.y });
    s.knife.dur = dur;
    for (const n of open) s.open.add(n);
    s.fails += 1;
    s.time += t + BASE_S;
    s.log.push(`#${s.trips} гибель с двигателем у (${fail.x},${fail.y}); возврат: ${s.lastSafe}`);
    assert.equal(s.lastSafe, 'sub', 'вылазка к двигателю начинается с подстанции — туда и возврат');
    return;
  }
  // Сценарий 4б: пришёл на подстанцию с двигателем, восстановил кислород, погиб по пути к лодке.
  if (st.failEngine === 'leg2' && s.carryEngine && s.fails === 0) {
    const fail: P = { x: 688, y: 800 };
    s.world.set('engine', { id: 'engine', type: 'engine', x: fail.x, y: fail.y, req: requiredNets(fail) });
    s.carryEngine = false;
    s.fails += 1;
    s.time += dist(SUB, fail, open) / speed(s, W) + BASE_S;
    s.log.push(`#${s.trips} гибель с двигателем по пути к лодке у (${fail.x},${fail.y}); возврат: ${s.lastSafe}`);
    assert.equal(s.lastSafe, 'sub', 'после захода на подстанцию возврат на подстанцию');
    return;
  }

  // Возврат.
  let end: Base;
  if (comps > 0 && !s.restored) {
    t += dist(pos, SUB, open) / speed(s, W);
    s.installed += comps;
    W -= comps * weightOf('component');
    if (s.installed >= COMPONENTS_NEEDED) {
      s.restored = true;
      s.open.add(GATE_ID);
      open.add(GATE_ID);
      s.restoredTrip = s.trips;
      end = 'sub';
    } else {
      t += dist(SUB, BOAT, open) / speed(s, W);
      end = 'boat';
    }
  } else if (engineNow) {
    // с двигателем — к ближайшей работающей базе; с подстанции — к лодке
    const opts = workingBases(s.restored).filter(([b]) => !(s.carryEngine && b === 'sub'));
    const [b, p] = opts.reduce((a, c) => (dist(pos, c[1], open) < dist(pos, a[1], open) ? c : a));
    t += dist(pos, p, open) / speed(s, W);
    end = b;
  } else {
    const [b, p] = workingBases(s.restored).reduce((a, c) => (dist(pos, c[1], open) < dist(pos, a[1], open) ? c : a));
    t += dist(pos, p, open) / speed(s, W);
    end = b;
  }
  assert.ok(t <= upgradeValue('oxygen', s.up.oxygen), `вылазка #${s.trips} (${st.name}) не укладывается в кислород: ${t.toFixed(1)} с`);

  // Разгрузка.
  for (const n of open) s.open.add(n);
  s.knife.dur = dur;
  for (const p of picks) {
    s.world.delete(p.id);
    const def = ITEMS[p.type];
    if (def.kind === 'valuable') { s.gold += def.price; s.goldEarned += def.price; }
    if (def.kind === 'crate') s.supplies += CRATE_SUPPLIES;
  }
  s.lastSafe = end;
  if (engineNow) {
    if (end === 'boat') s.done = true;
    else s.carryEngine = true;
  }
  s.time += t + BASE_S;
  s.log.push(`#${s.trips} ${start}→${end} ${t.toFixed(0)}с: ${picks.map((p) => p.id).join(', ') || (s.carryEngine || engineNow ? 'двигатель' : '—')} | золото ${s.gold} припасы ${s.supplies} нож ${s.knife.owned ? s.knife.dur : '-'} ${JSON.stringify(s.up)}`);
}

function run(st: Strategy): Sim {
  const s = newSim();
  let idle = 0;
  while (!s.done && s.trips < 60) {
    shop(s, st);
    const before = `${s.world.size}|${s.gold}|${s.carryEngine}|${s.lastSafe}|${s.fails}`;
    trip(s, st);
    const after = `${s.world.size}|${s.gold}|${s.carryEngine}|${s.lastSafe}|${s.fails}`;
    idle = before === after ? idle + 1 : 0;
    if (idle >= 2) break;
  }
  return s;
}

const strategies: Strategy[] = [
  { name: 'обычный порядок', order: NORMAL },
  { name: 'сначала Фонарь и Ласты', order: LANTERN_FINS_FIRST },
  { name: 'сначала необязательные сети', order: NORMAL, optionalFirst: true },
  { name: 'гибель с двигателем до подстанции', order: NORMAL, failEngine: 'leg1' },
  { name: 'гибель с двигателем после подстанции', order: NORMAL, failEngine: 'leg2' },
];

for (const st of strategies) {
  test(`стратегия «${st.name}» доходит до ремонта лодки без перезапуска`, () => {
    const s = run(st);
    const summary = `${st.name}: вылазок ${s.trips}, неудач ${s.fails}, первая покупка после вылазки ${s.firstPurchaseTrip}, подстанция на вылазке ${s.restoredTrip}, модельное время ${(s.time / 60).toFixed(1)} мин, золото ${s.goldEarned}, припасы на ремонт ${s.suppliesUsed}, покупки ${s.purchases.join(' ')}`;
    if (!s.done || process.env.SIM_LOG) console.log(s.log.join('\n'));
    assert.ok(s.done, `не завершено: ${summary}`);
    console.log(summary);
    assert.ok(s.firstPurchaseTrip !== null && s.firstPurchaseTrip <= 2, 'первая покупка — не позже второй вылазки');
    assert.ok(s.restoredTrip !== null, 'подстанция восстановлена');
  });
}

test('двигатель: при Буксире 0 не поднять, при Буксире 2 скорость 67%, обе ноги доставки укладываются в Кислород 2 при Ластах 1', () => {
  const up = { oxygen: 2, lantern: 1, fins: 1, tow: 0 };
  assert.ok(weightOf('engine') > 2 * upgradeValue('tow', 0));
  up.tow = 2;
  const v = levelSpeed(up, weightOf('engine'));
  assert.ok(Math.abs(v / upgradeValue('fins', 1) - 2 / 3) < 0.01);
  const engine = LEVEL.loot.find((l) => l.id === 'engine')!;
  const leg1 = dist(SUB, engine, allOpen) / levelSpeed(up, 0) + CUT_S + PICK_S + dist(engine, SUB, allOpen) / v;
  const leg2 = dist(SUB, BOAT, allOpen) / v;
  console.log(`доставка двигателя: подстанция→двигатель ${dist(SUB, engine, allOpen).toFixed(0)} px, подстанция→лодка ${dist(SUB, BOAT, allOpen).toFixed(0)} px; нога 1 ${leg1.toFixed(1)} с, нога 2 ${leg2.toFixed(1)} с при ${v.toFixed(0)} px/с`);
  assert.ok(leg1 <= upgradeValue('oxygen', 2) * MARGIN);
  assert.ok(leg2 <= upgradeValue('oxygen', 2) * MARGIN);
});

test('путь в дальнюю зону проходит через зону подстанции: обойти её нельзя', () => {
  const z = LEVEL.bases.sub.zone;
  const passable = buildPassable(grid, []);
  const g = { cols: grid.cols, rows: grid.rows, passable };
  const blocked = new Uint8Array(passable);
  for (let cy = Math.floor(z.y / 16); cy < Math.ceil((z.y + z.h) / 16); cy++) {
    for (let cx = Math.floor(z.x / 16); cx < Math.ceil((z.x + z.w) / 16); cx++) blocked[cy * grid.cols + cx] = 0;
  }
  const engine = LEVEL.loot.find((l) => l.id === 'engine')!;
  const withZone = bfsFrom(g, BOAT.x, BOAT.y);
  assert.ok(stepsTo(g, withZone, engine.x, engine.y) > 0);
  const gb = { cols: grid.cols, rows: grid.rows, passable: blocked };
  assert.equal(stepsTo(gb, bfsFrom(gb, BOAT.x, BOAT.y), engine.x, engine.y), -1);
});

test('минимальный набор Кислород 1–2, Буксир 1–2, Ласты 1, Фонарь 1 стоит 98 золота; полный максимум 338', () => {
  const sum = (id: LevelUpgradeId, n: number) => LEVEL_UPGRADES[id].costs.slice(0, n).reduce((a, b) => a + b, 0);
  assert.equal(sum('oxygen', 2) + sum('tow', 2) + sum('fins', 1) + sum('lantern', 1), 98);
  assert.equal((['oxygen', 'tow', 'fins', 'lantern'] as LevelUpgradeId[]).reduce((a, id) => a + sum(id, 3), 0), 338);
});
