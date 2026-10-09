// Опасные существа: рыба-преследователь, большая рыба-патруль, рыба-дарт. ИИ по мотивам демо автора набора.
import Phaser from 'phaser';
import { CREATURES } from '../config/balance.ts';
import { MAP, type CreatureKind, type CreatureSpawn } from '../config/map.ts';

type DartState = 'perch' | 'dash' | 'stun' | 'return';

export class Creature extends Phaser.Physics.Arcade.Sprite {
  kind: CreatureKind;
  hp: number;
  home: { x: number; y: number };
  dir: 1 | -1 = 1;
  minX = 0;
  maxX = 0;
  dartState: DartState = 'perch';
  timer = 0;
  /** Рыба-преследователь: до этого момента отступает после укуса и не преследует. */
  retreatUntil = 0;

  constructor(scene: Phaser.Scene, spawn: CreatureSpawn) {
    const tex = spawn.kind === 'fish' ? 'fish' : spawn.kind === 'fishBig' ? 'fish-big' : 'fish-dart';
    super(scene, spawn.x, spawn.y, tex, 0);
    this.kind = spawn.kind;
    this.home = { x: spawn.x, y: spawn.y };
    this.hp = spawn.kind === 'fish' ? CREATURES.fish.hp : spawn.kind === 'fishBig' ? CREATURES.fishBig.hp : CREATURES.dart.hp;
    this.minX = spawn.minX ?? spawn.x - 100;
    this.maxX = spawn.maxX ?? spawn.x + 100;
    this.dir = spawn.facing ?? 1;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (spawn.kind === 'fish') body.setSize(24, 18).setOffset(4, 7);
    else if (spawn.kind === 'fishBig') body.setSize(40, 32).setOffset(7, 8);
    else body.setSize(30, 10).setOffset(4, 5);
    body.setCollideWorldBounds(true);
    this.setDepth(21);
    this.play(spawn.kind === 'fish' ? 'fish-swim' : spawn.kind === 'fishBig' ? 'fish-big-swim' : 'fish-dart-swim');
  }
}

export class CreatureManager {
  group: Phaser.Physics.Arcade.Group;
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.group = scene.physics.add.group({ allowGravity: false });
  }

  spawnAll(): void {
    this.group.clear(true, true);
    for (const s of MAP.creatures) this.group.add(new Creature(this.scene, s));
  }

  update(dt: number, px: number, py: number): void {
    for (const obj of this.group.getChildren()) {
      const c = obj as Creature;
      if (!c.active) continue;
      if (c.kind === 'fish') this.updateFish(c, px, py);
      else if (c.kind === 'fishBig') this.updateBig(c);
      else this.updateDart(c, dt, px, py);
    }
  }

  private updateFish(c: Creature, px: number, py: number): void {
    const cfg = CREATURES.fish;
    const dPlayer = Phaser.Math.Distance.Between(c.x, c.y, px, py);
    const dHome = Phaser.Math.Distance.Between(c.x, c.y, c.home.x, c.home.y);
    const body = c.body as Phaser.Physics.Arcade.Body;
    const retreating = this.scene.time.now < c.retreatUntil;
    if (!retreating && dPlayer < cfg.aggro && dHome < cfg.leash) {
      this.scene.physics.moveTo(c, px, py, cfg.speed);
    } else if (dHome > 6) {
      this.scene.physics.moveTo(c, c.home.x, c.home.y, cfg.speed * 0.6);
    } else body.setVelocity(0, 0);
    if (Math.abs(body.velocity.x) > 2) c.setFlipX(body.velocity.x < 0);
  }

  private updateBig(c: Creature): void {
    const cfg = CREATURES.fishBig;
    const body = c.body as Phaser.Physics.Arcade.Body;
    if (c.x <= c.minX || body.blocked.left) c.dir = 1;
    if (c.x >= c.maxX || body.blocked.right) c.dir = -1;
    body.setVelocity(cfg.speed * c.dir, Math.sin(this.scene.time.now / 900) * 8);
    c.setFlipX(c.dir < 0);
  }

  private updateDart(c: Creature, dt: number, px: number, py: number): void {
    const cfg = CREATURES.dart;
    const body = c.body as Phaser.Physics.Arcade.Body;
    switch (c.dartState) {
      case 'perch': {
        body.setVelocity(0, 0);
        c.dir = px < c.x ? -1 : 1;
        c.setFlipX(c.dir < 0);
        if (Math.abs(py - c.y) < cfg.band && Math.abs(px - c.x) < cfg.range) {
          c.dartState = 'dash';
          c.timer = cfg.dashTime;
        }
        break;
      }
      case 'dash': {
        body.setVelocity(cfg.dashSpeed * c.dir, 0);
        c.timer -= dt;
        if (body.blocked.left || body.blocked.right || c.timer <= 0) {
          c.dartState = 'stun';
          c.timer = cfg.stun;
        }
        break;
      }
      case 'stun': {
        body.setVelocity(0, 0);
        c.timer -= dt;
        if (c.timer <= 0) c.dartState = 'return';
        break;
      }
      case 'return': {
        const d = Phaser.Math.Distance.Between(c.x, c.y, c.home.x, c.home.y);
        if (d < 4) {
          c.dartState = 'perch';
          body.setVelocity(0, 0);
        } else {
          this.scene.physics.moveTo(c, c.home.x, c.home.y, cfg.returnSpeed);
          c.setFlipX(body.velocity.x < 0);
        }
        break;
      }
    }
  }

  /** Существа видны только в свете фонаря и на линии взгляда. */
  updateVisibility(px: number, py: number, radius: number, los: (x: number, y: number) => boolean): void {
    for (const obj of this.group.getChildren()) {
      const c = obj as Creature;
      if (!c.active) continue;
      c.setVisible(Phaser.Math.Distance.Between(px, py, c.x, c.y) <= radius + 16 && los(c.x, c.y));
    }
  }

  /** После укуса рыба-преследователь отступает к дому и не кусает повторно это время. */
  onBite(c: Creature): void {
    if (c.kind === 'fish') c.retreatUntil = this.scene.time.now + CREATURES.fish.retreat * 1000;
  }

  /** Урон существу; при смерти — анимация из набора и удаление. Возвращает true, если убито. */
  damage(c: Creature, dmg: number): boolean {
    c.hp -= dmg;
    c.setTintFill(0xffffff);
    this.scene.time.delayedCall(70, () => c.active && c.clearTint());
    if (c.hp > 0) return false;
    const fx = this.scene.add.sprite(c.x, c.y, 'enemy-death', 0).setDepth(23);
    fx.play('enemy-death-anim');
    fx.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => fx.destroy());
    this.group.remove(c, true, true);
    return true;
  }
}
