// Мир погружения: пещера, дайвер, лут по id, связка, существа, преграды, кислород, причал.
import Phaser from 'phaser';
import { COMBAT, DIVER, ITEMS, KNIFE, LIGHT, OXYGEN, SUPPLIES, WORLD, effects, type SupplyKind } from '../config/balance.ts';
import { MAP, depthMeters, inRect } from '../config/map.ts';
import { canPick, cargoValue, cargoWeight, isOverloaded, popLast } from '../core/cargo.ts';
import { addOxygen, newDive, resolve, tick, type DiveEnd } from '../core/dive.ts';
import { settle } from '../core/economy.ts';
import { applyFailure, markConsumed, markDelivered, markMoved } from '../core/lootState.ts';
import { normalizeInput, speedMultiplier, targetSpeed } from '../core/movement.ts';
import { buildNav, directionHome, type NavGrid } from '../core/nav.ts';
import { endDive, pickupPack, total as beltTotal, use as beltUse } from '../core/supplies.ts';
import { castLight, hasLineOfSight } from '../core/visibility.ts';
import { showIntro } from '../ui/intro.ts';
import { BarrierManager, type Net } from './Barriers.ts';
import { buildCave, type Cave } from './CaveRenderer.ts';
import { Creature, CreatureManager } from './Creatures.ts';
import { LootManager, type LootEntity } from './Loot.ts';
import { Player } from './Player.ts';
import { newLogEntry, persist, state } from './state.ts';
import { Tether } from './Tether.ts';

export interface Floater { x: number; y: number; text: string; color: string; born: number }

export interface HudInfo {
  nearest: { x: number; y: number; title: string; sub: string; hint: string } | null;
  message: { text: string; until: number; color: string } | null;
  speedPct: number;
  weight: number;
  haul: number;
  cargoValue: number;
  overloaded: boolean;
  overloadRatio: number;
  lastItemName: string;
  depthM: number;
  lightRadius: number;
  /** Полигон света в мировых координатах (плоский массив x,y). */
  lightPoly: number[];
  reloadFrac: number;
  floaters: Floater[];
  home: { angle: number; tx: number; ty: number } | null;
  homeFallbackAngle: number;
  dock: { fade: number; dark: boolean };
  inDock: boolean;
  knife: string;
}

export type Mode = 'intro' | 'base' | 'diving' | 'docking';

export class DiveScene extends Phaser.Scene {
  player!: Player;
  cave!: Cave;
  loot!: LootManager;
  tether!: Tether;
  creatures!: CreatureManager;
  barriers!: BarrierManager;
  harpoons!: Phaser.Physics.Arcade.Group;
  nav!: NavGrid;
  mode: Mode = 'intro';
  hud: HudInfo = {
    nearest: null, message: null, speedPct: 100, weight: 0, haul: 6, cargoValue: 0, overloaded: false, overloadRatio: 0, lastItemName: '',
    depthM: 0, lightRadius: 70, lightPoly: [], reloadFrac: 1, floaters: [], home: null, homeFallbackAngle: 0,
    dock: { fade: 0, dark: false }, inDock: true, knife: '',
  };
  touchInput = { x: 0, y: 0 };
  private touchActions = new Set<string>();
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private bg!: Phaser.GameObjects.TileSprite;
  private mg!: Phaser.GameObjects.TileSprite;
  private glow!: Phaser.GameObjects.Image;
  private zoomBase = 2;
  private reloadUntil = 0;
  private bubbleTimer = 0;
  private inFlightTimer = 0;
  private hits = { fish: 0, coral: 0 };
  private lastCoralHit = 0;
  private followOff = new Phaser.Math.Vector2();

  constructor() {
    super('Dive');
  }

