// Экран базы уровня (лодка или подстанция): итог вылазки, ресурсы, четыре улучшения, отдельный блок ножа,
// текущая цель, «Нырнуть». После ремонта лодки — экран результата.
import Phaser from 'phaser';
import { ITEMS } from '../config/balance.ts';
import { COLORS, button, formatTime, label, panel } from '../ui/widgets.ts';
import { openConfirmNewGame } from '../ui/pause.ts';
import { CRATE_SUPPLIES, LEVEL_KNIFE, LEVEL_UPGRADES, LEVEL_UPGRADE_ORDER, upgradeMax, upgradeValue, type LevelUpgradeId } from './config.ts';
import { LEVEL } from './map.ts';
import type { LevelScene } from './LevelScene.ts';
import { buyLevelUpgrade, canBuyUpgrade, goalText, knifeRepairable, repairLevelKnife, resetLevelSave } from './rules.ts';
import { levelState as S, persistLevel } from './state.ts';

const W = 960, H = 540;

export class LevelBase extends Phaser.Scene {
  private root!: Phaser.GameObjects.Container;
  private dim!: Phaser.GameObjects.Rectangle;
  private goldShown = 0;
  private closing = false;

  constructor() {
    super('LevelBase');
  }

  private get level(): LevelScene {
    return this.scene.get('Level') as LevelScene;
  }

