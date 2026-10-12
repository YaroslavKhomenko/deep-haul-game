import Phaser from 'phaser';
import { BootScene } from './game/BootScene.ts';
import { DiveScene } from './game/DiveScene.ts';
import { HudScene } from './ui/HudScene.ts';
import { BaseScene } from './ui/BaseScene.ts';
import { installPauseHooks, sandboxPauseConfig } from './ui/pause.ts';
import { installDevPanel } from './ui/dev.ts';
import { state } from './game/state.ts';
import { LevelScene, levelPauseConfig } from './level/LevelScene.ts';
import { LevelHud } from './level/LevelHud.ts';
import { LevelBase } from './level/LevelBase.ts';
import { installLevelDev } from './level/dev.ts';
import { levelState } from './level/state.ts';
import { MODE } from './mode.ts';
import './ui/styles.css';

// RESIZE берёт размер родителя при старте рендера; у скрытой вкладки/панели он бывает 0×0, и WebGL падает
// с «Framebuffer status: Incomplete Attachment». Минимальный размер сцены исключает нулевой канвас.
const startW = Math.max(320, window.innerWidth || 0);
const startH = Math.max(240, window.innerHeight || 0);
const scenes = MODE === 'level' ? [BootScene, LevelScene, LevelHud, LevelBase] : [BootScene, DiveScene, HudScene, BaseScene];

function createGame(type: number): Phaser.Game {
  return new Phaser.Game({
    type,
    parent: 'app',
    backgroundColor: '#0b1d2e',
    pixelArt: true,
    roundPixels: true,
    scale: { mode: Phaser.Scale.RESIZE, width: startW, height: startH, min: { width: 320, height: 240 } },
    physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, debug: false } },
    scene: scenes,
  });
}

let game = createGame(Phaser.AUTO);
const getGame = () => game;

// Если WebGL-контекст не смог поднять framebuffer (скрытая вкладка, сломанный GL) — пересоздаём игру на Canvas.
let fellBack = false;
window.addEventListener('error', (e) => {
  if (fellBack || !String(e.message ?? '').includes('Framebuffer status')) return;
  fellBack = true;
  console.warn('[deep-haul] WebGL не стартовал, переключаюсь на Canvas-рендер');
  try {
    game.destroy(true);
  } catch {
    /* ignore */
  }
  game = createGame(Phaser.CANVAS);
});

if (MODE === 'level') {
  installPauseHooks(getGame, levelPauseConfig());
  installLevelDev(getGame);
} else {
  installPauseHooks(getGame, sandboxPauseConfig());
  installDevPanel(getGame);
}

// Служебный доступ для отчёта и автопрогонов: снимок экрана, журнал, состояние текущего режима.
declare global {
  interface Window {
    __deepHaul: {
      mode: typeof MODE;
      snapshot(): Promise<string>;
      log(): unknown;
      state: typeof state | typeof levelState;
      readonly game: Phaser.Game;
      readonly renderer: string;
    };
  }
}
window.__deepHaul = {
  mode: MODE,
  snapshot: () => new Promise<string>((resolve) => {
    game.renderer.snapshot((img) => resolve((img as HTMLImageElement).src));
  }),
  log: () => (MODE === 'level' ? levelState.save.log : state.save.log),
  state: MODE === 'level' ? levelState : state,
  get game() {
    return game;
  },
  get renderer() {
    return game.renderer.type === Phaser.WEBGL ? 'webgl' : 'canvas';
  },
};