  create(): void {
    this.physics.world.setBounds(0, 0, MAP.width, MAP.height);
    this.bg = this.add.tileSprite(0, 0, 480, 270, 'background').setOrigin(0).setDepth(0);
    this.mg = this.add.tileSprite(0, 0, 480, 270, 'midground').setOrigin(0).setDepth(1).setAlpha(0.9);
    this.cave = buildCave(this);
    for (const d of MAP.decor) {
      this.add.image(d.x, d.y, 'props', d.frame).setOrigin(0.5, 1).setDepth(5).setFlipX(!!d.flip).setAlpha(d.alpha ?? 1);
    }
    // Причал: светлая площадка («белый квадрат»), конструкция с лампами, тёплый свет
    const dk = MAP.dock;
    this.add.rectangle(dk.x + dk.w / 2, dk.y + dk.h / 2, dk.w, dk.h, 0xdff6ff, 0.22).setDepth(6);
    this.add.image(MAP.dockSprite.x, MAP.dockSprite.y + 10, 'dock').setDepth(7);
    this.glow = this.add.image(dk.x + dk.w / 2, dk.y + dk.h / 2, 'glow-warm').setDepth(8).setScale(2.4).setBlendMode(Phaser.BlendModes.ADD);

    this.player = new Player(this, MAP.spawn.x, MAP.spawn.y);
    this.loot = new LootManager(this);
    this.tether = new Tether(this);
    this.creatures = new CreatureManager(this);
    this.barriers = new BarrierManager(this);
    this.harpoons = this.physics.add.group({ allowGravity: false });

    this.physics.add.collider(this.player, this.cave.layer);
    this.physics.add.collider(this.player, this.barriers.netGroup);
    this.physics.add.collider(this.creatures.group, this.cave.layer);
    this.physics.add.collider(this.harpoons, this.cave.layer, (h) => (h as Phaser.GameObjects.GameObject).destroy());
    this.physics.add.collider(this.harpoons, this.barriers.netGroup, (h) => (h as Phaser.GameObjects.GameObject).destroy());
    this.physics.add.overlap(this.player, this.creatures.group, (_p, c) => this.onCreatureTouch(c as Creature));
    this.physics.add.overlap(this.player, this.barriers.coralGroup, () => this.onCoralTouch());
    this.physics.add.overlap(this.harpoons, this.creatures.group, (h, c) => this.onHarpoonHit(h as Phaser.Physics.Arcade.Image, c as Creature));

    const cam = this.cameras.main;
    cam.setBounds(0, 0, MAP.width, MAP.height);
    this.zoomBase = zoomFor(this.scale.height);
    cam.setZoom(this.zoomBase);
    cam.startFollow(this.player, true, 0.12, 0.12);
    cam.setBackgroundColor('#000000');
    this.scale.on(Phaser.Scale.Events.RESIZE, (gs: Phaser.Structs.Size) => {
      this.zoomBase = zoomFor(gs.height);
      if (this.mode === 'diving') cam.setZoom(this.zoomBase);
    });

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,E,Q,R,F,SPACE') as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointerDown(p));

    // Мир из сохранения: сети (без возрождения), лут по id, существа (возрождаются каждый заход)
    const s = state.save;
    this.barriers.spawnAll(s.netsCut);
    this.loot.spawnFromSave(s.loot);
    this.creatures.spawnAll();
    this.handleInFlight();
    this.rebuildNav();

    if (!s.introSeen) {
      this.mode = 'intro';
      this.player.frozen = true;
      showIntro(() => {
        s.introSeen = true;
        persist();
        this.mode = 'diving';
        this.player.frozen = false;
        this.showHint('go', 'Шахта ведёт вниз. Фонарь освещает только рядом — ищите находки у стен.');
      });
    } else this.openBase();
  }

  // ---------- Жизненный цикл ----------

  private rebuildNav(): void {
    this.nav = buildNav(this.cave.grid, MAP.dock, this.barriers.blockedRects());
  }

