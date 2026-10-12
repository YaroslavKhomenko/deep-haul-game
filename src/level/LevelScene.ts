// Мир прототипа уровня: лодка на поверхности, тёмная пещера, связка находок, сети и нож, подстанция, двигатель.
// Упрощённая копия DiveScene песочницы без существ, гарпуна, баллончиков и кораллов.
import Phaser from 'phaser';
import { ITEMS, LIGHT, type ItemType } from '../config/balance.ts';
import { canPick, cargoValue, cargoWeight, isOverloaded } from '../core/cargo.ts';
import { newDive, resolve, tick } from '../core/dive.ts';
import { markMoved } from '../core/lootState.ts';
import { normalizeInput, speedMultiplier } from '../core/movement.ts';
import { buildNav, directionHome, type NavGrid } from '../core/nav.ts';
import { castLight, hasLineOfSight } from '../core/visibility.ts';
import { BarrierManager, type Net } from '../game/Barriers.ts';
import { buildCave, type Cave } from '../game/CaveRenderer.ts';
import { LootManager, type LootEntity } from '../game/Loot.ts';
import { Player } from '../game/Player.ts';
import { Tether } from '../game/Tether.ts';
import type { PauseConfig } from '../ui/pause.ts';
import { COMPONENTS_NEEDED, CRATE_SUPPLIES, GATE_ID, LEVEL_KNIFE, upgradeValue, type BaseId } from './config.ts';
import { LEVEL, inLevelRect } from './map.ts';
import {
  arriveAtBase, cutWithKnife, failDive, goalText, installComponents, itemPurpose, placeFailedCargo, resetLevelSave, takeKnife,
  type LevelDiveLog,
} from './rules.ts';
import { levelSpeed, oxygenWarning, pathPx, type O2Warn } from './route.ts';
import { levelState as S, newSortie, persistLevel } from './state.ts';

export interface Floater { x: number; y: number; text: string; color: string; born: number }
export interface CargoGroup { type: ItemType; name: string; count: number; weight: number }

export interface LevelHudInfo {
  goal: string;
  message: { text: string; until: number; color: string } | null;
  nearest: { x: number; y: number; title: string; sub: string; hint: string } | null;
  weight: number;
  norm: number;
  speedPct: number;
  cargoValue: number;
  overloaded: boolean;
  overloadRatio: number;
  lastItemName: string;
  groups: CargoGroup[];
  lightRadius: number;
  lightPoly: number[];
  floaters: Floater[];
  home: { angle: number; base: BaseId; returnSec: number } | null;
  warn: O2Warn;
  inBase: boolean;
  dock: { fade: number; dark: boolean };
  knife: string;
}

export type LevelMode = 'base' | 'diving' | 'docking';

const zoomFor = (h: number) => Phaser.Math.Clamp(Math.floor(h / 300), 2, 4);
/** Радиусы света баз в мире (HUD стирает тьму теми же радиусами). */
export const LIT = { boat: 230, sub: 150 };
const VISIBLE_FRACTION = 0.85;

export class LevelScene extends Phaser.Scene {
  player!: Player;
  cave!: Cave;
  loot!: LootManager;
  tether!: Tether;
  barriers!: BarrierManager;
  mode: LevelMode = 'diving';
  hud: LevelHudInfo = {
    goal: '', message: null, nearest: null, weight: 0, norm: 6, speedPct: 100, cargoValue: 0, overloaded: false, overloadRatio: 0,
    lastItemName: '', groups: [], lightRadius: 70, lightPoly: [], floaters: [], home: null, warn: 'ok', inBase: true,
    dock: { fade: 0, dark: false }, knife: '',
  };
  touchInput = { x: 0, y: 0 };
  private touchActions = new Set<string>();
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private navBoat!: NavGrid;
  private navSub: NavGrid | null = null;
  private bg!: Phaser.GameObjects.TileSprite;
  private mg!: Phaser.GameObjects.TileSprite;
  private subSprite!: Phaser.GameObjects.Image;
  private subGlow!: Phaser.GameObjects.Image;
  private subZoneRect!: Phaser.GameObjects.Rectangle;
  private zoomBase = 2;
  private inFlightTimer = 0;
  private bubbleTimer = 0;
  private followOff = new Phaser.Math.Vector2();
  private inSubBefore = false;

  constructor() {
    super('Level');
  }

