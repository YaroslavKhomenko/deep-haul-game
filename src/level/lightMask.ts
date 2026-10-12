// Тьма режима уровня: непрозрачный слой, из которого стираются полигон света фонаря (с мягким краем),
// пятна света баз и прямоугольник неба. Логика повторяет HudScene песочницы, но изолирована от неё.
import Phaser from 'phaser';
import { LIGHT } from '../config/balance.ts';

export interface LightDraw {
  /** Дайвер на экране. */
  player: { x: number; y: number };
  /** Дайвер в мире (полигон задан в мировых координатах). */
  playerWorld: { x: number; y: number };
  poly: number[];
  radius: number;
  zoom: number;
  /** Пятна света в экранных координатах (r — радиус на экране). */
  glows: { x: number; y: number; r: number }[];
  /** Полностью освещённые прямоугольники на экране (небо). */
  rects: { x: number; y: number; w: number; h: number }[];
}

export class LightMask {
  private scene: Phaser.Scene;
  private dark: Phaser.GameObjects.RenderTexture;
  private lightRT: Phaser.GameObjects.RenderTexture;
  private poly: Phaser.GameObjects.Graphics;
  private inv: Phaser.GameObjects.Image;
  private glow: Phaser.GameObjects.Image;
  private rect: Phaser.GameObjects.Image;
  private pts: Phaser.Math.Vector2[] = [];
  private size = 64;

  constructor(scene: Phaser.Scene, width: number, height: number) {
    this.scene = scene;
    this.dark = scene.add.renderTexture(0, 0, width, height).setOrigin(0).setDepth(0);
    // Источник для erase должен проходить willRender: держим его видимым, но за экраном
    this.lightRT = scene.add.renderTexture(-5000, -5000, this.size, this.size).setOrigin(0).setDepth(-10);
    this.poly = scene.make.graphics({ x: 0, y: 0 }, false);
    this.inv = scene.make.image({ key: 'light-inv-soft', add: false });
    this.glow = scene.make.image({ key: 'light', add: false });
    this.rect = scene.make.image({ key: 'pixel', add: false }).setOrigin(0);
  }

  resize(width: number, height: number): void {
    this.dark.destroy();
    this.dark = this.scene.add.renderTexture(0, 0, width, height).setOrigin(0).setDepth(0);
  }

  clear(): void {
    this.dark.clear();
  }

  draw(o: LightDraw): void {
    this.dark.clear();
    this.dark.fill(0x000000, 1);
    const size = Math.ceil(o.radius * o.zoom * 2 + LIGHT.wallBleed * 2 * o.zoom + 8);
    // RenderTexture.resize в Phaser 3.90 оставляет текстуру пустой для последующих draw — пересоздаём
    if (size !== this.size) {
      this.lightRT.destroy();
      this.lightRT = this.scene.add.renderTexture(-5000, -5000, size, size).setOrigin(0).setDepth(-10);
      this.size = size;
    }
    const half = size / 2;
    if (o.poly.length >= 6) {
      const n = o.poly.length / 2;
      while (this.pts.length < n) this.pts.push(new Phaser.Math.Vector2());
      this.pts.length = n;
      for (let i = 0; i < n; i++) {
        this.pts[i].set((o.poly[i * 2] - o.playerWorld.x) * o.zoom + half, (o.poly[i * 2 + 1] - o.playerWorld.y) * o.zoom + half);
      }
      this.lightRT.clear();
      this.poly.clear();
      this.poly.fillStyle(0xffffff, 1);
      this.poly.fillPoints(this.pts, true);
      this.lightRT.draw(this.poly, 0, 0);
      this.inv.setDisplaySize(size, size);
      this.lightRT.erase(this.inv, half, half);
      this.dark.erase(this.lightRT, o.player.x - half, o.player.y - half);
    }
    for (const g of o.glows) {
      this.glow.setDisplaySize(g.r * 2, g.r * 2);
      this.dark.erase(this.glow, g.x, g.y);
    }
    for (const r of o.rects) {
      if (r.w <= 0 || r.h <= 0) continue;
      this.rect.setDisplaySize(r.w, r.h);
      this.dark.erase(this.rect, r.x, r.y);
    }
  }
}