  /** Перезагрузка в активном погружении = обычный провал в точке, где был дайвер. */
  private handleInFlight(): void {
    const s = state.save;
    const f = s.inFlight;
    if (!f) return;
    const placed = applyFailure(s.loot, this.loot.spawnsById, f.cargoIds, f.packs, f.x, f.y, (x, y) => this.isFreeSpot(x, y));
    this.loot.placeWorld(placed);
    const lostValue = f.cargoIds.reduce((sum, id) => sum + (ITEMS[this.loot.spawnsById.get(id)?.type ?? 'shard']?.price ?? 0), 0);
    s.stats.dives += 1;
    s.stats.fails += 1;
    const entry = newLogEntry(s.stats.dives, s.devTouched);
    entry.result = 'reload';
    entry.returned = { cargo: f.cargoIds.length, packs: f.packs.filter((p) => p.n > 0).length };
    entry.notes.push(`перезагрузка во время погружения: груз (${f.cargoIds.length}) и остатки припасов выложены в точке ${Math.round(f.x)},${Math.round(f.y)}`);
    s.log.push(entry);
    s.inFlight = null;
    state.last = { result: 'reload', coins: 0, parts: 0, counts: {}, merged: { o2: 0, harpoons: 0 }, returned: entry.returned, lostCargoValue: lostValue, capsule: false };
    persist();
    state.current = newLogEntry(s.stats.dives + 1, s.devTouched);
  }

  private isFreeSpot(x: number, y: number): boolean {
    return this.cave.isWaterRect(x - 8, y - 8, 16, 16) && !this.loot.isOccupied(x, y, 16);
  }

  /** Дайвер у причала, магазин открыт. */
  private openBase(): void {
    this.mode = 'base';
    this.player.frozen = true;
    this.hud.dock = { fade: 1, dark: false };
    if (!this.scene.isActive('Base')) this.scene.launch('Base');
  }

  /** Вход в причал или провал: пауза движения, плавный переход, затем сдача и база. */
  private beginDocking(result: DiveEnd): void {
    this.mode = 'docking';
    this.player.frozen = true;
    this.player.setVelocity(0, 0);
    const success = result === 'success';
    this.hud.dock = { fade: 1, dark: !success };
    this.tweens.add({ targets: this.cameras.main, zoom: this.zoomBase * 1.12, duration: 500, ease: 'Sine.Out' });
    this.time.delayedCall(success ? 450 : 650, () => this.finishDive(result));
    this.time.delayedCall(success ? 950 : 1150, () => {
      if (!this.scene.isActive('Base')) this.scene.launch('Base');
      this.mode = 'base';
    });
  }

  /** Кнопка «Нырнуть»: база закрыта, дайвер у причала, кислород полный. */
  startDive(): void {
    if (this.mode !== 'base') return;
    if (this.scene.isActive('Base')) this.scene.stop('Base');
    this.mode = 'diving';
    this.player.frozen = false;
    this.hud.dock = { fade: 0, dark: false };
    this.tweens.add({ targets: this.cameras.main, zoom: this.zoomBase, duration: 350, ease: 'Sine.Out' });
    this.hits = { fish: 0, coral: 0 };
    state.dive = newDive(effects.oxygen(state.save.upgrades.tank));
    this.creatures.spawnAll();
    this.tether.reset(this.player.x, this.player.y);
  }

  /** Аварийный возврат из паузы. */
  abortDive(): void {
    if (this.mode !== 'diving' || !state.dive.active) return;
    this.beginDocking('abort');
  }

