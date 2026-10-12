// Преграды: сети по id (разрезанные не возвращаются) и кораллы (опасность среды). Видны только в свете фонаря.
import Phaser from 'phaser';
import { KNIFE } from '../config/balance.ts';
import { MAP, type CoralSpawn, type NetSpawn, type Rect } from '../config/map.ts';

export interface Net {
  id: string;
  kind: 'thin' | 'thick';
  rect: Rect;
  sprite: Phaser.GameObjects.TileSprite;
  progress: number;
  cut: boolean;
}

export class BarrierManager {
  nets: Net[] = [];
  netGroup: Phaser.Physics.Arcade.StaticGroup;
  coralGroup: Phaser.Physics.Arcade.StaticGroup;
  private bars: Phaser.GameObjects.Graphics;
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.netGroup = scene.physics.add.staticGroup();
    this.coralGroup = scene.physics.add.staticGroup();
    this.bars = scene.add.graphics().setDepth(24);
  }

  /** Сети — только ещё не разрезанные по сохранению; кораллы — всегда. */
  spawnAll(netsCut: readonly string[], nets: readonly NetSpawn[] = MAP.nets, corals: readonly CoralSpawn[] = MAP.corals): void {
    for (const n of this.nets) n.sprite.destroy();
    this.nets = [];
    this.netGroup.clear(true, true);
    this.coralGroup.clear(true, true);
    for (const s of nets) if (!netsCut.includes(s.id)) this.spawnNet(s);
    for (const c of corals) {
      const zone = this.scene.add.image(c.x + c.w / 2, c.y + c.h / 2, 'props', 'coral').setDepth(12).setVisible(false);
      zone.setFlipX(!!c.flip);
      this.scene.physics.add.existing(zone, true);
      const body = zone.body as Phaser.Physics.Arcade.StaticBody;
      body.setSize(c.w, c.h, false);
      body.position.set(c.x, c.y);
      body.updateCenter();
      this.coralGroup.add(zone);
    }
  }

  private spawnNet(s: NetSpawn): void {
    const sprite = this.scene.add.tileSprite(s.x + s.w / 2, s.y + s.h / 2, s.w, s.h, s.kind === 'thin' ? 'net-thin' : 'net-thick').setDepth(14).setVisible(false);
    this.scene.physics.add.existing(sprite, true);
    this.netGroup.add(sprite);
    this.nets.push({ id: s.id, kind: s.kind, rect: { x: s.x, y: s.y, w: s.w, h: s.h }, sprite, progress: 0, cut: false });
  }

  /** Прямоугольники целых сетей — для навигации. */
  blockedRects(): Rect[] {
    return this.nets.filter((n) => !n.cut).map((n) => n.rect);
  }

  nearest(x: number, y: number): { net: Net; dist: number } | null {
    let best: { net: Net; dist: number } | null = null;
    for (const n of this.nets) {
      if (n.cut) continue;
      const cx = Phaser.Math.Clamp(x, n.rect.x, n.rect.x + n.rect.w);
      const cy = Phaser.Math.Clamp(y, n.rect.y, n.rect.y + n.rect.h);
      const d = Phaser.Math.Distance.Between(x, y, cx, cy);
      if (d <= KNIFE.reach && (!best || d < best.dist)) best = { net: n, dist: d };
    }
    return best;
  }

  requiredTool(net: Net): number {
    return net.kind === 'thin' ? 0 : 1;
  }

  /** Тик резки при удержании E; на Инструментах 2 вдвое быстрее. true — сеть разрезана. */
  cutTick(net: Net, dt: number, toolsLevel: number): boolean {
    const mul = toolsLevel >= 2 ? 0.5 : 1;
    net.progress += dt / (KNIFE.cutTime * mul);
    net.sprite.setAlpha(1 - net.progress * 0.5);
    if (net.progress >= 1) {
      net.cut = true;
      const { x, y } = net.sprite;
      this.netGroup.remove(net.sprite, true, true);
      for (let i = 0; i < 3; i++) {
        const b = this.scene.add.sprite(x + (Math.random() - 0.5) * 20, y + (Math.random() - 0.5) * net.rect.h * 0.6, 'bubbles', 0).setDepth(23);
        b.play('bubbles-rise');
        this.scene.tweens.add({ targets: b, y: b.y - 30, alpha: 0, duration: 700, onComplete: () => b.destroy() });
      }
      return true;
    }
    return false;
  }

  /** Открыть сеть без ножа (например, решётку при включении подстанции). true — если сеть была закрыта. */
  openNet(id: string): boolean {
    const net = this.nets.find((n) => n.id === id && !n.cut);
    if (!net) return false;
    net.cut = true;
    const { x, y } = net.sprite;
    this.netGroup.remove(net.sprite, true, true);
    for (let i = 0; i < 4; i++) {
      const b = this.scene.add.sprite(x + (Math.random() - 0.5) * net.rect.w * 0.8, y + (Math.random() - 0.5) * 12, 'bubbles', 0).setDepth(23);
      b.play('bubbles-rise');
      this.scene.tweens.add({ targets: b, y: b.y - 34, alpha: 0, duration: 800, onComplete: () => b.destroy() });
    }
    return true;
  }

  updateVisibility(px: number, py: number, radius: number, los: (x: number, y: number) => boolean): void {
    for (const n of this.nets) {
      if (n.cut) continue;
      const cx = Phaser.Math.Clamp(px, n.rect.x, n.rect.x + n.rect.w), cy = Phaser.Math.Clamp(py, n.rect.y, n.rect.y + n.rect.h);
      n.sprite.setVisible(Phaser.Math.Distance.Between(px, py, cx, cy) <= radius && los(cx, cy));
    }
    for (const obj of this.coralGroup.getChildren()) {
      const img = obj as Phaser.GameObjects.Image;
      img.setVisible(Phaser.Math.Distance.Between(px, py, img.x, img.y) <= radius + 24 && los(img.x, img.y));
    }
  }

  update(): void {
    this.bars.clear();
    for (const n of this.nets) {
      if (n.cut || n.progress <= 0 || !n.sprite.visible) continue;
      const x = n.rect.x + n.rect.w / 2 - 20, y = n.rect.y - 10;
      this.bars.fillStyle(0x0b1d2e, 0.9).fillRect(x, y, 40, 6);
      this.bars.fillStyle(0x3ec6c0, 1).fillRect(x + 1, y + 1, 38 * Math.min(1, n.progress), 4);
    }
  }
}
