// Dev-панель режима уровня (скрыта, клавиша `): золото, припасы, уровни улучшений, нож, бесконечный кислород, сброс.
import type Phaser from 'phaser';
import { GATE_ID, LEVEL_KNIFE, LEVEL_UPGRADES, LEVEL_UPGRADE_ORDER, upgradeMax } from './config.ts';
import { resetLevelSave } from './rules.ts';
import { levelState as S, persistLevel } from './state.ts';
import type { LevelBase } from './LevelBase.ts';

export function installLevelDev(getGame: () => Phaser.Game): void {
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Backquote') return;
    const existing = document.getElementById('dev-panel');
    if (existing) {
      existing.remove();
      return;
    }
    const sv = S.save;
    const el = document.createElement('div');
    el.id = 'dev-panel';
    el.className = 'dev';
    const levels = LEVEL_UPGRADE_ORDER.map((id) => `<label>${LEVEL_UPGRADES[id].name} <input type="number" min="0" max="${upgradeMax(id)}" data-up="${id}" value="${sv.upgrades[id]}"></label>`).join('');
    el.innerHTML = `
      <h3>DEV</h3>
      <label>Золото <input type="number" id="dev-gold" value="${sv.gold}"></label>
      <label>Припасы <input type="number" id="dev-sup" value="${sv.supplies}"></label>
      ${levels}
      <label><input type="checkbox" id="dev-knife" ${sv.knife.owned ? 'checked' : ''}> Нож найден</label>
      <label><input type="checkbox" id="dev-sub" ${sv.substation.restored ? 'checked' : ''}> Подстанция работает</label>
      <label><input type="checkbox" id="dev-o2" ${S.infiniteO2 ? 'checked' : ''}> Бесконечный кислород</label>
      <div class="row"><button id="dev-apply" class="primary">Применить</button><button id="dev-reset" class="danger">Сброс уровня</button></div>
      <p class="note">Применение ставит метку DEV. Подстанция и нож применяются после перезагрузки.</p>`;
    document.getElementById('overlay')!.appendChild(el);
    el.querySelector('#dev-apply')!.addEventListener('click', () => {
      sv.gold = Math.max(0, Number((el.querySelector('#dev-gold') as HTMLInputElement).value) || 0);
      sv.supplies = Math.max(0, Number((el.querySelector('#dev-sup') as HTMLInputElement).value) || 0);
      for (const input of el.querySelectorAll<HTMLInputElement>('input[data-up]')) {
        const id = input.dataset.up as keyof typeof sv.upgrades;
        sv.upgrades[id] = Math.max(0, Math.min(upgradeMax(id), Number(input.value) || 0));
      }
      if ((el.querySelector('#dev-knife') as HTMLInputElement).checked && !sv.knife.owned) sv.knife = { owned: true, durability: LEVEL_KNIFE.max };
      if ((el.querySelector('#dev-sub') as HTMLInputElement).checked && !sv.substation.restored) {
        sv.substation.restored = true;
        if (!sv.netsCut.includes(GATE_ID)) sv.netsCut.push(GATE_ID);
      }
      S.infiniteO2 = (el.querySelector('#dev-o2') as HTMLInputElement).checked;
      S.devActive = true;
      sv.devTouched = true;
      persistLevel();
      const game = getGame();
      const base = game.scene.getScene('LevelBase') as LevelBase | null;
      if (base && game.scene.isActive('LevelBase')) base.render();
      el.remove();
    });
    el.querySelector('#dev-reset')!.addEventListener('click', () => {
      resetLevelSave();
      location.reload();
    });
  });
}