  private finishDive(result: DiveEnd): void {
    const s = state.save;
    const d = state.dive;
    const log = state.current;
    const success = result === 'success';
    const failX = this.player.x, failY = this.player.y;
    const cargoIds = state.cargo.map((c) => c.id);
    const settlement = success ? settle(state.cargo) : null;
    const lostCargoValue = success ? 0 : cargoValue(state.cargo);
    const { merged, returned, consumed } = endDive(state.belt, success);
    for (const id of consumed) markConsumed(s.loot, id);

    if (settlement) {
      s.coins += settlement.coins;
      s.parts += settlement.parts;
      s.stats.successes += 1;
      s.stats.bestIncome = Math.max(s.stats.bestIncome, settlement.coins);
      for (const id of cargoIds) {
        markDelivered(s.loot, id);
        const e = this.loot.byId.get(id);
        if (e) e.state = 'gone';
      }
      if (settlement.capsule && !s.capsuleDelivered) {
        s.capsuleDelivered = true;
        s.stats.winMs = s.stats.playMs + d.elapsed * 1000;
        s.stats.winDives = s.stats.dives + 1;
      }
    } else {
      const placed = applyFailure(s.loot, this.loot.spawnsById, cargoIds, returned, failX, failY, (x, y) => this.isFreeSpot(x, y));
      this.loot.placeWorld(placed);
      s.stats.fails += 1;
    }
    s.stats.dives += 1;
    s.stats.playMs += Math.round(d.elapsed * 1000);

    log.result = result;
    log.durationS = Math.round(d.elapsed);
    log.maxDepthM = Math.round(d.maxDepthM);
    log.delivered = settlement?.counts ?? {};
    log.coins = settlement?.coins ?? 0;
    log.parts = settlement?.parts ?? 0;
    log.supplies.merged = merged;
    log.returned = { cargo: success ? 0 : cargoIds.length, packs: returned.length };
    log.capsule = settlement?.capsule ?? false;
    log.dev = log.dev || state.devActive;
    if (!success) log.notes.push(`груз на ${lostCargoValue} монет и ${returned.length} пачек припасов выложены у точки провала (${Math.round(failX)}, ${Math.round(failY)})`);
    if (this.hits.fish || this.hits.coral) log.notes.push(`касаний существ: ${this.hits.fish}, кораллов: ${this.hits.coral}`);
    s.log.push(log);
    state.current = newLogEntry(s.stats.dives + 1, s.devTouched);
    state.last = {
      result, coins: settlement?.coins ?? 0, parts: settlement?.parts ?? 0, counts: settlement?.counts ?? {},
      merged, returned: log.returned, lostCargoValue, capsule: settlement?.capsule ?? false,
    };
    s.inFlight = null;
    persist();
    state.cargo = [];
    this.enterDock();
  }

  private enterDock(): void {
    this.player.setPosition(MAP.spawn.x, MAP.spawn.y);
    this.player.setVelocity(0, 0);
    this.tether.reset(MAP.spawn.x, MAP.spawn.y);
    state.dive = newDive(effects.oxygen(state.save.upgrades.tank));
    this.hud.message = null;
    this.hud.nearest = null;
  }

  /** Снимок активного погружения — чтобы перезагрузка страницы была равна провалу в этой точке. */
  private persistInFlight(): void {
    const s = state.save;
    if (!state.dive.active || this.mode !== 'diving') return;
    s.inFlight = {
      x: Math.round(this.player.x), y: Math.round(this.player.y),
      cargoIds: state.cargo.map((c) => c.id),
      packs: state.belt.packs.map((p) => ({ ...p })),
    };
    persist();
  }

  // ---------- Основной цикл ----------

  update(_time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 0.05);
    const now = this.time.now;
    const s = state.save;
    const haul = effects.haul(s.upgrades.haul);
    const v0 = effects.v0(s.upgrades.fins);
    const weight = cargoWeight(state.cargo);
    const radius = effects.lightRadius(s.upgrades.lantern);
    const los = (x: number, y: number) => hasLineOfSight(this.cave.isWall, this.player.x, this.player.y, x, y);
    this.updateParallax();
    this.hud.lightPoly = castLight(this.cave.isWall, this.player.x, this.player.y, radius, LIGHT.rays, LIGHT.wallBleed);
    this.loot.update(now, this.player.x, this.player.y, radius, los);
    this.barriers.updateVisibility(this.player.x, this.player.y, radius, los);
    this.creatures.updateVisibility(this.player.x, this.player.y, radius, los);

