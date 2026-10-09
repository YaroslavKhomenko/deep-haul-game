// DOM-оверлеи: пауза (Esc, потеря фокуса, скрытие вкладки), подтверждение «Новая игра».
import type Phaser from 'phaser';
import type { DiveScene } from '../game/DiveScene.ts';
import { resetSave } from '../core/save.ts';
import { state } from '../game/state.ts';

let paused = false;

function overlay(): HTMLElement {
  return document.getElementById('overlay')!;
}

export function isPaused(): boolean {
  return paused;
}

export function openPause(game: Phaser.Game): void {
  if (paused) return;
  const dive = game.scene.getScene('Dive') as DiveScene | null;
  if (!dive) return;
  paused = true;
  game.scene.pause('Dive');
  game.scene.pause('Hud');
  if (game.scene.isActive('Base')) game.scene.pause('Base');
  dive.input.keyboard?.resetKeys();
  const diving = dive.mode === 'diving' && state.dive.active;
  const el = document.createElement('div');
  el.className = 'modal';
  el.id = 'pause-modal';
  el.innerHTML = `
    <h2>Пауза</h2>
    <p>Время и кислород остановлены. ${diving ? 'Погружение продолжится после явного нажатия «Продолжить».' : ''}</p>
    <p class="note">Перезагрузка страницы во время погружения считается провалом: груз и остатки найденных припасов <b>останутся лежать там, где вы были</b>, а вы вернётесь на базу. Деньги, покупки и припасы с базы сохраняются.</p>
    <div class="row">
      <button id="btn-resume" class="primary">Продолжить</button>
      ${diving ? '<button id="btn-abort" class="danger">Аварийный возврат (груз теряется)</button>' : ''}
      <button id="btn-newgame">Новая игра</button>
    </div>
    <p class="note">Управление: WASD/стрелки — плыть, E — взять (удерживать у сети — резать), Q — сбросить, R — баллончик O2, F/Пробел — гарпун, Esc — пауза.</p>`;
  overlay().appendChild(el);
  el.querySelector('#btn-resume')!.addEventListener('click', () => closePause(game));
  el.querySelector('#btn-abort')?.addEventListener('click', () => {
    closePause(game);
    dive.abortDive();
  });
  el.querySelector('#btn-newgame')!.addEventListener('click', () => {
    openConfirmNewGame(game);
  });
}

export function closePause(game: Phaser.Game): void {
  if (!paused) return;
  paused = false;
  document.getElementById('pause-modal')?.remove();
  game.scene.resume('Dive');
  game.scene.resume('Hud');
  if (game.scene.isPaused('Base')) game.scene.resume('Base');
  const dive = game.scene.getScene('Dive') as DiveScene;
  dive.input.keyboard?.resetKeys();
}

export function openConfirmNewGame(game: Phaser.Game): void {
  if (document.getElementById('confirm-modal')) return;
  const el = document.createElement('div');
  el.className = 'modal';
  el.id = 'confirm-modal';
  el.innerHTML = `
    <h2>Новая игра</h2>
    <p>Сбросить весь прогресс: монеты, детали, улучшения, припасы, капсулу и статистику?</p>
    <div class="row">
      <button id="btn-confirm-yes" class="danger">Да, сбросить</button>
      <button id="btn-confirm-no" class="primary">Отмена</button>
    </div>`;
  overlay().appendChild(el);
  el.querySelector('#btn-confirm-no')!.addEventListener('click', () => el.remove());
  el.querySelector('#btn-confirm-yes')!.addEventListener('click', () => {
    resetSave();
    location.reload();
  });
  void game;
}

export function installPauseHooks(getGame: () => Phaser.Game): void {
  const liveDive = (): DiveScene | null => {
    const d = getGame().scene.getScene('Dive') as DiveScene | null;
    return d && d.player ? d : null;
  };
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      e.preventDefault();
      if (!liveDive()) return;
      if (paused) closePause(getGame());
      else openPause(getGame());
    }
  });
  window.addEventListener('blur', () => {
    const dive = liveDive();
    if (state.autoPause && dive && dive.mode === 'diving') openPause(getGame());
  });
  document.addEventListener('visibilitychange', () => {
    const dive = liveDive();
    if (state.autoPause && document.hidden && dive && dive.mode === 'diving') openPause(getGame());
  });
}
