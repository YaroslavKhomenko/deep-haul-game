import Phaser from 'phaser';
import { PROP_FRAMES } from '../config/map.ts';
import { createGeneratedTextures } from '../assets/generated.ts';
import { MODE } from '../mode.ts';

const A = 'assets/ansimuz/PNG/';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    this.load.image('tiles', `${A}environment/tiles.png`);
    this.load.image('background', `${A}environment/background.png`);
    this.load.image('midground', `${A}environment/midground.png`);
    this.load.image('props', `${A}environment/props.png`);
    // Кадры 80×80 (SOURCE.md): idle 6, swiming 7, fast 5, rush 7, hurt 5
    this.load.spritesheet('player-idle', `${A}player/player-idle.png`, { frameWidth: 80, frameHeight: 80 });
    this.load.spritesheet('player-swim', `${A}player/player-swiming.png`, { frameWidth: 80, frameHeight: 80 });
    this.load.spritesheet('player-fast', `${A}player/player-fast.png`, { frameWidth: 80, frameHeight: 80 });
    this.load.spritesheet('player-hurt', `${A}player/player-hurt.png`, { frameWidth: 80, frameHeight: 80 });
    this.load.spritesheet('player-rush', `${A}player/player-rush.png`, { frameWidth: 80, frameHeight: 80 });
    // Нарезка существ и эффектов — из демо-кода автора
    this.load.spritesheet('fish', `${A}enemies/fish.png`, { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('fish-big', `${A}enemies/fish-big.png`, { frameWidth: 54, frameHeight: 49 });
    this.load.spritesheet('fish-dart', `${A}enemies/fish-dart.png`, { frameWidth: 39, frameHeight: 20 });
    this.load.spritesheet('bubbles', `${A}FX/bubbles.png`, { frameWidth: 23, frameHeight: 40 });
    this.load.spritesheet('enemy-death', `${A}FX/enemy-death.png`, { frameWidth: 52, frameHeight: 53 });
  }

  create(): void {
    const anim = (key: string, sheet: string, end: number, rate: number, repeat = -1) =>
      this.anims.create({ key, frames: this.anims.generateFrameNumbers(sheet, { start: 0, end }), frameRate: rate, repeat });
    anim('diver-idle', 'player-idle', 5, 10);
    anim('diver-swim', 'player-swim', 6, 12);
    anim('diver-fast', 'player-fast', 4, 14);
    anim('diver-hurt', 'player-hurt', 4, 12, 0);
    anim('diver-rush', 'player-rush', 6, 14, 0);
    anim('fish-swim', 'fish', 3, 8);
    anim('fish-big-swim', 'fish-big', 3, 6);
    anim('fish-dart-swim', 'fish-dart', 3, 10);
    anim('bubbles-rise', 'bubbles', 3, 8, 0);
    anim('enemy-death-anim', 'enemy-death', 5, 12, 0);

    const props = this.textures.get('props');
    for (const [name, [x, y, w, h]] of Object.entries(PROP_FRAMES)) props.add(name, 0, x, y, w, h);

    createGeneratedTextures(this);

    if (MODE === 'level') {
      this.scene.start('Level');
      this.scene.launch('LevelHud');
    } else {
      this.scene.start('Dive');
      this.scene.launch('Hud');
    }
  }
}