    if (this.mode !== 'diving') {
      this.player.move({ x: 0, y: 0 }, 0, v0, dt, now);
      this.fillHud(weight, haul, now);
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
    const input = normalizeInput(ix, iy);
    this.player.move(input, targetSpeed(v0, weight, haul), v0, dt, now);

    // Кислород и причал
    const d = state.dive;
    const inDock = inRect(this.player.x, this.player.y, MAP.dock);
    if (!d.active && !inDock) {
      d.active = true;
      this.persistInFlight();
    }
    if (d.active) {
      tick(d, dt, state.infiniteO2);
      d.maxDepthM = Math.max(d.maxDepthM, depthMeters(this.player.y));
      const end = resolve(d, inDock);
      if (end) {
        this.beginDocking(end);
        return;
      }
      this.inFlightTimer += dt;
      if (this.inFlightTimer >= 1) {
        this.inFlightTimer = 0;
        this.persistInFlight();
      }
      if (d.oxygen < d.maxOxygen * 0.5) this.showHint('half', 'Половина кислорода — пора возвращаться. Стрелка ведёт к причалу.');
    }

    // Действия
    const pressed = (key: Phaser.Input.Keyboard.Key, action: string) => Phaser.Input.Keyboard.JustDown(key) || this.touchActions.delete(action);
    const nearestLoot = this.loot.nearest(this.player.x, this.player.y, now);
    const nearNet = this.barriers.nearest(this.player.x, this.player.y);
    const netVisible = nearNet ? nearNet.net.sprite.visible : false;
    const netFirst = nearNet && netVisible && (!nearestLoot || nearNet.dist < Phaser.Math.Distance.Between(this.player.x, this.player.y, nearestLoot.sprite.x, nearestLoot.sprite.y));
    if (netFirst && (k.E.isDown || this.touchActions.has('pick'))) this.cutNet(nearNet.net, dt);
    else {
        if (pressed(k.E, 'pick') && nearestLoot) this.tryPick(nearestLoot, haul);
    }
    if (pressed(k.Q, 'drop')) this.dropLast(now);
    if (pressed(k.R, 'o2')) this.useOxygen();
    if (pressed(k.F, 'fire') || pressed(k.SPACE, 'fire')) this.fire(now);
    this.touchActions.clear();

    // Мир
    this.creatures.update(dt, this.player.x, this.player.y);
    this.tether.update(this.player.x, this.player.y, state.cargo, now);
    this.barriers.update();
    for (const h of this.harpoons.getChildren().slice()) {
      if (now > (h.getData('until') as number)) h.destroy();
    }
    this.bubbleTimer -= dt;
    if (this.bubbleTimer <= 0 && this.player.vel.length() > 30) {
      this.bubbleTimer = 0.4;
      this.bubbles(this.player.x - this.player.facing * 10, this.player.y - 6, 1);
    }

    const cam = this.cameras.main;
    this.followOff.x = Phaser.Math.Linear(this.followOff.x, -this.player.facing * 32, 0.04);
    this.followOff.y = Phaser.Math.Linear(this.followOff.y, -Phaser.Math.Clamp(this.player.vel.y * 0.12, -22, 22), 0.05);
    cam.setFollowOffset(this.followOff.x, this.followOff.y);

    if (this.player.y > MAP.dock.y + MAP.dock.h + 40) this.showHint('dark', 'Темно: виден только круг фонаря. Находки лежат у стен и в нишах — ведите светом вдоль камней.');
    if (isOverloaded(state.cargo, haul)) this.showHint('overload', 'Перегруз: скорость резко падает. Q сбрасывает последний предмет — он останется лежать здесь.');

    this.fillHud(weight, haul, now, nearestLoot, netFirst ? nearNet.net : null);
  }

  private updateParallax(): void {
    const view = this.cameras.main.worldView;
    for (const [ts, f] of [[this.bg, 0.25], [this.mg, 0.5]] as const) {
      ts.setPosition(view.x, view.y);
      ts.setSize(view.width + 2, view.height + 2);
      ts.tilePositionX = view.x * f;
      ts.tilePositionY = view.y * f;
    }
    this.glow.setAlpha(0.9 + Math.sin(this.time.now / 700) * 0.1);
  }

