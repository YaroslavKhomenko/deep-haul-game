// Лут в мире по стабильным id: спавн из сохранения, видимость в свете фонаря, подбор, сброс, выкладывание при провале.
import Phaser from 'phaser';
import { ITEMS, PICKUP, type ItemType } from '../config/balance.ts';
import { MAP, type LootSpawn } from '../config/map.ts';
import { worldItems, type WorldItem } from '../core/lootState.ts';
import type { LootRecord } from '../core/save.ts';
import { LOOT_TEXTURE } from '../assets/generated.ts';

export type LootState = 'world' | 'cargo' | 'gone';

export interface LootEntity {
  id: string;
  type: ItemType;
  /** Остаток для пачек припасов. */
  n: number;
  sprite: Phaser.GameObjects.Image;
  baseY: number;
  lockedUntil: number;
  state: LootState;
  phase: number;
  /** Виден в свете фонаря (радиус + линия взгляда) — только видимое можно подобрать. */
  visible: boolean;
}

export class LootManager {
  entities: LootEntity[] = [];
  byId = new Map<string, LootEntity>();
  spawnsById = new Map<string, LootSpawn>();
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    for (const s of MAP.loot) this.spawnsById.set(s.id, s);
  }

  /** Пересобрать мир по сохранению: доставленное и израсходованное отсутствует, перемещённое — на новых местах. */
  spawnFromSave(lootSave: Record<string, LootRecord>): void {
    for (const e of this.entities) e.sprite.destroy();
    this.entities = [];
    this.byId.clear();
    for (const item of worldItems(MAP.loot, lootSave)) this.spawn(item);
  }

  private spawn(item: WorldItem): LootEntity {
    const sprite = this.scene.add.image(item.x, item.y, LOOT_TEXTURE[item.type]).setDepth(15).setVisible(false);
    const e: LootEntity = { id: item.id, type: item.type, n: item.n, sprite, baseY: item.y, lockedUntil: 0, state: 'world', phase: Math.random() * 6.28, visible: false };
    this.entities.push(e);
    this.byId.set(e.id, e);
    return e;
  }

  /** Выложить предметы в мир (высыпание при провале): существующие сущности переиспользуются. */
  placeWorld(items: WorldItem[]): void {
    for (const it of items) {
      const e = this.byId.get(it.id);
      if (e) {
        e.state = 'world';
        e.n = it.n;
        e.baseY = it.y;
        e.lockedUntil = 0;
        e.sprite.setPosition(it.x, it.y).setVisible(false);
      } else this.spawn(it);
    }
  }

  nearest(x: number, y: number, now: number, radius = PICKUP.radius): LootEntity | null {
    let best: LootEntity | null = null;
    let bestD = radius;
    for (const e of this.entities) {
      if (e.state !== 'world' || !e.visible || now < e.lockedUntil) continue;
      const d = Phaser.Math.Distance.Between(x, y, e.sprite.x, e.sprite.y);
      if (d <= bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  atPoint(wx: number, wy: number, px: number, py: number, now: number): LootEntity | null {
    for (const e of this.entities) {
      if (e.state !== 'world' || !e.visible || now < e.lockedUntil) continue;
      if (Phaser.Math.Distance.Between(wx, wy, e.sprite.x, e.sprite.y) > 18) continue;
      if (Phaser.Math.Distance.Between(px, py, e.sprite.x, e.sprite.y) <= PICKUP.radius) return e;
    }
    return null;
  }

  /** В связку. */
  take(e: LootEntity): void {
    e.state = 'cargo';
    e.sprite.setVisible(false);
    this.pulse(e.sprite.x, e.sprite.y);
  }

  /** Убрать из мира (припасы на пояс, нож в снаряжение). */
  remove(e: LootEntity): void {
    e.state = 'gone';
    e.sprite.setVisible(false);
    this.pulse(e.sprite.x, e.sprite.y);
  }

  private pulse(x: number, y: number): void {
    const p = this.scene.add.image(x, y, 'glow-teal').setDepth(17).setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: p, scale: 1.8, alpha: 0, duration: 260, onComplete: () => p.destroy() });
  }

  /** Сброс: остаётся в мире на новом месте, повторный подбор через 1 с. */
  drop(e: LootEntity, x: number, y: number, now: number): void {
    e.state = 'world';
    e.sprite.setPosition(x, y);
    e.baseY = y;
    e.lockedUntil = now + PICKUP.redropLock * 1000;
  }

  isOccupied(x: number, y: number, minDist = 16): boolean {
    return this.entities.some((e) => e.state === 'world' && Phaser.Math.Distance.Between(x, y, e.sprite.x, e.sprite.y) < minDist);
  }

  cargoIds(): string[] {
    return this.entities.filter((e) => e.state === 'cargo').map((e) => e.id);
  }

  update(now: number, px: number, py: number, radius: number, los: (x: number, y: number) => boolean): void {
    for (const e of this.entities) {
      if (e.state !== 'world') continue;
      const s = e.sprite;
      s.y = e.baseY + Math.sin(now / 500 + e.phase) * 1.5;
      const d = Phaser.Math.Distance.Between(px, py, s.x, s.y);
      e.visible = d <= radius && los(s.x, s.y);
      s.setVisible(e.visible);
      s.setAlpha(now < e.lockedUntil ? 0.5 : 1);
    }
  }

  static def(type: ItemType) {
    return ITEMS[type];
  }
}
