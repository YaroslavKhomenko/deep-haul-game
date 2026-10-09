// Сенсорное управление: виртуальный стик слева, кнопки действий справа. Показывается только на тач-устройствах.
import Phaser from 'phaser';
import type { DiveScene } from '../game/DiveScene.ts';
import { openPause } from './pause.ts';
import { label } from './widgets.ts';

export class TouchControls {
  enabled: boolean;
  private stickBase: Phaser.GameObjects.Arc;
  private stickKnob: Phaser.GameObjects.Arc;
  private stickPointer: number | null = null;
  private origin = new Phaser.Math.Vector2();
  private buttons: { bg: Phaser.GameObjects.Arc; txt: Phaser.GameObjects.Text; action: string }[] = [];
  private width = 0;
  private dive: DiveScene;

  constructor(scene: Phaser.Scene, dive: DiveScene) {
    this.dive = dive;
    this.enabled = typeof window !== 'undefined' && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window);
    this.stickBase = scene.add.circle(0, 0, 48, 0x0f2338, 0.5).setStrokeStyle(2, 0x3ec6c0, 0.7).setDepth(7).setVisible(false);
    this.stickKnob = scene.add.circle(0, 0, 22, 0x3ec6c0, 0.8).setDepth(8).setVisible(false);
    if (!this.enabled) return;
    scene.input.addPointer(2);
    const defs: [string, string][] = [['pick', 'Взять'], ['drop', 'Сбросить'], ['o2', 'O2'], ['fire', 'Гарпун'], ['pause', 'II']];
    for (const [action, text] of defs) {
      const bg = scene.add.circle(0, 0, 30, 0x0f2338, 0.75).setStrokeStyle(2, 0x3ec6c0, 0.9).setDepth(7).setInteractive({ useHandCursor: true });
      const txt = label(scene, 0, 0, text, 12, '#e6f3f8', { fontStyle: 'bold' }).setOrigin(0.5).setDepth(8);
      bg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
        ev.stopPropagation();
        if (action === 'pause') openPause(scene.game);
        else dive.touchAction(action);
        bg.setFillStyle(0x3ec6c0, 0.9);
        scene.time.delayedCall(120, () => bg.setFillStyle(0x0f2338, 0.75));
      });
      this.buttons.push({ bg, txt, action });
    }
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.x < this.width / 2 && this.stickPointer === null) {
        this.stickPointer = p.id;
        this.origin.set(p.x, p.y);
        this.stickBase.setPosition(p.x, p.y).setVisible(true);
        this.stickKnob.setPosition(p.x, p.y).setVisible(true);
      }
    });
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.id !== this.stickPointer) return;
      const dx = p.x - this.origin.x, dy = p.y - this.origin.y;
      const len = Math.hypot(dx, dy);
      const max = 44;
      const k = len > max ? max / len : 1;
      this.stickKnob.setPosition(this.origin.x + dx * k, this.origin.y + dy * k);
      const dead = 8;
      dive.touchInput.x = len < dead ? 0 : (dx * k) / max;
      dive.touchInput.y = len < dead ? 0 : (dy * k) / max;
    });
    const release = (p: Phaser.Input.Pointer) => {
      if (p.id !== this.stickPointer) return;
      this.stickPointer = null;
      this.stickBase.setVisible(false);
      this.stickKnob.setVisible(false);
      dive.touchInput.x = 0;
      dive.touchInput.y = 0;
    };
    scene.input.on('pointerup', release);
    scene.input.on('pointerupoutside', release);
  }

  layout(width: number, height: number): void {
    this.width = width;
    if (!this.enabled) return;
    const positions: [number, number][] = [
      [width - 60, height - 70], [width - 130, height - 110], [width - 60, height - 150], [width - 130, height - 190], [width - 40, 100],
    ];
    this.buttons.forEach((b, i) => {
      const [x, y] = positions[i];
      b.bg.setPosition(x, y);
      b.txt.setPosition(x, y);
    });
  }

  update(diving: boolean): void {
    if (!this.enabled) return;
    for (const b of this.buttons) {
      const show = diving || b.action === 'pause';
      b.bg.setVisible(show);
      b.txt.setVisible(show);
    }
    void this.dive;
  }
}
