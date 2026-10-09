// Dev-панель (скрыта, клавиша `): деньги, детали, уровни улучшений, бесконечный кислород, сброс. Вмешательства помечаются DEV.
import type Phaser from 'phaser';
import { UPGRADES, UPGRADE_ORDER } from '../config/balance.ts';
import { maxLevel } from '../core/economy.ts';
import { resetSave } from '../core/save.ts';
import { persist, state } from '../game/state.ts';
import type { BaseScene } from './BaseScene.ts';

export function installDevPanel(getGame: () => Phaser.Game): void {
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Backquote') return;
    const game = getGame();
    const existing = document.getElementById('dev-panel');
    if (existing) {
      existing.remove();
      return;
    }
    const el = document.createElement('div');
    el.id = 'dev-panel';
    el.className = 'dev';
    const levels = UPGRADE_ORDER.map((id) => `<label>${UPGRADES[id].name} <input type="number" min="0" max="${maxLevel(id)}" data-up="${id}" value="${state.save.upgrades[id]}"></label>`).join('');
    el.innerHTML = `
      <h3>DEV</h3>
      <label>Монеты <input type="number" id="dev-coins" value="${state.save.coins}"></label>
      <label>Детали <input type="number" id="dev-parts" value="${state.save.parts}"></label>
      ${levels}
      <label><input type="checkbox" id="dev-o2" ${state.infiniteO2 ? 'checked' : ''}> Бесконечный кислород</label>
      <label><input type="checkbox" id="dev-knife" ${state.save.knife.owned ? 'checked' : ''}> Нож найден</label>
      <div class="row"><button id="dev-apply" class="primary">Применить</button><button id="dev-reset" class="danger">Сброс сохранения</button></div>
      <p class="note">Любое применение ставит метку DEV в HUD и в журнал прогона.</p>`;
    document.getElementById('overlay')!.appendChild(el);
    el.querySelector('#dev-apply')!.addEventListener('click', () => {
      const s = state.save;
      s.coins = Math.max(0, Number((el.querySelector('#dev-coins') as HTMLInputElement).value) || 0);
      s.parts = Math.max(0, Number((el.querySelector('#dev-parts') as HTMLInputElement).value) || 0);
      for (const input of el.querySelectorAll<HTMLInputElement>('input[data-up]')) {
        const id = input.dataset.up as keyof typeof s.upgrades;
        s.upgrades[id] = Math.max(0, Math.min(maxLevel(id), Number(input.value) || 0));
      }
      state.infiniteO2 = (el.querySelector('#dev-o2') as HTMLInputElement).checked;
      const knifeOn = (el.querySelector('#dev-knife') as HTMLInputElement).checked;
      if (knifeOn && !s.knife.owned) s.knife = { owned: true, durability: 3 };
      if (!knifeOn) s.knife = { owned: false, durability: 0 };
      state.devActive = true;
      s.devTouched = true;
      state.current.dev = true;
      persist();
      const base = game.scene.getScene('Base') as BaseScene | null;
      if (base && game.scene.isActive('Base')) base.render();
      el.remove();
    });
    el.querySelector('#dev-reset')!.addEventListener('click', () => {
      resetSave();
      location.reload();
    });
  });
}