  private fillHud(weight: number, haul: number, now: number, nearestLoot: LootEntity | null = null, net: Net | null = null): void {
    const h = this.hud;
    const s = state.save;
    h.weight = weight;
    h.haul = haul;
    h.speedPct = Math.round(speedMultiplier(weight, haul) * 100);
    h.cargoValue = cargoValue(state.cargo);
    h.overloaded = isOverloaded(state.cargo, haul);
    h.overloadRatio = weight / haul;
    const last = state.cargo[state.cargo.length - 1];
    h.lastItemName = last ? ITEMS[last.type].name : '';
    h.depthM = Math.round(depthMeters(this.player.y));
    h.lightRadius = effects.lightRadius(s.upgrades.lantern);
    const reload = COMBAT.reload[s.upgrades.weapon] * 1000;
    h.reloadFrac = reload > 0 ? Phaser.Math.Clamp(1 - (this.reloadUntil - now) / reload, 0, 1) : 1;
    h.inDock = inRect(this.player.x, this.player.y, MAP.dock);
    h.home = h.inDock ? null : directionHome(this.nav, this.player.x, this.player.y);
    h.homeFallbackAngle = Math.atan2(MAP.dock.y + MAP.dock.h / 2 - this.player.y, MAP.dock.x + MAP.dock.w / 2 - this.player.x);
    h.knife = s.knife.owned ? `Нож ${s.knife.durability}/${effects.knifeMax(s.upgrades.tools)}` : '';
    if (net) {
      const need = this.barriers.requiredTool(net);
      const kn = s.knife;
      const title = net.kind === 'thin' ? 'Тонкая сеть' : 'Толстая сеть с цепью';
      let sub: string, hint = '';
      if (!kn.owned) sub = 'нужен нож — он где-то в пещере';
      else if (kn.durability <= 0) sub = `нож затупился: ремонт на базе (${KNIFE.repairCost} монеты/ед.)`;
      else if (s.upgrades.tools < need) sub = 'нужен резак (Инструменты 1)';
      else {
        sub = `режется ножом, −1 прочности (${kn.durability}/${effects.knifeMax(s.upgrades.tools)})`;
        hint = 'E — удерживать, чтобы резать';
      }
      h.nearest = { x: net.rect.x + net.rect.w / 2, y: net.rect.y, title, sub, hint };
    } else if (nearestLoot) {
      const def = ITEMS[nearestLoot.type];
      const sub = def.kind === 'goal' ? `вес ${def.weight} • Доставить на базу`
        : def.kind === 'supply' ? `припас ×${nearestLoot.n}: сразу на пояс`
        : def.kind === 'equipment' ? 'снаряжение: режет сети'
        : def.kind === 'material' ? `вес ${def.weight} • материал для улучшений`
        : `вес ${def.weight} • ${def.price} монет`;
      h.nearest = { x: nearestLoot.sprite.x, y: nearestLoot.sprite.y - 10, title: def.name, sub, hint: 'E — взять' };
    } else h.nearest = null;
  }

  // ---------- Действия ----------