  create(): void {
    const L = LEVEL;
    this.physics.world.setBounds(0, L.surfaceY, L.width, L.height - L.surfaceY);
    this.bg = this.add.tileSprite(0, 0, 480, 270, 'background').setOrigin(0).setDepth(0);
    this.mg = this.add.tileSprite(0, 0, 480, 270, 'midground').setOrigin(0).setDepth(1).setAlpha(0.9);
    // Небо над бухтой и линия поверхности
    const sky = this.add.graphics().setDepth(3);
    sky.fillGradientStyle(0x9fd8ef, 0x9fd8ef, 0xd9f2fb, 0xd9f2fb, 1);
    sky.fillRect(L.sky.x, L.sky.y, L.sky.w, L.sky.h);
    this.add.rectangle(L.sky.x + L.sky.w / 2, L.surfaceY + 1, L.sky.w, 3, 0xeafcff, 0.85).setDepth(9);
    this.cave = buildCave(this, L, L.sky);
    for (const d of L.decor) this.add.image(d.x, d.y, 'props', d.frame).setOrigin(0.5, 1).setDepth(5).setFlipX(!!d.flip);

    // Лодка и её зона («белый квадрат»)
    const boat = L.bases.boat;
    this.add.rectangle(boat.zone.x + boat.zone.w / 2, boat.zone.y + boat.zone.h / 2, boat.zone.w, boat.zone.h, 0xdff6ff, 0.22).setDepth(6);
    this.add.image(boat.sprite.x, boat.sprite.y, 'boat').setOrigin(0.5, 0.7).setDepth(8);
    // Подстанция
    const sub = L.bases.sub;
    this.subZoneRect = this.add.rectangle(sub.zone.x + sub.zone.w / 2, sub.zone.y + sub.zone.h / 2, sub.zone.w, sub.zone.h, 0xdff6ff, 0.16).setDepth(6);
    this.subGlow = this.add.image(sub.sprite.x, sub.sprite.y - 30, 'glow-teal').setScale(4).setDepth(7).setBlendMode(Phaser.BlendModes.ADD);
    this.subSprite = this.add.image(sub.sprite.x, sub.sprite.y, 'substation-off').setOrigin(0.5, 1).setDepth(8);
    this.applySubstationLook();

    this.player = new Player(this, boat.spawn.x, boat.spawn.y);
    this.loot = new LootManager(this, L.loot);
    this.tether = new Tether(this);
    this.barriers = new BarrierManager(this);
    this.physics.add.collider(this.player, this.cave.layer);
    this.physics.add.collider(this.player, this.barriers.netGroup);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, L.width, L.height);
    this.zoomBase = zoomFor(this.scale.height);
    cam.setZoom(this.zoomBase);
    cam.startFollow(this.player, true, 0.12, 0.12);
    cam.setBackgroundColor('#000000');
    this.scale.on(Phaser.Scale.Events.RESIZE, (gs: Phaser.Structs.Size) => {
      this.zoomBase = zoomFor(gs.height);
      if (this.mode === 'diving') cam.setZoom(this.zoomBase);
    });

    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,E,Q,ONE,TWO,THREE,FOUR,FIVE,SIX,SEVEN,EIGHT,NINE') as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointerDown(p));

    // Мир из сохранения
    const sv = S.save;
    this.barriers.spawnAll(sv.netsCut, L.nets, []);
    this.loot.spawnFromSave(sv.loot);
    for (const id of sv.carried) {
      const e = this.loot.byId.get(id);
      if (!e) continue;
      e.state = 'cargo';
      e.sprite.setVisible(false);
      S.cargo.push({ id, type: e.type, weight: ITEMS[e.type].weight });
    }
    this.handleInFlight();
    this.rebuildNav();

