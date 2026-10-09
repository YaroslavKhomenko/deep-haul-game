// Связка груза: предметы следуют по пройденному пути за дайвером (без физики верёвок).
import Phaser from 'phaser';
import { TETHER } from '../config/balance.ts';
import type { CargoItem } from '../core/cargo.ts';
import { LOOT_TEXTURE } from '../assets/generated.ts';

interface Pt { x: number; y: number }

export class Tether {
  private trail: Pt[] = [];
  private sprites: Phaser.GameObjects.Image[] = [];
  private rope: Phaser.GameObjects.Graphics;
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.rope = scene.add.graphics().setDepth(18);
  }

  reset(x: number, y: number): void {
    this.trail = [{ x, y }];
    for (const s of this.sprites) s.destroy();
    this.sprites = [];
    this.rope.clear();
  }

  update(px: number, py: number, cargo: readonly CargoItem[], time: number): void {
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(px - last.x, py - last.y) >= 4) this.trail.push({ x: px, y: py });

    // синхронизация спрайтов с грузом
    while (this.sprites.length > cargo.length) this.sprites.pop()!.destroy();
    while (this.sprites.length < cargo.length) {
      const item = cargo[this.sprites.length];
      const s = this.scene.add.image(px, py, LOOT_TEXTURE[item.type]).setDepth(19);
      this.sprites.push(s);
    }
    for (let i = 0; i < cargo.length; i++) {
      const key = LOOT_TEXTURE[cargo[i].type];
      if (this.sprites[i].texture.key !== key) this.sprites[i].setTexture(key);
    }

    const spacing = cargo.length > TETHER.bagAfter ? 10 : TETHER.spacing;
    const needed = TETHER.lead + spacing * cargo.length + 40;
    // обрезаем хвост трейла до нужной длины
    let acc = 0;
    let cut = this.trail.length - 1;
    for (let i = this.trail.length - 1; i > 0; i--) {
      acc += Math.hypot(this.trail[i].x - this.trail[i - 1].x, this.trail[i].y - this.trail[i - 1].y);
      cut = i - 1;
      if (acc > needed) break;
    }
    if (cut > 0) this.trail.splice(0, cut);

    this.rope.clear();
    if (cargo.length === 0) return;
    this.rope.lineStyle(1, 0x9fb7a4, 0.8);
    this.rope.beginPath();
    this.rope.moveTo(px, py + 4);
    for (let i = 0; i < cargo.length; i++) {
      const d = TETHER.lead + spacing * i;
      const p = this.pointAt(d);
      const bob = Math.sin(time / 300 + i) * 1.2;
      this.sprites[i].setPosition(Math.round(p.x), Math.round(p.y + bob));
      this.rope.lineTo(p.x, p.y + bob);
    }
    this.rope.strokePath();
  }

  /** Точка на расстоянии d назад вдоль трейла от текущей позиции. */
  private pointAt(d: number): Pt {
    let acc = 0;
    for (let i = this.trail.length - 1; i > 0; i--) {
      const a = this.trail[i], b = this.trail[i - 1];
      const seg = Math.hypot(a.x - b.x, a.y - b.y);
      if (acc + seg >= d) {
        const t = seg === 0 ? 0 : (d - acc) / seg;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
      acc += seg;
    }
    const first = this.trail[0];
    return { x: first.x, y: first.y + (d - acc) * 0.3 };
  }
}
