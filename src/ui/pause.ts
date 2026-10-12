// DOM-оверлеи: пауза (Esc, потеря фокуса, скрытие вкладки), подтверждение «Новая игра».
// Сцены и тексты задаёт конфиг режима; режим песочницы использует прежние значения (sandboxPauseConfig).
import type Phaser from 'phaser';
import type { DiveScene } from '../game/DiveScene.ts';
import { resetSave } from '../core/save.ts';
import { state } from '../game/state.ts';

export interface PauseConfig {
  /** Сцены, которые ставятся на паузу, если активны. Первая — мир (её клавиатура сбрасывается). */
  sceneKeys: string[];
  /** Мир создан и готов. */
  isReady(game: Phaser.Game): boolean;
  /** Идёт активное погружение: показывать кнопку возврата. */
  isDiving(game: Phaser.Game): boolean;
  /** Игрок в воде: авто-пауза при потере фокуса. */
  isInWater(game: Phaser.Game): boolean;
  autoPause(): boolean;
  abort(game: Phaser.Game): void;
  resetSave(): void;
  text: { divingNote: string; reloadNote: string; abortLabel: string; controls: string; newGameText: string };
}

export function sandboxPauseConfig(): PauseConfig {
  const dive = (game: Phaser.Game) => game.scene.getScene('Dive') as DiveScene | null;
  return {
    sceneKeys: ['Dive', 'Hud', 'Base'],
    isReady: (game) => !!dive(game)?.player,
    isDiving: (game) => dive(game)?.mode === 'diving' && state.dive.active,
    isInWater: (game) => dive(game)?.mode === 'diving',
    autoPause: () => state.autoPause,
    abort: (game) => dive(game)?.abortDive(),
    resetSave: () => resetSave(),
    text: {
      divingNote: 'Погружение продолжится после явного нажатия «Продолжить».',
      reloadNote: 'Перезагрузка страницы во время погружения считается провалом: груз и остатки найденных припасов <b>останутся лежать там, где вы были</b>, а вы вернётесь на базу. Деньги, покупки и припасы с базы сохраняются.',
      abortLabel: 'Аварийный возврат (груз теряется)',
      controls: 'Управление: WASD/стрелки — плыть, E — взять (удерживать у сети — резать), Q — сбросить, R — баллончик O2, F/Пробел — гарпун, Esc — пауза.',
      newGameText: 'Сбросить весь прогресс: монеты, детали, улучшения, припасы, капсулу и статистику?',
    },
  };
}

let paused = false;
let cfg: PauseConfig = sandboxPauseConfig();

function overlay(): HTMLElement {
  return document.getElementById('overlay')!;
}

function worldScene(game: Phaser.Game): Phaser.Scene | null {
  return game.scene.getScene(cfg.sceneKeys[0]) ?? null;
}

export function isPaused(): boolean {
  return paused;
}

export function openPause(game: Phaser.Game): void {
  if (paused || !cfg.isReady(game)) return;
  paused = true;
  for (const key of cfg.sceneKeys) if (game.scene.isActive(key)) game.scene.pause(key);
  worldScene(game)?.input.keyboard?.resetKeys();
  const diving = cfg.isDiving(game);
  const el = document.createElement('div');
  el.className = 'modal';
  el.id = 'pause-modal';
  el.innerHTML = `
    <h2>Пауза</h2>
    <p>Время и кислород остановлены. ${diving ? cfg.text.divingNote : ''}</p>
    <p class="note">${cfg.text.reloadNote}</p>
    <div class="row">
      <button id="btn-resume" class="primary">Продолжить</button>
      ${diving ? `<button id="btn-abort" class="danger">${cfg.text.abortLabel}</button>` : ''}
      <button id="btn-newgame">Новая игра</button>
    </div>
    <p class="note">${cfg.text.controls}</p>`;
  overlay().appendChild(el);
  el.querySelector('#btn-resume')!.addEventListener('click', () => closePause(game));
  el.querySelector('#btn-abort')?.addEventListener('click', () => {
    closePause(game);
    cfg.abort(game);
  });
  el.querySelector('#btn-newgame')!.addEventListener('click', () => {
    openConfirmNewGame(game);
  });
}

export function closePause(game: Phaser.Game): void {
  if (!paused) return;
  paused = false;
  document.getElementById('pause-modal')?.remove();
  for (const key of cfg.sceneKeys) if (game.scene.isPaused(key)) game.scene.resume(key);
  worldScene(game)?.input.keyboard?.resetKeys();
}

export function openConfirmNewGame(game: Phaser.Game): void {
  if (document.getElementById('confirm-modal')) return;
  const el = document.createElement('div');
  el.className = 'modal';
  el.id = 'confirm-modal';
  el.innerHTML = `
    <h2>Новая игра</h2>
    <p>${cfg.text.newGameText}</p>
    <div class="row">
      <button id="btn-confirm-yes" class="danger">Да, сбросить</button>
      <button id="btn-confirm-no" class="primary">Отмена</button>
    </div>`;
  overlay().appendChild(el);
  el.querySelector('#btn-confirm-no')!.addEventListener('click', () => el.remove());
  el.querySelector('#btn-confirm-yes')!.addEventListener('click', () => {
    cfg.resetSave();
    location.reload();
  });
  void game;
}

export function installPauseHooks(getGame: () => Phaser.Game, config: PauseConfig = sandboxPauseConfig()): void {
  cfg = config;
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      e.preventDefault();
      if (!cfg.isReady(getGame())) return;
      if (paused) closePause(getGame());
      else openPause(getGame());
    }
  });
  window.addEventListener('blur', () => {
    const game = getGame();
    if (cfg.autoPause() && cfg.isReady(game) && cfg.isInWater(game)) openPause(game);
  });
  document.addEventListener('visibilitychange', () => {
    const game = getGame();
    if (cfg.autoPause() && document.hidden && cfg.isReady(game) && cfg.isInWater(game)) openPause(game);
  });
}