    if (sv.stats.dives === 0 && !sv.inFlight && sv.stats.deliveries === 0) {
      // Первый запуск: сразу в воде у лодки, обучение — подсказками по ситуации
      this.mode = 'diving';
      S.base = 'boat';
      this.placeAt('boat');
      this.time.delayedCall(400, () => this.hint('start', 'WASD или стрелки — плыть. Под лодкой вход в пещеру: плывите вниз и ищите находки.'));
    } else {
      S.base = sv.completed ? 'boat' : (sv.lastSafe === 'sub' && sv.substation.restored ? 'sub' : 'boat');
      this.placeAt(S.base);
      this.openBase();
    }
  }

  // ---------------- Базы и вылазки ----------------

  private placeAt(base: BaseId): void {
    const sp = LEVEL.bases[base].spawn;
    this.player.setPosition(sp.x, sp.y);
    this.player.setVelocity(0, 0);
    this.tether.reset(sp.x, sp.y);
    S.dive = newDive(upgradeValue('oxygen', S.save.upgrades.oxygen));
    this.cameras.main.centerOn(sp.x, sp.y);
  }

  private openBase(): void {
    this.mode = 'base';
    this.player.frozen = true;
    this.hud.dock = { fade: 1, dark: false };
    if (!this.scene.isActive('LevelBase')) this.scene.launch('LevelBase');
  }

  /** «Нырнуть» на экране базы. */
  startSortie(): void {
    if (this.mode !== 'base') return;
    if (this.scene.isActive('LevelBase')) this.scene.stop('LevelBase');
    this.mode = 'diving';
    this.player.frozen = false;
    this.hud.dock = { fade: 0, dark: false };
    this.tweens.add({ targets: this.cameras.main, zoom: this.zoomBase, duration: 300, ease: 'Sine.Out' });
    S.dive = newDive(upgradeValue('oxygen', S.save.upgrades.oxygen));
    this.tether.reset(this.player.x, this.player.y);
  }

  /** Пауза → «Вернуться на базу»: как провал, груз остаётся здесь. */
  abortSortie(): void {
    if (this.mode !== 'diving' || !S.dive.active) return;
    this.beginDocking('abort', S.base);
  }

  private beginDocking(end: 'success' | 'oxygen' | 'abort', base: BaseId): void {
    this.mode = 'docking';
    this.player.frozen = true;
    this.player.setVelocity(0, 0);
    const success = end === 'success';
    this.hud.dock = { fade: 1, dark: !success };
    this.tweens.add({ targets: this.cameras.main, zoom: this.zoomBase * 1.12, duration: 500, ease: 'Sine.Out' });
    this.time.delayedCall(success ? 450 : 650, () => this.finishSortie(end, base));
    this.time.delayedCall(success ? 950 : 1150, () => {
      this.mode = 'base';
      if (!this.scene.isActive('LevelBase')) this.scene.launch('LevelBase');
    });
  }

  private finishSortie(end: 'success' | 'oxygen' | 'abort' | 'reload', base: BaseId): void {
    const sv = S.save;
    const elapsed = S.dive.elapsed;
    const from = S.current.from;
    let arrival = null;
    let placed = 0;
    let failDepth = 0;
    let at: BaseId;
    if (end === 'success') {
      arrival = arriveAtBase(sv, base, S.cargo);
      for (const id of arrival.deliveredIds) {
        const e = this.loot.byId.get(id);
        if (e) e.state = 'gone';
      }
      S.cargo = arrival.kept.slice();
      if (arrival.completedNow) sv.stats.completedMs = sv.stats.playMs;
      at = base;
    } else {
      const fx = this.player.x, fy = this.player.y;
      failDepth = Math.round((fy - LEVEL.surfaceY) / 10);
      const items = placeFailedCargo(sv, S.cargo, fx, fy, (x, y) => this.isFreeSpot(x, y, fx, fy));
      this.loot.placeWorld(items);
      placed = items.length;
      S.cargo = [];
      at = failDive(sv);
    }
    sv.stats.dives += 1;
    const log: LevelDiveLog = {
      n: sv.stats.dives, from, to: at, result: end, durationS: Math.round(elapsed),
      gold: arrival?.gold ?? 0, supplies: arrival?.supplies ?? 0, delivered: arrival?.counts ?? {}, installed: S.current.installed,
      kept: arrival?.kept.map((k) => k.type) ?? [], placed, purchases: S.current.purchases, repairs: S.current.repairs,
      minO2: Number.isFinite(S.current.minO2) ? Math.round(S.current.minO2) : 0, notes: S.current.notes,
    };
    if (end !== 'success') log.notes.push(`груз (${placed}) остался на глубине ${failDepth} м`);
    sv.log.push(log);
    S.last = { kind: end, arrival, installed: S.current.installed, restoredNow: S.current.restored, placed, failDepthM: failDepth, base: at };
    S.base = at;
    S.current = newSortie(at);
    sv.inFlight = null;
    persistLevel();
    this.placeAt(at);
    this.hud.message = null;
    this.hud.nearest = null;
  }

  /** Перезагрузка в активной вылазке = провал в сохранённой точке. */
  private handleInFlight(): void {
    const sv = S.save;
    const f = sv.inFlight;
    if (!f) return;
    const cargo = f.cargoIds.map((id) => {
      const e = this.loot.byId.get(id);
      return e ? { id, type: e.type, weight: ITEMS[e.type].weight } : null;
    }).filter((c): c is NonNullable<typeof c> => !!c);
    for (const c of cargo) {
      const e = this.loot.byId.get(c.id);
      if (e) e.state = 'cargo';
    }
    const items = placeFailedCargo(sv, cargo, f.x, f.y, (x, y) => this.isFreeSpot(x, y, f.x, f.y));
    this.loot.placeWorld(items);
    S.cargo = [];
    const at = failDive(sv);
    sv.stats.dives += 1;
    sv.log.push({
      n: sv.stats.dives, from: sv.lastSafe, to: at, result: 'reload', durationS: 0, gold: 0, supplies: 0, delivered: {}, installed: 0,
      kept: [], placed: items.length, purchases: [], repairs: 0, minO2: 0, notes: [`перезагрузка во время вылазки: груз (${items.length}) остался в точке ${f.x},${f.y}`],
    });
    S.last = { kind: 'reload', arrival: null, installed: 0, restoredNow: false, placed: items.length, failDepthM: Math.round((f.y - LEVEL.surfaceY) / 10), base: at };
    persistLevel();
  }

  private persistInFlight(): void {
    if (this.mode !== 'diving' || !S.dive.active) return;
    S.save.inFlight = { x: Math.round(this.player.x), y: Math.round(this.player.y), cargoIds: S.cargo.map((c) => c.id) };
    persistLevel();
  }

  /** Свободная точка для выпавшего груза: вода, не занято, видно из точки провала, вне баз и закрытых сетей. */
  private isFreeSpot(x: number, y: number, fromX: number, fromY: number): boolean {
    if (!this.cave.isWaterRect(x - 8, y - 8, 16, 16) || this.loot.isOccupied(x, y, 16)) return false;
    if (!hasLineOfSight(this.cave.isWall, fromX, fromY, x, y)) return false;
    for (const b of Object.values(LEVEL.bases)) if (inLevelRect(x, y, b.zone)) return false;
    for (const r of this.barriers.blockedRects()) if (x > r.x - 12 && x < r.x + r.w + 12 && y > r.y - 12 && y < r.y + r.h + 12) return false;
    return true;
  }

  private rebuildNav(): void {
    const blocked = this.barriers.blockedRects();
    this.navBoat = buildNav(this.cave.grid, LEVEL.bases.boat.zone, blocked);
    this.navSub = S.save.substation.restored ? buildNav(this.cave.grid, LEVEL.bases.sub.zone, blocked) : null;
  }

  private routeKey = '';
  private routeNav: NavGrid | null = null;

  /** Для автопрогона: направление по проходам к точке (тот же поиск пути, что у стрелки к базе). */
  routeAngle(tx: number, ty: number): number | null {
    const blocked = this.barriers.blockedRects();
    const key = `${Math.round(tx)},${Math.round(ty)}|${blocked.length}`;
    if (this.routeKey !== key || !this.routeNav) {
      this.routeNav = buildNav(this.cave.grid, { x: tx - 24, y: ty - 24, w: 48, h: 48 }, blocked);
      this.routeKey = key;
    }
    const d = directionHome(this.routeNav, this.player.x, this.player.y);
    return d ? d.angle : null;
  }

  /** Точка в освещённой области базы. */
  inLitArea(x: number, y: number): boolean {
    const b = LEVEL.bases.boat.sprite;
    if (Math.hypot(x - b.x, y - (b.y + 60)) <= LIT.boat * 0.8) return true;
    const s = LEVEL.bases.sub.sprite;
    return S.save.substation.restored && Math.hypot(x - s.x, y - (s.y - 40)) <= LIT.sub * 0.8;
  }

  private applySubstationLook(): void {
    const on = S.save.substation.restored;
    this.subSprite.setTexture(on ? 'substation-on' : 'substation-off');
    this.subGlow.setVisible(on);
    this.subZoneRect.setVisible(on);
  }

  // ---------------- Основной цикл ----------------

  update(_time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 0.05);
    const now = this.time.now;
    const sv = S.save;
    sv.stats.playMs += delta;
    const norm = upgradeValue('tow', sv.upgrades.tow);
    const weight = cargoWeight(S.cargo);
    const radius = upgradeValue('lantern', sv.upgrades.lantern);
    const px = this.player.x, py = this.player.y;
    const los = (x: number, y: number) => hasLineOfSight(this.cave.isWall, px, py, x, y);
    this.updateParallax();
    this.hud.lightPoly = castLight(this.cave.isWall, px, py, radius, LIGHT.rays, LIGHT.wallBleed);
    // видимым считается то, что в яркой части света (край круга затухает)
    this.loot.update(now, px, py, radius * VISIBLE_FRACTION, los);
    // Освещённые области баз (день над бухтой, свет работающей подстанции): находки там видны и без фонаря
    for (const e of this.loot.entities) {
      if (e.state !== 'world' || e.visible) continue;
      if (this.inLitArea(e.sprite.x, e.sprite.y) && hasLineOfSight(this.cave.isWall, px, py, e.sprite.x, e.sprite.y)) {
        e.visible = true;
        e.sprite.setVisible(true);
      }
    }
    this.barriers.updateVisibility(px, py, radius * VISIBLE_FRACTION, los);
    this.subGlow.setAlpha(0.55 + Math.sin(now / 600) * 0.15);

    if (this.mode !== 'diving') {
      this.player.move({ x: 0, y: 0 }, 0, 140, dt, now);
      this.tether.update(px, py, S.cargo, now);
      this.fillHud(weight, norm, now, null, null);
      return;
    }

    // Ввод
    const k = this.keys;
    let ix = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    let iy = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    if (ix === 0 && iy === 0) {
      ix = this.touchInput.x;
      iy = this.touchInput.y;
    }
    const v0 = upgradeValue('fins', sv.upgrades.fins);
    const input = normalizeInput(ix, iy);
    this.player.move(input, levelSpeed(sv.upgrades, weight), v0, dt, now);
    this.cornerAssist(input);

    // Зоны баз, кислород
    const d = S.dive;
    const inBoat = inLevelRect(px, py, LEVEL.bases.boat.zone);
    const inSub = inLevelRect(px, py, LEVEL.bases.sub.zone);
    const inBase = inBoat || (inSub && sv.substation.restored);
    if (!d.active && !inBase) {
      d.active = true;
      S.current.from = S.base; // покупки и ремонт на базе уже записаны в текущую вылазку
      this.persistInFlight();
    }
    if (inSub && !this.inSubBefore && !sv.substation.restored) this.onInactiveSubstation();
    this.inSubBefore = inSub;
    if (d.active) {
      tick(d, dt, S.infiniteO2);
      S.current.minO2 = Math.min(S.current.minO2, d.oxygen);
      const end = resolve(d, inBase);
      if (end) {
        this.beginDocking(end, inBoat ? 'boat' : 'sub');
        return;
      }
      this.inFlightTimer += dt;
      if (this.inFlightTimer >= 1) {
        this.inFlightTimer = 0;
        this.persistInFlight();
      }
    }

    // Действия
    const pressed = (key: Phaser.Input.Keyboard.Key, action: string) => Phaser.Input.Keyboard.JustDown(key) || this.touchActions.delete(action);
    const nearestLoot = this.loot.nearest(px, py, now);
    const nearNet = this.barriers.nearest(px, py);
    const netVisible = nearNet ? nearNet.net.sprite.visible : false;
    const netFirst = !!nearNet && netVisible && (!nearestLoot || nearNet.dist < Phaser.Math.Distance.Between(px, py, nearestLoot.sprite.x, nearestLoot.sprite.y));
    if (netFirst && nearNet && (k.E.isDown || this.touchActions.has('pick'))) this.cutNet(nearNet.net, dt);
    else if (pressed(k.E, 'pick') && nearestLoot) this.tryPick(nearestLoot);
    if (pressed(k.Q, 'drop')) this.dropLast(now);
    const numKeys = [k.ONE, k.TWO, k.THREE, k.FOUR, k.FIVE, k.SIX, k.SEVEN, k.EIGHT, k.NINE];
    numKeys.forEach((key, i) => { if (Phaser.Input.Keyboard.JustDown(key)) this.dropGroup(i); });
    this.touchActions.clear();

    // Мир
    this.tether.update(this.player.x, this.player.y, S.cargo, now);
    this.barriers.update();
    this.bubbleTimer -= dt;
    if (this.bubbleTimer <= 0 && this.player.vel.length() > 30) {
      this.bubbleTimer = 0.4;
      this.bubbles(this.player.x - this.player.facing * 10, this.player.y - 6, 1);
    }
    const cam = this.cameras.main;
    this.followOff.x = Phaser.Math.Linear(this.followOff.x, -this.player.facing * 32, 0.04);
    this.followOff.y = Phaser.Math.Linear(this.followOff.y, -Phaser.Math.Clamp(this.player.vel.y * 0.12, -22, 22), 0.05);
    cam.setFollowOffset(this.followOff.x, this.followOff.y);

    // Подсказки по ситуации
    if (nearestLoot) this.hint('pick', 'E — взять находку. Подобрать можно только то, что видно в свете фонаря.');
    if (S.cargo.length) this.hint('weight', 'Находки тянутся связкой и замедляют. 1–9 — сбросить выбранную, Q — последнюю.');
    if (isOverloaded(S.cargo, norm)) this.hint('overload', 'Перегруз: скорость резко падает. Сбросьте лишнее (1–9 или Q) — находка останется здесь.');
    if (netVisible && nearNet && nearNet.net.id !== GATE_ID && !sv.knife.owned) this.hint('net', 'Сеть. Нужен нож — он где-то в пещере.');
    if (netVisible && nearNet && nearNet.net.id === GATE_ID) this.hint('gate', 'Решётка заперта: откроется, когда заработает подстанция.');

    this.fillHud(weight, norm, now, nearestLoot, netFirst && nearNet ? nearNet.net : null);
    if (this.hud.warn === 'soft' || this.hud.warn === 'hard') this.hint('return', 'Пора назад: кислорода хватит только на дорогу. Стрелка ведёт к ближайшей базе.');
  }

  /** Доводка у угла: если движение по оси упёрлось в край прохода, мягко смещаем вдоль стены к свободной стороне. */
  private cornerAssist(input: { x: number; y: number }): void {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const { x, y } = this.player;
    const wall = this.cave.isWall;
    const nudge = 70;
    if (Math.abs(input.y) > 0.7 && (input.y < 0 ? body.blocked.up : body.blocked.down)) {
      const ahead = y + Math.sign(input.y) * 20;
      const leftFree = !wall(x - 16, ahead) && !wall(x - 16, y);
      const rightFree = !wall(x + 16, ahead) && !wall(x + 16, y);
      if (leftFree !== rightFree) this.player.setVelocityX(leftFree ? -nudge : nudge);
    } else if (Math.abs(input.x) > 0.7 && (input.x < 0 ? body.blocked.left : body.blocked.right)) {
      const ahead = x + Math.sign(input.x) * 20;
      const upFree = !wall(ahead, y - 16) && !wall(x, y - 16);
      const downFree = !wall(ahead, y + 16) && !wall(x, y + 16);
      if (upFree !== downFree) this.player.setVelocityY(upFree ? -nudge : nudge);
    }
  }

  private updateParallax(): void {
    const view = this.cameras.main.worldView;
    for (const [ts, f] of [[this.bg, 0.25], [this.mg, 0.5]] as const) {
      ts.setPosition(view.x, view.y);
      ts.setSize(view.width + 2, view.height + 2);
      ts.tilePositionX = view.x * f;
      ts.tilePositionY = view.y * f;
    }
  }

  private fillHud(weight: number, norm: number, now: number, nearestLoot: LootEntity | null, net: Net | null): void {
    const h = this.hud;
    const sv = S.save;
    h.goal = goalText(sv, S.cargo);
    h.weight = weight;
    h.norm = norm;
    h.speedPct = Math.round(speedMultiplier(weight, norm) * 100);
    h.cargoValue = cargoValue(S.cargo);
    h.overloaded = isOverloaded(S.cargo, norm);
    h.overloadRatio = weight / norm;
    const last = S.cargo[S.cargo.length - 1];
    h.lastItemName = last ? ITEMS[last.type].name : '';
    h.groups = this.groups();
    h.lightRadius = upgradeValue('lantern', sv.upgrades.lantern);
    h.knife = sv.knife.owned ? `Нож ${sv.knife.durability}/${LEVEL_KNIFE.max}` : '';
    const px = this.player.x, py = this.player.y;
    h.inBase = inLevelRect(px, py, LEVEL.bases.boat.zone) || (sv.substation.restored && inLevelRect(px, py, LEVEL.bases.sub.zone));
    // Ближайшая работающая база по проходам и оценка времени возврата с текущим грузом.
    // С двигателем стрелка ведёт к лодке, пока предупреждение о кислороде (по ближайшей базе) не сработало.
    const a = directionHome(this.navBoat, px, py);
    const b = this.navSub ? directionHome(this.navSub, px, py) : null;
    const nearest = !a ? b : !b ? a : (b.steps < a.steps ? b : a);
    const speed = Math.max(10, levelSpeed(sv.upgrades, weight));
    h.warn = S.dive.active && nearest && !h.inBase ? oxygenWarning(S.dive.oxygen, S.dive.maxOxygen, pathPx(nearest.steps) / speed) : 'ok';
    const pick = a && h.warn === 'ok' && S.cargo.some((c) => c.type === 'engine') ? a : nearest;
    h.home = pick && !h.inBase ? { angle: pick.angle, base: pick === b ? 'sub' : 'boat', returnSec: pathPx(pick.steps) / speed } : null;
    if (net) {
      let sub: string, hint = '';
      if (net.id === GATE_ID) sub = 'откроется, когда заработает подстанция';
      else if (!sv.knife.owned) sub = 'нужен нож — он где-то в пещере';
      else if (sv.knife.durability <= 0) sub = 'нож затупился: ремонт за припасы на базе';
      else {
        sub = `разрез тратит 1 прочность (нож ${sv.knife.durability}/${LEVEL_KNIFE.max})`;
        hint = 'E — удерживать, чтобы резать';
      }
      // Над горизонтальной сетью подсказка закрывала бы дайвера — тогда показываем её под сетью
      const below = net.rect.w > net.rect.h && py < net.rect.y;
      h.nearest = { x: net.rect.x + net.rect.w / 2, y: below ? net.rect.y + net.rect.h + 44 : net.rect.y, title: net.id === GATE_ID ? 'Решётка с цепью' : 'Сеть', sub, hint };
    } else if (nearestLoot) {
      const def = ITEMS[nearestLoot.type];
      let hint = 'E — взять';
      if (def.weight > 0 && !canPick(S.cargo, def.weight, norm)) hint = nearestLoot.type === 'engine' && def.weight > 2 * norm ? 'нужен Буксир сильнее' : 'слишком тяжело: сбросьте 1–9 или Q';
      h.nearest = { x: nearestLoot.sprite.x, y: nearestLoot.sprite.y - 10, title: def.name, sub: itemPurpose(nearestLoot), hint };
    } else h.nearest = null;
    void now;
  }

  /** Состав связки по типам в порядке первого подбора. */
  private groups(): CargoGroup[] {
    const out: CargoGroup[] = [];
    for (const c of S.cargo) {
      let g = out.find((x) => x.type === c.type);
      if (!g) {
        g = { type: c.type, name: ITEMS[c.type].name, count: 0, weight: 0 };
        out.push(g);
      }
      g.count += 1;
      g.weight += c.weight;
    }
    return out;
  }

  // ---------------- Действия ----------------

  private tryPick(e: LootEntity): void {
    const sv = S.save;
    const def = ITEMS[e.type];
    if (e.type === 'knife') {
      takeKnife(sv, e.id);
      this.loot.remove(e);
      persistLevel();
      this.float(e.sprite.x, e.sprite.y, 'Нож найден', '#9fe8e2');
      this.hint('knife', `Нож найден: удерживайте E у сети, чтобы разрезать. Каждый разрез тратит прочность (${LEVEL_KNIFE.max}/${LEVEL_KNIFE.max}).`, true);
      return;
    }
    const norm = upgradeValue('tow', sv.upgrades.tow);
    if (!canPick(S.cargo, def.weight, norm)) {
      if (e.type === 'engine' && def.weight > 2 * norm) {
        this.say(`Двигатель весит ${def.weight}: с Буксиром норма ${norm}, поднять можно до ${2 * norm}. Улучшите Буксир.`, '#f2b134', 3500);
        this.hint('engineHeavy', 'Двигатель слишком тяжёл для текущего Буксира. Буксир покупается на лодке или подстанции.');
      } else this.say(`Слишком тяжело: ${cargoWeight(S.cargo)} + ${def.weight} > ${2 * norm}. Сбросьте лишнее: 1–9 или Q`, '#f2b134');
      return;
    }
    S.cargo.push({ id: e.id, type: e.type, weight: def.weight });
    this.loot.take(e);
    this.persistInFlight();
    if (def.kind === 'valuable') this.float(e.sprite.x, e.sprite.y, `+${def.price} золота`, '#f2b134');
    else this.float(e.sprite.x, e.sprite.y, def.name, '#cfe9f5');
    if (e.type === 'crate') this.hint('crate', `Ящик снабжения: на базе превратится в ${CRATE_SUPPLIES} припаса для ремонта ножа.`, true);
    if (e.type === 'component') this.hint('component', `Компонент подстанции: отвезите его к подстанции в средней зоне (нужно ${COMPONENTS_NEEDED}).`, true);
    if (e.type === 'engine') this.hint('engine', 'Двигатель в связке: доставьте его к лодке. Подстанция по пути восстановит кислород.', true);
  }

  private dropById(id: string, now: number): void {
    const idx = S.cargo.findIndex((c) => c.id === id);
    if (idx < 0) return;
    const [item] = S.cargo.splice(idx, 1);
    const e = this.loot.byId.get(item.id);
    if (!e) return;
    const p = this.freePointNear(this.player.x, this.player.y);
    this.loot.drop(e, p.x, p.y, now);
    markMoved(S.save.loot, e.id, p.x, p.y);
    persistLevel();
    this.persistInFlight();
    this.say(`Сброшено: ${ITEMS[item.type].name} — останется здесь`, '#cfe9f5', 1400);
  }

  private dropLast(now: number): void {
    const last = S.cargo[S.cargo.length - 1];
    if (last) this.dropById(last.id, now);
  }

  /** Сбросить одну находку выбранной группы (последнюю подобранную этого типа). */
  dropGroup(index: number): void {
    if (this.mode !== 'diving') return;
    const g = this.groups()[index];
    if (!g) return;
    for (let i = S.cargo.length - 1; i >= 0; i--) {
      if (S.cargo[i].type === g.type) {
        this.dropById(S.cargo[i].id, this.time.now);
        return;
      }
    }
  }

  private freePointNear(x: number, y: number): { x: number; y: number } {
    const r = 34;
    const angles = [Math.PI, 0, Math.PI / 2, -Math.PI / 2, (3 * Math.PI) / 4, -(3 * Math.PI) / 4, Math.PI / 4, -Math.PI / 4];
    for (const a of angles) {
      const px = x + Math.cos(a) * r * -this.player.facing, py = y + Math.sin(a) * r;
      if (this.isFreeSpot(px, py, x, y)) return { x: Math.round(px), y: Math.round(py) };
    }
    return { x: Math.round(x), y: Math.round(y) };
  }

  private cutNet(net: Net, dt: number): void {
    const sv = S.save;
    if (net.id === GATE_ID) {
      this.sayOnce('Решётка заперта: откроется, когда заработает подстанция', '#f2b134');
      return;
    }
    if (!sv.knife.owned) {
      this.sayOnce('Сеть. Нужен нож — он где-то в пещере', '#f2b134');
      return;
    }
    if (sv.knife.durability <= 0) {
      this.sayOnce('Нож затупился: почините за припасы на лодке или подстанции', '#f2b134');
      return;
    }
    if (this.barriers.cutTick(net, dt, 0)) {
      cutWithKnife(sv, net.id);
      persistLevel();
      this.rebuildNav();
      this.say(`Сеть разрезана, проход останется открытым. Нож ${sv.knife.durability}/${LEVEL_KNIFE.max}`, '#9fe8e2', 2600);
      if (sv.knife.durability === 0) this.hint('dull', 'Нож затупился. Почините его за припасы на лодке или подстанции — припасы дают ящики снабжения.', true);
    }
  }

  private onInactiveSubstation(): void {
    const sv = S.save;
    const r = installComponents(sv, S.cargo);
    for (const id of r.installed) {
      const e = this.loot.byId.get(id);
      if (e) e.state = 'gone';
    }
    S.current.installed += r.installed.length;
    if (r.restoredNow) S.current.restored = true;
    if (r.installed.length) {
      persistLevel();
      this.persistInFlight();
      this.float(this.player.x, this.player.y - 20, `Компонент установлен ${sv.substation.installed.length}/${COMPONENTS_NEEDED}`, '#9fe8e2');
    } else this.say(`Подстанция обесточена: доставьте компоненты ${sv.substation.installed.length}/${COMPONENTS_NEEDED}`, '#f2b134', 3000);
    this.hint('sub', `Подстанция обесточена: доставьте ${COMPONENTS_NEEDED} компонента — она станет новой базой.`);
    if (r.restoredNow) {
      sv.stats.substationMs = sv.stats.playMs;
      this.barriers.openNet(GATE_ID);
      this.applySubstationLook();
      this.rebuildNav();
      this.cameras.main.flash(250, 120, 230, 220, false);
      persistLevel();
      this.hint('subOn', 'Подстанция работает: здесь кислород, разгрузка, улучшения и ремонт ножа. Решётка в полу открыта.', true);
    }
  }

  private onPointerDown(p: Phaser.Input.Pointer): void {
    if (this.mode !== 'diving' || p.wasTouch) return;
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    const e = this.loot.atPoint(w.x, w.y, this.player.x, this.player.y, this.time.now);
    if (e) this.tryPick(e);
  }

  touchAction(action: string): void {
    this.touchActions.add(action);
  }

  // ---------------- Вспомогательное ----------------

  say(text: string, color = '#e6f3f8', ms = 2200): void {
    this.hud.message = { text, until: this.time.now + ms, color };
  }

  private sayOnce(text: string, color: string): void {
    if (this.hud.message && this.hud.message.text === text && this.time.now < this.hud.message.until) return;
    this.say(text, color, 1500);
  }

  /** Подсказка по ситуации — один раз за прохождение (сохраняется). force — показать поверх текущего сообщения. */
  private hint(id: string, text: string, force = false): void {
    const sv = S.save;
    if (sv.hints.includes(id)) return;
    if (!force && this.hud.message && this.time.now < this.hud.message.until) return;
    sv.hints.push(id);
    persistLevel();
    this.say(text, '#9fe8e2', 5200);
  }

  private float(x: number, y: number, text: string, color: string): void {
    this.hud.floaters.push({ x, y, text, color, born: this.time.now });
  }

  private bubbles(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const b = this.add.sprite(x + (Math.random() - 0.5) * 12, y, 'bubbles', 0).setDepth(23).setAlpha(0.8);
      b.play('bubbles-rise');
      this.tweens.add({ targets: b, y: y - 28 - Math.random() * 10, alpha: 0, duration: 650, onComplete: () => b.destroy() });
    }
  }
}

