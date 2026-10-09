// Экран базы: итог захода, ресурсы, снаряжение и припасы (нож, ремонт, боезапас, баллончики), постоянные улучшения, победа.
import Phaser from 'phaser';
import { ITEMS, KNIFE, SUPPLIES, UPGRADES, UPGRADE_ORDER, effects, type ItemType, type SupplyKind, type UpgradeId } from '../config/balance.ts';
import { buySupply, buyUpgrade, canBuySupply, canBuyUpgrade, knifeMax, maxLevel, repairKnife, repairableUnits } from '../core/economy.ts';
import type { DiveScene } from '../game/DiveScene.ts';
import { persist, state } from '../game/state.ts';
import { openConfirmNewGame } from './pause.ts';
import { COLORS, button, formatTime, label, panel } from './widgets.ts';

const W = 960, H = 540;

export class BaseScene extends Phaser.Scene {
  private root!: Phaser.GameObjects.Container;
  private dim!: Phaser.GameObjects.Rectangle;
  private coinsShown = 0;
  private victoryShown = false;
  private closing = false;

  constructor() {
    super('Base');
  }

  create(): void {
    this.dim = this.add.rectangle(0, 0, 10, 10, 0x05101c, 0.3).setOrigin(0).setDepth(0).setAlpha(0);
    this.root = this.add.container(0, 0).setDepth(1).setAlpha(0);
    this.coinsShown = state.save.coins - (state.last?.coins ?? 0);
    this.victoryShown = false;
    this.closing = false;
    this.render();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this));
    this.onResize(this.scale.gameSize);
    this.tweens.add({ targets: [this.root, this.dim], alpha: 1, duration: 300, ease: 'Sine.Out' });
    if (state.save.coins !== this.coinsShown) {
      const obj = { v: this.coinsShown };
      this.tweens.add({ targets: obj, v: state.save.coins, duration: 700, delay: 200, ease: 'Cubic.Out', onUpdate: () => { this.coinsShown = Math.round(obj.v); this.render(); }, onComplete: () => { this.coinsShown = state.save.coins; this.render(); } });
    }
  }

  private onResize(gs: Phaser.Structs.Size): void {
    const sc = Math.min(gs.width / W, gs.height / H);
    this.dim.setSize(gs.width, gs.height);
    this.root.setScale(sc).setPosition((gs.width - W * sc) / 2, (gs.height - H * sc) / 2);
  }

  private get dive(): DiveScene {
    return this.scene.get('Dive') as DiveScene;
  }

  /** Плавное закрытие и старт погружения. */
  private closeAndDive(): void {
    if (this.closing) return;
    this.closing = true;
    this.tweens.add({ targets: [this.root, this.dim], alpha: 0, duration: 220, ease: 'Sine.In', onComplete: () => this.dive.startDive() });
  }

  /** Полная перерисовка. */
  render(): void {
    if (!this.root) return;
    this.root.removeAll(true);
    const s = state.save;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => { this.root.add(o); return o; };

    add(label(this, 16, 12, 'DEEP HAUL • БАЗА', 15, COLORS.accent, { fontStyle: 'bold' }));
    add(label(this, W - 16, 12, `заходов ${s.stats.dives} • лучший доход ${s.stats.bestIncome} • время ${formatTime(s.stats.playMs)}`, 12, COLORS.dim).setOrigin(1, 0));

    // ================= Левая колонка: итог захода + ресурсы =================
    add(panel(this, 16, 40, 280, 190));
    add(label(this, 28, 48, 'Итог захода', 15, COLORS.text, { fontStyle: 'bold' }));
    const last = state.last;
    let y = 70;
    const line = (t: string, color = COLORS.text, size = 12, x = 28, wrap = 256) => { const tx = add(label(this, x, y, t, size, color, { wordWrap: { width: wrap } })); y += tx.height + 4; };
    if (!last) {
      line('Первый выход. Шахта у причала ведёт вниз.', COLORS.text);
      line('Соберите несколько обломков у стен и вернитесь на светлую площадку до конца кислорода.', COLORS.dim);
      line(`Старт: кислород ${effects.oxygen(0)} с, тяга ${effects.haul(0)}, фонарь ${effects.lightRadius(0)} px.`, COLORS.dim, 11);
    } else {
      const title = last.result === 'success' ? 'Успешное возвращение' : last.result === 'oxygen' ? 'Кислород закончился' : last.result === 'abort' ? 'Аварийный возврат' : 'Погружение прервано перезагрузкой';
      line(title, last.result === 'success' ? COLORS.accent : COLORS.danger, 13);
      if (last.result === 'success') {
        const groups: [string, ItemType[]][] = [['Ценности', ['shard', 'ore', 'crystal']], ['Материалы', ['parts']], ['Цель', ['capsule']]];
        for (const [name, types] of groups) {
          const items = types.filter((t) => (last.counts[t] ?? 0) > 0);
          if (!items.length) continue;
          line(`${name}: ${items.map((t) => `${ITEMS[t].name} ×${last.counts[t]}`).join(', ')}`, COLORS.dim, 11);
        }
        line(`Монеты +${last.coins} • Детали +${last.parts}`, COLORS.accent, 13);
        const m = last.merged;
        if (m.o2 || m.harpoons) line(`Найденные припасы в запас: ${[m.o2 ? `O2 ×${m.o2}` : '', m.harpoons ? `гарпуны ×${m.harpoons}` : ''].filter(Boolean).join(', ')}`, COLORS.dim, 11);
      } else {
        line(`Груз (на ${last.lostCargoValue} монет) и остатки найденных припасов лежат там, где закончился заход — за ними можно вернуться.`, COLORS.dim, 11);
        line('Банк, покупки и припасы с базы сохранены.', COLORS.dim, 11);
      }
      const log = s.log[s.log.length - 1];
      if (log) line(`Длительность ${log.durationS} с • макс. глубина ${log.maxDepthM} м${log.notes.length ? ' • ' + log.notes[log.notes.length - 1] : ''}`, COLORS.dim, 10);
    }

    add(panel(this, 16, 238, 280, 112));
    add(label(this, 28, 246, 'Ресурсы', 15, COLORS.text, { fontStyle: 'bold' }));
    add(label(this, 28, 268, `Монеты ${this.coinsShown}`, 16, COLORS.warn, { fontStyle: 'bold' }));
    add(label(this, 28, 288, 'на улучшения, ремонт ножа и припасы', 11, COLORS.dim));
    add(label(this, 28, 306, `Детали ${s.parts}`, 14, '#cfe9f5', { fontStyle: 'bold' }));
    add(label(this, 28, 324, 'материал для старших уровней улучшений', 11, COLORS.dim));
    if (s.stats.purchases === 0 && s.coins >= 18) add(label(this, 16, 360, 'Подсказка: Тяга за 18 монет — груз замедляет меньше, возврат быстрее.', 11, COLORS.accent, { wordWrap: { width: 280 } }));
    add(label(this, 16, 400, 'Находка (нож) ≠ ремонт (прочность) ≠ боезапас (гарпуны, баллончики) ≠ постоянная прокачка.', 10, COLORS.dim, { wordWrap: { width: 280 } }));

    // ================= Середина: постоянные улучшения =================
    add(panel(this, 304, 40, 392, 484));
    add(label(this, 316, 48, 'Постоянные улучшения', 15, COLORS.text, { fontStyle: 'bold' }));
    let cy = 70;
    for (const id of UPGRADE_ORDER) {
      this.card(add, id, 316, cy);
      cy += 63;
    }

    // ================= Правая колонка: снаряжение и припасы =================
    add(panel(this, 704, 40, 240, 376));
    add(label(this, 716, 48, 'Снаряжение и припасы', 15, COLORS.text, { fontStyle: 'bold' }));
    let ry = 72;
    // Нож
    add(label(this, 716, ry, 'Нож', 14, COLORS.text, { fontStyle: 'bold' }));
    if (!s.knife.owned) {
      add(label(this, 716, ry + 18, 'не найден — ищите в пещере', 12, COLORS.dim));
      ry += 44;
    } else {
      const max = knifeMax(s);
      add(label(this, 716, ry + 18, `прочность ${s.knife.durability}/${max} • ремонт ${KNIFE.repairCost} монеты/ед.`, 12, s.knife.durability === 0 ? COLORS.danger : COLORS.dim));
      const one = repairableUnits(s, 1) > 0;
      const all = repairableUnits(s, max) > 0;
      const b1 = button(this, 716, ry + 38, 60, 24, '+1', () => this.repair(1), one, 12);
      add(b1.bg); add(b1.txt);
      const b2 = button(this, 784, ry + 38, 110, 24, 'до максимума', () => this.repair(max), all, 12);
      add(b2.bg); add(b2.txt);
      ry += 72;
    }
    // Ружьё
    add(label(this, 716, ry, 'Гарпунное ружьё', 14, COLORS.text, { fontStyle: 'bold' }));
    add(label(this, 716, ry + 18, s.upgrades.weapon > 0 ? `есть (уровень ${s.upgrades.weapon})` : 'нет — ветка «Оружие» слева', 12, COLORS.dim));
    ry += 44;
    // Припасы
    for (const kind of ['harpoons', 'o2'] as SupplyKind[]) {
      const def = SUPPLIES[kind];
      const have = state.belt.base[kind];
      add(label(this, 716, ry, `${def.plural}: ${have} / ${def.cap}`, 13, COLORS.text, { fontStyle: 'bold' }));
      add(label(this, 716, ry + 17, kind === 'o2' ? `${def.price} монет за шт., R под водой: +8 с` : `${def.price} монеты за шт., F под водой`, 11, COLORS.dim));
      const b1 = button(this, 866, ry + 2, 66, 24, '+1', () => this.buySupply(kind, 1), canBuySupply(s, state.belt, kind, 1), 12);
      add(b1.bg); add(b1.txt);
      if (kind === 'harpoons') {
        const b5 = button(this, 866, ry + 30, 66, 22, '+5', () => this.buySupply(kind, 5), canBuySupply(s, state.belt, kind, 5), 11);
        add(b5.bg); add(b5.txt);
        ry += 30;
      }
      ry += 46;
    }
    add(label(this, 716, ry + 2, 'Найденные припасы ложатся на пояс сразу; в запас базы они попадают только после успешного возвращения.', 10, COLORS.dim, { wordWrap: { width: 216 } }));

    const diveBtn = button(this, 716, 452, 216, 44, 'НЫРНУТЬ', () => this.closeAndDive(), true, 16);
    add(diveBtn.bg); add(diveBtn.txt);
    const ng = add(label(this, 824, 506, 'Новая игра (сброс прогресса)', 11, COLORS.dim).setOrigin(0.5, 0).setInteractive({ useHandCursor: true }));
    ng.on('pointerdown', () => openConfirmNewGame(this.game));

    if (last?.capsule && !this.victoryShown) this.victory(add);
  }

  private card(add: <T extends Phaser.GameObjects.GameObject>(o: T) => T, id: UpgradeId, x: number, y: number): void {
    const s = state.save;
    const def = UPGRADES[id];
    const lvl = s.upgrades[id];
    const max = maxLevel(id);
    const check = canBuyUpgrade(s, id);
    add(this.add.rectangle(x, y, 368, 59, 0x14324a, 0.9).setOrigin(0).setStrokeStyle(1, 0x1f4866));
    add(label(this, x + 10, y + 5, `${def.name}  Lv ${lvl}/${max}`, 14, COLORS.text, { fontStyle: 'bold' }));
    const next = lvl < max ? ` → ${def.effect(lvl + 1)}` : ' (макс.)';
    add(label(this, x + 10, y + 24, `${def.effect(lvl)}${next}`, 11, COLORS.dim, { wordWrap: { width: 262 } }));
    const cost = check.ok ? check.cost : check.cost;
    if (cost) {
      const costText = `${cost.coins} монет${cost.parts ? ` • ${cost.parts} дет.` : ''}${!check.ok && check.reason === 'knife' ? ' • нужен нож' : ''}`;
      add(label(this, x + 10, y + 44, costText, 11, check.ok ? COLORS.warn : !check.ok && (check.reason === 'parts' || check.reason === 'knife') ? '#8fb3d9' : COLORS.dim));
    }
    const b = button(this, x + 282, y + 16, 76, 28, lvl >= max ? 'Макс' : 'Купить', () => this.buy(id), check.ok);
    add(b.bg); add(b.txt);
  }

  private buy(id: UpgradeId): void {
    if (!buyUpgrade(state.save, id)) return;
    state.current.purchases.push(`${UPGRADES[id].name} Lv${state.save.upgrades[id]}`);
    persist();
    this.coinsShown = state.save.coins;
    this.render();
  }

  private buySupply(kind: SupplyKind, n: number): void {
    const price = SUPPLIES[kind].price * n;
    if (!buySupply(state.save, state.belt, kind, n)) return;
    state.current.supplies.bought[kind] += n;
    state.current.spentOnSupplies += price;
    persist();
    this.coinsShown = state.save.coins;
    this.render();
  }

  private repair(units: number): void {
    const done = repairKnife(state.save, units);
    if (done <= 0) return;
    state.current.spentOnRepair += done * KNIFE.repairCost;
    persist();
    this.coinsShown = state.save.coins;
    this.render();
  }

  private victory(add: <T extends Phaser.GameObjects.GameObject>(o: T) => T): void {
    const s = state.save;
    add(this.add.rectangle(0, 0, W, H, 0x05101c, 0.7).setOrigin(0));
    add(panel(this, 230, 120, 500, 300, 0.98));
    add(label(this, W / 2, 140, 'Капсула поднята!', 24, COLORS.accent, { fontStyle: 'bold' }).setOrigin(0.5, 0));
    const lines = [
      `Время прохождения: ${formatTime(s.stats.winMs ?? s.stats.playMs)}`,
      `Погружений: ${s.stats.winDives ?? s.stats.dives}`,
      `Лучший доход за заход: ${s.stats.bestIncome} монет`,
      `Улучшения: ${UPGRADE_ORDER.map((id) => `${UPGRADES[id].name} ${s.upgrades[id]}`).join(', ')}`,
      '',
      'Свободная игра продолжается; капсула больше не появится.',
    ];
    let y = 186;
    for (const l of lines) {
      add(label(this, W / 2, y, l, 13, COLORS.text, { align: 'center', wordWrap: { width: 460 } }).setOrigin(0.5, 0));
      y += 26;
    }
    const b = button(this, W / 2 - 90, 366, 180, 36, 'Продолжить', () => { this.victoryShown = true; this.render(); });
    add(b.bg); add(b.txt);
  }
}