  create(): void {
    this.dim = this.add.rectangle(0, 0, 10, 10, 0x05101c, 0.3).setOrigin(0).setAlpha(0);
    this.root = this.add.container(0, 0).setAlpha(0);
    this.goldShown = S.save.gold - (S.last?.arrival?.gold ?? 0);
    this.closing = false;
    this.render();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this));
    this.onResize(this.scale.gameSize);
    this.tweens.add({ targets: [this.root, this.dim], alpha: 1, duration: 300, ease: 'Sine.Out' });
    if (this.goldShown !== S.save.gold) {
      const o = { v: this.goldShown };
      this.tweens.add({ targets: o, v: S.save.gold, duration: 700, delay: 200, ease: 'Cubic.Out', onUpdate: () => { this.goldShown = Math.round(o.v); this.render(); } });
    }
  }

  private onResize(gs: Phaser.Structs.Size): void {
    const sc = Math.min(gs.width / W, gs.height / H);
    this.dim.setSize(gs.width, gs.height);
    this.root.setScale(sc).setPosition((gs.width - W * sc) / 2, (gs.height - H * sc) / 2);
  }

  private dive(): void {
    if (this.closing) return;
    this.closing = true;
    this.tweens.add({ targets: [this.root, this.dim], alpha: 0, duration: 220, ease: 'Sine.In', onComplete: () => this.level.startSortie() });
  }

  render(): void {
    if (!this.root) return;
    this.root.removeAll(true);
    const sv = S.save;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => { this.root.add(o); return o; };
    if (sv.completed) {
      this.result(add);
      return;
    }
    const base = S.base;
    add(label(this, 16, 12, base === 'sub' ? 'ПОДСТАНЦИЯ' : 'ЛОДКА', 16, COLORS.accent, { fontStyle: 'bold' }));
    add(label(this, W - 16, 14, `вылазок ${sv.stats.dives} • время ${formatTime(sv.stats.playMs)}`, 12, COLORS.dim).setOrigin(1, 0));

    // ---------- Слева: итог вылазки и ресурсы ----------
    add(panel(this, 16, 40, 280, 214));
    add(label(this, 28, 48, 'Итог вылазки', 15, COLORS.text, { fontStyle: 'bold' }));
    let y = 72;
    const line = (t: string, color = COLORS.text, size = 12) => { const tx = add(label(this, 28, y, t, size, color, { wordWrap: { width: 258 } })); y += tx.height + 4; };
    const last = S.last;
    if (!last || last.kind === 'start') {
      line('Кислород восстановлен. Здесь можно разгрузиться, улучшить снаряжение и снова нырнуть.', COLORS.dim);
    } else if (last.kind === 'success' && last.arrival) {
      const a = last.arrival;
      line('Вылазка завершена', COLORS.accent, 13);
      const parts = Object.entries(a.counts).map(([t, n]) => `${ITEMS[t as keyof typeof ITEMS].name} ×${n}`);
      if (parts.length) line(`Сдано: ${parts.join(', ')}`, COLORS.dim, 11);
      line(`Золото +${a.gold} • Припасы +${a.supplies}`, COLORS.accent, 13);
      if (!parts.length) line('Кислород восстановлен.', COLORS.dim, 11);
    } else {
      const why = last.kind === 'oxygen' ? 'Кислород закончился' : last.kind === 'abort' ? 'Возврат на базу' : 'Вылазка прервана перезагрузкой';
      line(why, COLORS.danger, 13);
      if (last.placed) line(`Груз (${last.placed}) остался на глубине ≈ ${last.failDepthM} м — за ним можно вернуться.`, COLORS.dim, 11);
      line('Улучшения, открытые проходы и подстанция сохранены.', COLORS.dim, 11);
    }
    if (last?.installed) line(`Установлено компонентов: ${last.installed}`, COLORS.dim, 11);
    if (last?.restoredNow) line('Подстанция заработала: решётка в полу открыта, здесь новая база.', COLORS.accent, 11);
    if (S.cargo.length) {
      y += 4;
      const names = S.cargo.map((c) => ITEMS[c.type].name);
      const where = S.cargo.some((c) => c.type === 'engine') ? 'двигатель нужно доставить к лодке' : 'компонент нужно доставить к подстанции';
      line(`В связке: ${names.join(', ')} — ${where}.`, COLORS.warn, 11);
    }

    add(panel(this, 16, 262, 280, 122));
    add(label(this, 28, 270, 'Ресурсы', 15, COLORS.text, { fontStyle: 'bold' }));
    add(label(this, 28, 294, `Золото ${this.goldShown}`, 16, COLORS.warn, { fontStyle: 'bold' }));
    add(label(this, 28, 314, 'из находок — на четыре улучшения', 11, COLORS.dim));
    add(label(this, 28, 334, `Припасы ${sv.supplies}`, 16, '#9fe8e2', { fontStyle: 'bold' }));
    add(label(this, 28, 354, `из ящиков снабжения (${CRATE_SUPPLIES} за ящик) — на ремонт ножа`, 11, COLORS.dim, { wordWrap: { width: 258 } }));
    add(label(this, 16, 392, 'Ресурсы общие для лодки и работающей подстанции. Детали лодки и подстанции не продаются — их везут к своему объекту.', 10, COLORS.dim, { wordWrap: { width: 280 } }));

    // ---------- Центр: четыре улучшения ----------
    add(panel(this, 304, 40, 392, 484));
    add(label(this, 316, 48, 'Улучшения', 15, COLORS.text, { fontStyle: 'bold' }));
    add(label(this, 690, 50, 'сохраняются в этом районе', 11, COLORS.dim).setOrigin(1, 0));
    LEVEL_UPGRADE_ORDER.forEach((id, i) => this.card(add, id, 316, 72 + i * 112));

    // ---------- Справа: цель, нож, нырнуть ----------
    add(panel(this, 704, 40, 240, 112));
    add(label(this, 716, 48, 'Цель', 15, COLORS.text, { fontStyle: 'bold' }));
    add(label(this, 716, 70, goalText(sv, S.cargo), 13, COLORS.accent, { wordWrap: { width: 216 } }));
    if (sv.knife.owned) {
      add(panel(this, 704, 160, 240, 150));
      add(label(this, 716, 168, 'Нож', 15, COLORS.text, { fontStyle: 'bold' }));
      add(label(this, 932, 170, 'обслуживание', 11, COLORS.dim).setOrigin(1, 0));
      const dur = sv.knife.durability;
      add(label(this, 716, 192, `Прочность ${dur}/${LEVEL_KNIFE.max}${dur === 0 ? ' — не режет' : ''}`, 14, dur === 0 ? COLORS.danger : COLORS.text, { fontStyle: 'bold' }));
      add(label(this, 716, 214, `Разрез сети: −1. Ремонт: ${LEVEL_KNIFE.repairCost} припас за единицу.`, 11, COLORS.dim, { wordWrap: { width: 216 } }));
      const b1 = button(this, 716, 246, 70, 28, '+1', () => this.repair(1), knifeRepairable(sv, 1) > 0, 12);
      add(b1.bg); add(b1.txt);
      const full = LEVEL_KNIFE.max - dur;
      const b2 = button(this, 794, 246, 138, 28, full > 0 ? `Полностью (${full * LEVEL_KNIFE.repairCost})` : 'Нож цел', () => this.repair(full), knifeRepairable(sv, full) >= full && full > 0, 12);
      add(b2.bg); add(b2.txt);
      if (dur < LEVEL_KNIFE.max && sv.supplies < LEVEL_KNIFE.repairCost) add(label(this, 716, 282, 'Нет припасов: ищите ящики снабжения.', 11, COLORS.warn));
    }
    const go = button(this, 716, 452, 216, 44, 'НЫРНУТЬ', () => this.dive(), true, 16);
    add(go.bg); add(go.txt);
    const ng = add(label(this, 824, 506, 'Начать уровень заново', 11, COLORS.dim).setOrigin(0.5, 0).setInteractive({ useHandCursor: true }));
    ng.on('pointerdown', () => openConfirmNewGame(this.game));
  }

  private card(add: <T extends Phaser.GameObjects.GameObject>(o: T) => T, id: LevelUpgradeId, x: number, y: number): void {
    const sv = S.save;
    const def = LEVEL_UPGRADES[id];
    const lvl = sv.upgrades[id];
    const max = upgradeMax(id);
    const c = canBuyUpgrade(sv, id);
    add(this.add.rectangle(x, y, 368, 104, 0x14324a, 0.9).setOrigin(0).setStrokeStyle(1, 0x1f4866));
    add(label(this, x + 12, y + 8, `${def.name}`, 16, COLORS.text, { fontStyle: 'bold' }));
    add(label(this, x + 12, y + 30, `уровень ${lvl}/${max} • ${def.hint}`, 11, COLORS.dim));
    const cur = def.describe(upgradeValue(id, lvl));
    const next = lvl < max ? def.describe(upgradeValue(id, lvl + 1)) : null;
    add(label(this, x + 12, y + 50, `Сейчас: ${cur}`, 13, COLORS.text));
    add(label(this, x + 12, y + 70, next ? `Дальше: ${next}` : 'Максимум', 13, next ? COLORS.accent : COLORS.dim));
    if (c.cost !== null) add(label(this, x + 356, y + 14, `${c.cost} золота`, 13, c.ok ? COLORS.warn : COLORS.dim, { fontStyle: 'bold' }).setOrigin(1, 0));
    const b = button(this, x + 266, y + 58, 90, 32, lvl >= max ? 'Макс' : 'Купить', () => this.buy(id), c.ok, 13);
    add(b.bg); add(b.txt);
  }

  private buy(id: LevelUpgradeId): void {
    if (!buyLevelUpgrade(S.save, id, S.save.stats.playMs)) return;
    S.current.purchases.push(`${LEVEL_UPGRADES[id].name} ${S.save.upgrades[id]}`);
    persistLevel();
    this.goldShown = S.save.gold;
    this.render();
  }

  private repair(n: number): void {
    const done = repairLevelKnife(S.save, n);
    if (!done) return;
    S.current.repairs += done;
    persistLevel();
    this.render();
  }

  private result(add: <T extends Phaser.GameObjects.GameObject>(o: T) => T): void {
    const sv = S.save;
    add(this.add.rectangle(0, 0, W, H, 0x05101c, 0.75).setOrigin(0));
    add(panel(this, 220, 70, 520, 400, 0.98));
    add(label(this, W / 2, 90, 'Лодка отремонтирована!', 26, COLORS.accent, { fontStyle: 'bold' }).setOrigin(0.5, 0));
    add(label(this, W / 2, 128, 'Двигатель установлен — уровень пройден.', 14, COLORS.text).setOrigin(0.5, 0));
    const t = (ms: number | null) => (ms === null ? '—' : formatTime(ms));
    const lines = [
      `Время прохождения: ${t(sv.stats.completedMs)}`,
      `Первая покупка: ${t(sv.stats.firstPurchaseMs)} • подстанция: ${t(sv.stats.substationMs)}`,
      `Вылазок: ${sv.stats.dives} • неудач: ${sv.stats.fails}`,
      `Золото найдено: ${sv.stats.goldEarned} • припасы: ${sv.stats.suppliesEarned} • ремонт ножа: ${sv.stats.repairs}`,
      `Улучшения: ${LEVEL_UPGRADE_ORDER.map((id) => `${LEVEL_UPGRADES[id].name} ${sv.upgrades[id]}`).join(', ')}`,
    ];
    let y = 168;
    for (const l of lines) {
      add(label(this, W / 2, y, l, 14, COLORS.text, { align: 'center', wordWrap: { width: 480 } }).setOrigin(0.5, 0));
      y += 34;
    }
    add(label(this, W / 2, y + 4, `Находок осталось на карте: ${LEVEL.loot.length - Object.values(sv.loot).filter((r) => r.s === 'd').length} (добыча не восстанавливается).`, 11, COLORS.dim).setOrigin(0.5, 0));
    const b = button(this, W / 2 - 100, 404, 200, 40, 'Пройти заново', () => {
      resetLevelSave();
      location.reload();
    }, true, 15);
    add(b.bg); add(b.txt);
  }
}