export function levelPauseConfig(): PauseConfig {
  const lvl = (g: Phaser.Game) => g.scene.getScene('Level') as LevelScene | null;
  return {
    sceneKeys: ['Level', 'LevelHud', 'LevelBase'],
    isReady: (g) => !!lvl(g)?.player,
    isDiving: (g) => lvl(g)?.mode === 'diving' && S.dive.active,
    isInWater: (g) => lvl(g)?.mode === 'diving',
    autoPause: () => S.autoPause,
    abort: (g) => lvl(g)?.abortSortie(),
    resetSave: () => resetLevelSave(),
    text: {
      divingNote: 'Вылазка продолжится после нажатия «Продолжить».',
      reloadNote: 'Если закончится кислород или страница перезагрузится во время вылазки, груз останется лежать там, где вы были, а вы вернётесь на последнюю базу. Улучшения, открытые проходы и подстанция сохраняются.',
      abortLabel: 'Вернуться на базу (груз останется здесь)',
      controls: 'WASD/стрелки — плыть • E — взять, удерживать у сети — резать • Q — сбросить последнюю находку • 1–9 — сбросить выбранную • Esc — пауза',
      newGameText: 'Начать уровень заново? Золото, припасы, улучшения, нож, подстанция и собранная добыча будут сброшены.',
    },
  };
}