  private tryPick(e: LootEntity, haul: number): void {
    const s = state.save;
    const def = ITEMS[e.type];
    if (def.kind === 'equipment') {
      const max = effects.knifeMax(s.upgrades.tools);
      s.knife = { owned: true, durability: max };
      markDelivered(s.loot, e.id);
      this.loot.remove(e);
      persist();
      this.float(e.sprite.x, e.sprite.y, 'Нож найден', '#9fe8e2');
      this.say(`Нож найден: режет сети, прочность ${max}/${max}. Ремонт — на базе.`, '#9fe8e2', 4000);
      return;
    }
    if (def.kind === 'supply' && def.supply) {
      const kind: SupplyKind = def.supply;
      if (!pickupPack(state.belt, { id: e.id, kind, n: e.n })) {
        this.say('Пояс полон', '#f2b134');
        return;
      }
      state.current.supplies.found[kind] += e.n;
      this.loot.remove(e);
      this.persistInFlight();
      this.float(e.sprite.x, e.sprite.y, `+${e.n} ${SUPPLIES[kind].name}`, '#9fe8e2');
      return;
    }
    if (!canPick(state.cargo, def.weight, haul)) {
      this.say(`Слишком тяжело: ${cargoWeight(state.cargo)} + ${def.weight} > ${haul * DIVER.overloadLimit}`, '#f2b134');
      return;
    }
    state.cargo.push({ id: e.id, type: e.type, weight: def.weight });
    this.loot.take(e);
    this.persistInFlight();
    const label = def.kind === 'valuable' ? `+${def.price}` : def.kind === 'material' ? '+1 детали' : 'Капсула!';
    this.float(e.sprite.x, e.sprite.y, label, def.kind === 'valuable' ? '#f2b134' : '#cfe9f5');
  }

  private dropLast(now: number): void {
    const item = popLast(state.cargo);
    if (!item) return;
    const e = this.loot.byId.get(item.id);
    if (!e) return;
    const p = this.freePointNear(this.player.x, this.player.y);
    this.loot.drop(e, p.x, p.y, now);
    markMoved(state.save.loot, e.id, p.x, p.y);
    persist();
    this.persistInFlight();
    this.say(`Сброшено: ${ITEMS[item.type].name} — останется здесь`, '#cfe9f5', 1400);
  }

  private freePointNear(x: number, y: number): { x: number; y: number } {
    const r = 34;
    const angles = [Math.PI, 0, Math.PI / 2, -Math.PI / 2, (3 * Math.PI) / 4, -(3 * Math.PI) / 4, Math.PI / 4, -Math.PI / 4];
    for (const a of angles) {
      const px = x + Math.cos(a) * r * -this.player.facing, py = y + Math.sin(a) * r;
      if (this.isFreeSpot(px, py)) return { x: Math.round(px), y: Math.round(py) };
    }
    return { x: Math.round(x), y: Math.round(y) };
  }

  private useOxygen(): void {
    if (beltTotal(state.belt, 'o2') <= 0) {
      this.say('Нет баллончиков', '#f2b134');
      return;
    }
    if (!state.dive.active) {
      this.say('Кислород и так полный', '#cfe9f5');
      return;
    }
    const from = beltUse(state.belt, 'o2', persist);
    if (!from) return;
    addOxygen(state.dive, OXYGEN.canister);
    state.current.supplies.used.o2 += 1;
    this.persistInFlight();
    this.bubbles(this.player.x, this.player.y - 10, 3);
    this.float(this.player.x, this.player.y - 20, `+${OXYGEN.canister} с O2`, '#9fe8e2');
  }

  private fire(now: number): void {
    const lvl = state.save.upgrades.weapon;
    if (lvl <= 0) {
      this.say('Нет оружия: гарпунное ружьё — ветка «Оружие» на базе', '#f2b134');
      return;
    }
    if (now < this.reloadUntil) return;
    if (beltTotal(state.belt, 'harpoons') <= 0) {
      this.say('Нет гарпунов', '#f2b134');
      return;
    }
    if (!beltUse(state.belt, 'harpoons', persist)) return;
    state.current.supplies.used.harpoons += 1;
    this.persistInFlight();
    this.reloadUntil = now + COMBAT.reload[lvl] * 1000;
    const h = this.harpoons.create(this.player.x + this.player.facing * 14, this.player.y + 2, 'harpoon') as Phaser.Physics.Arcade.Image;
    h.setDepth(22).setFlipX(this.player.facing < 0);
    (h.body as Phaser.Physics.Arcade.Body).setVelocityX(this.player.facing * COMBAT.harpoonSpeed);
    h.setData('until', now + COMBAT.harpoonLife * 1000);
    h.setData('dmg', COMBAT.damage[lvl]);
  }

