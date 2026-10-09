import Phaser from 'phaser';
import { DIVER } from '../config/balance.ts';
import { approach } from '../core/movement.ts';

export class Player extends Phaser.Physics.Arcade.Sprite {
  vel = new Phaser.Math.Vector2(0, 0);
  facing: 1 | -1 = 1;
  invulnUntil = 0;
  hurtUntil = 0;
  frozen = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'player-idle', 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(DIVER.body, DIVER.body).setOffset((80 - DIVER.body) / 2, (80 - DIVER.body) / 2);
    body.setCollideWorldBounds(true);
    this.setDepth(20);
    this.play('diver-idle');
  }

  /** input — нормализованный вектор, target — целевая скорость px/с с учётом груза. */
  move(input: { x: number; y: number }, target: number, v0: number, dt: number, now: number): void {
    if (this.frozen) {
      this.vel.set(0, 0);
      this.setVelocity(0, 0);
      this.play('diver-idle', true);
      return;
    }
    const moving = input.x !== 0 || input.y !== 0;
    // ускорение (в том числе сразу после сброса) — быстро, замедление — плавно за 0.15 с
    const accelerating = target > this.vel.length() + 1;
    const tau = !moving ? DIVER.stopTau : accelerating ? DIVER.accelTau : DIVER.speedTau;
    this.vel.x = approach(this.vel.x, input.x * target, dt, tau);
    this.vel.y = approach(this.vel.y, input.y * target, dt, tau);
    if (Math.abs(this.vel.x) < 0.5) this.vel.x = 0;
    if (Math.abs(this.vel.y) < 0.5) this.vel.y = 0;
    this.setVelocity(this.vel.x, this.vel.y);
    if (input.x !== 0) this.facing = input.x > 0 ? 1 : -1;
    this.setFlipX(this.facing < 0);

    const speed = this.vel.length();
    if (now < this.hurtUntil) this.play('diver-hurt', true);
    else if (speed < 12) this.play('diver-idle', true);
    else if (speed > v0 * 0.8) this.play('diver-fast', true);
    else this.play('diver-swim', true);
  }

  /** Урон: отбрасывание от точки и неуязвимость. */
  knockFrom(x: number, y: number, now: number, strength: number, invulnMs: number): void {
    const dx = this.x - x, dy = this.y - y;
    const len = Math.hypot(dx, dy) || 1;
    this.vel.set((dx / len) * strength, (dy / len) * strength);
    this.invulnUntil = now + invulnMs;
    this.hurtUntil = now + 450;
    this.setTintFill(0xff8a7a);
    this.scene.time.delayedCall(90, () => this.clearTint());
  }

  get isInvulnerable(): boolean {
    return this.scene.time.now < this.invulnUntil;
  }
}