  private cutNet(net: Net, dt: number): void {
    const s = state.save;
    if (!s.knife.owned) {
      this.sayOnce('Нужен нож — он где-то в пещере', '#f2b134');
      return;
    }
    if (s.knife.durability <= 0) {
      this.sayOnce(`Нож затупился: ремонт на базе, ${KNIFE.repairCost} монеты за единицу`, '#f2b134');
      return;
    }
    if (s.upgrades.tools < this.barriers.requiredTool(net)) {
      this.sayOnce('Толстая сеть с цепью: нужен резак (Инструменты 1)', '#f2b134');
      return;
    }
    if (this.barriers.cutTick(net, dt, s.upgrades.tools)) {
      s.knife.durability -= 1;
      s.netsCut.push(net.id);
      persist();
      this.rebuildNav();
      this.say(`Сеть разрезана. Нож ${s.knife.durability}/${effects.knifeMax(s.upgrades.tools)}${s.knife.durability === 0 ? ' — затупился, ремонт на базе' : ''}`, '#9fe8e2', 2500);
      }
  }

  private onCreatureTouch(c: Creature): void {
    if (this.mode !== 'diving' || this.player.isInvulnerable) return;
    const suit = state.save.upgrades.suit;
    const dmg = suit >= 2 ? COMBAT.suitFishDamageLvl2 : COMBAT.fishDamage * COMBAT.suitMul[suit];
    this.hurt(dmg, c.x, c.y);
    this.creatures.onBite(c);
    this.hits.fish += 1;
  }

  private onCoralTouch(): void {
    if (this.mode !== 'diving' || this.player.isInvulnerable) return;
    const suit = state.save.upgrades.suit;
    if (suit >= COMBAT.suitCoralImmuneLevel) return;
    const now = this.time.now;
    if (now - this.lastCoralHit < 1000) return;
    this.lastCoralHit = now;
    this.hurt(COMBAT.coralDamage * COMBAT.suitMul[suit], this.player.x + this.player.facing * 10, this.player.y + 10);
    this.hits.coral += 1;
  }

  private hurt(seconds: number, fromX: number, fromY: number): void {
    const now = this.time.now;
    if (!state.infiniteO2) state.dive.oxygen = Math.max(0, state.dive.oxygen - seconds);
    this.player.knockFrom(fromX, fromY, now, COMBAT.knockback, COMBAT.invuln * 1000);
    this.cameras.main.shake(120, 0.004);
    this.float(this.player.x, this.player.y - 24, `−${Math.round(seconds)} с O2`, '#ff7a6e');
  }

  private onHarpoonHit(h: Phaser.Physics.Arcade.Image, c: Creature): void {
    if (!h.active) return;
    const dmg = (h.getData('dmg') as number) ?? 1;
    h.destroy();
    if (this.creatures.damage(c, dmg)) this.float(c.x, c.y - 16, 'Существо повержено', '#9fe8e2');
  }

  private onPointerDown(p: Phaser.Input.Pointer): void {
    if (this.mode !== 'diving' || p.wasTouch) return;
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    const e = this.loot.atPoint(w.x, w.y, this.player.x, this.player.y, this.time.now);
    if (e) this.tryPick(e, effects.haul(state.save.upgrades.haul));
  }

  touchAction(action: string): void {
    this.touchActions.add(action);
  }

  // ---------- Вспомогательное ----------

  say(text: string, color = '#e6f3f8', ms = 2200): void {
    this.hud.message = { text, until: this.time.now + ms, color };
  }

  private sayOnce(text: string, color: string): void {
    if (this.hud.message && this.hud.message.text === text && this.time.now < this.hud.message.until) return;
    this.say(text, color, 1500);
  }

  private showHint(id: string, text: string): void {
    if (state.hintsShown.has(id)) return;
    state.hintsShown.add(id);
    this.say(text, '#9fe8e2', 5000);
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

export function zoomFor(height: number): number {
  return Phaser.Math.Clamp(Math.floor(height / 300), 2, 4);
}

export const TILE = WORLD.tile;
