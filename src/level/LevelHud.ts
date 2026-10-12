// HUD режима уровня: тьма с фонарём, кислород с предупреждением о возврате, груз и состав связки, нож, ресурсы,
// текущая цель, стрелка к ближайшей базе по проходам, подсказки у находок.
import Phaser from 'phaser';
import { LOOT_TEXTURE } from '../assets/generated.ts';
import { ITEMS } from '../config/balance.ts';
import { CRATE_SUPPLIES } from './config.ts';
import { TouchControls } from '../ui/TouchControls.ts';
import { COLORS, label, panel } from '../ui/widgets.ts';
import { LEVEL } from './map.ts';
import { LIT, type LevelScene } from './LevelScene.ts';
import { LightMask } from './lightMask.ts';
import { levelState as S } from './state.ts';

interface GroupChip { bg: Phaser.GameObjects.Rectangle; icon: Phaser.GameObjects.Image; key: Phaser.GameObjects.Text; txt: Phaser.GameObjects.Text }

/** Строка «что везу»: золото и припасы; если только детали — их названия. */
function cargoLine(gold: number): string {
  const crates = S.cargo.filter((c) => ITEMS[c.type].kind === 'crate').length;
  const parts: string[] = [];
  if (gold) parts.push(`≈ ${gold} золота`);
  if (crates) parts.push(`${crates * CRATE_SUPPLIES} припас${crates * CRATE_SUPPLIES < 5 ? 'а' : 'ов'}`);
  if (parts.length) return `В грузе ${parts.join(' • ')}`;
  if (S.cargo.some((c) => c.type === 'engine')) return 'В грузе: двигатель лодки';
  if (S.cargo.some((c) => c.type === 'component')) return 'В грузе: компоненты подстанции';
  return 'Груз пуст';
}

export class LevelHud extends Phaser.Scene {
  private mask!: LightMask;
  private fade!: Phaser.GameObjects.Rectangle;
  private fadeCur = 0;
  private leftPanel!: Phaser.GameObjects.Rectangle;
  private o2Text!: Phaser.GameObjects.Text;
  private o2BarBg!: Phaser.GameObjects.Rectangle;
  private o2Bar!: Phaser.GameObjects.Rectangle;
  private warnText!: Phaser.GameObjects.Text;
  private cargoText!: Phaser.GameObjects.Text;
  private valueText!: Phaser.GameObjects.Text;
  private knifeText!: Phaser.GameObjects.Text;
  private bankText!: Phaser.GameObjects.Text;
  private goalText!: Phaser.GameObjects.Text;
  private msgText!: Phaser.GameObjects.Text;
  private overloadText!: Phaser.GameObjects.Text;
  private tipBg!: Phaser.GameObjects.Rectangle;
  private tipTitle!: Phaser.GameObjects.Text;
  private tipSub!: Phaser.GameObjects.Text;
  private tipHint!: Phaser.GameObjects.Text;
  private keysText!: Phaser.GameObjects.Text;
  private cargoTitle!: Phaser.GameObjects.Text;
  private chips: GroupChip[] = [];
  private arrow!: Phaser.GameObjects.Image;
  private arrowText!: Phaser.GameObjects.Text;
  private devBadge!: Phaser.GameObjects.Text;
  private floaters: Phaser.GameObjects.Text[] = [];
  private touch!: TouchControls;
  private h = 0;

  constructor() {
    super('LevelHud');
  }

  private get level(): LevelScene {
    return this.scene.get('Level') as LevelScene;
  }

  create(): void {
    const { width, height } = this.scale;
    this.mask = new LightMask(this, width, height);
    this.fade = this.add.rectangle(0, 0, width, height, 0x000000, 1).setOrigin(0).setDepth(1).setAlpha(0);

    this.leftPanel = panel(this, 12, 12, 270, 140).setDepth(2);
    this.o2Text = label(this, 22, 18, 'Кислород 25 с', 16, COLORS.text, { fontStyle: 'bold' }).setDepth(3);
    this.o2BarBg = this.add.rectangle(22, 42, 250, 8, 0x06202a, 1).setOrigin(0).setDepth(3);
    this.o2Bar = this.add.rectangle(23, 43, 248, 6, 0x3ec6c0, 1).setOrigin(0).setDepth(3);
    this.cargoText = label(this, 22, 56, '', 13).setDepth(3);
    this.valueText = label(this, 22, 74, '', 13, COLORS.dim).setDepth(3);
    this.knifeText = label(this, 22, 92, '', 13, COLORS.dim).setDepth(3);
    this.bankText = label(this, 22, 112, '', 13, COLORS.warn).setDepth(3);
    this.warnText = label(this, 12, 158, '', 13, '#06202a', { backgroundColor: '#f2b134', padding: { x: 8, y: 4 }, fontStyle: 'bold' }).setDepth(3).setVisible(false);

    this.goalText = label(this, width / 2, 12, '', 14, '#e6f3f8', { align: 'center', backgroundColor: '#0f2338e6', padding: { x: 12, y: 6 }, wordWrap: { width: 460 } }).setOrigin(0.5, 0).setDepth(4);
    this.msgText = label(this, width / 2, 52, '', 14, COLORS.text, { align: 'center', backgroundColor: '#0f2338cc', padding: { x: 10, y: 6 }, wordWrap: { width: 460 } }).setOrigin(0.5, 0).setDepth(5).setVisible(false);
    this.overloadText = label(this, width / 2, 104, '', 15, '#06202a', { align: 'center', backgroundColor: '#f2b134', padding: { x: 12, y: 6 }, fontStyle: 'bold' }).setOrigin(0.5, 0).setDepth(5).setVisible(false);

    this.tipBg = this.add.rectangle(0, 0, 10, 10, 0x0f2338, 0.9).setOrigin(0.5, 1).setVisible(false).setDepth(4);
    this.tipTitle = label(this, 0, 0, '', 13, COLORS.text, { fontStyle: 'bold' }).setOrigin(0.5, 1).setDepth(5).setVisible(false);
    this.tipSub = label(this, 0, 0, '', 12, COLORS.dim).setOrigin(0.5, 1).setDepth(5).setVisible(false);
    this.tipHint = label(this, 0, 0, '', 12, COLORS.accent).setOrigin(0.5, 1).setDepth(5).setVisible(false);

    this.cargoTitle = label(this, 12, height - 80, 'Связка (клик или 1–9 — сбросить одну):', 12, COLORS.dim, { backgroundColor: '#0f2338cc', padding: { x: 6, y: 3 } }).setDepth(3).setVisible(false);
    this.keysText = label(this, width - 12, height - 12, 'E — взять / удерживать у сети\nQ — сбросить последнюю • 1–9 — выбранную\nEsc — пауза', 12, COLORS.dim, { align: 'right', backgroundColor: '#0f2338cc', padding: { x: 8, y: 6 } }).setOrigin(1, 1).setDepth(3);
    this.arrow = this.add.image(0, 0, 'arrow').setDepth(5).setVisible(false);
    this.arrowText = label(this, 0, 0, '', 11, COLORS.accent).setOrigin(0.5, 0).setDepth(5).setVisible(false);
    this.devBadge = label(this, width / 2, height - 12, 'DEV', 12, '#06202a', { backgroundColor: '#f2b134', padding: { x: 8, y: 3 }, fontStyle: 'bold' }).setOrigin(0.5, 1).setVisible(false).setDepth(6);

    this.touch = new TouchControls(this, this.level, [['pick', 'Взять'], ['drop', 'Сбросить'], ['pause', 'II']]);
    this.scale.on(Phaser.Scale.Events.RESIZE, (gs: Phaser.Structs.Size) => this.layout(gs.width, gs.height));
    this.layout(width, height);
  }

  private layout(width: number, height: number): void {
    this.h = height;
    this.mask.resize(width, height);
    this.fade.setSize(width, height);
    // Цель — справа от панели на широком экране, под панелью на узком
    const wide = width - 300 >= 360;
    const cx = wide ? 282 + (width - 282) / 2 : width / 2;
    const wrap = wide ? Math.min(520, width - 320) : width - 24;
    this.goalText.setPosition(cx, wide ? 12 : 196).setWordWrapWidth(wrap);
    this.msgText.setPosition(cx, 52).setWordWrapWidth(wrap);
    this.overloadText.setPosition(cx, 104);
    this.keysText.setPosition(width - 12, height - 12);
    this.cargoTitle.setPosition(12, height - 80);
    this.devBadge.setPosition(width / 2, height - 12);
    this.touch.layout(width, height);
  }

  private chip(i: number): GroupChip {
    while (this.chips.length <= i) {
      const bg = this.add.rectangle(0, 0, 112, 30, 0x0f2338, 0.9).setOrigin(0).setStrokeStyle(1, 0x1f4866).setDepth(3).setInteractive({ useHandCursor: true });
      const icon = this.add.image(0, 0, 'item-shard').setDepth(4);
      const key = label(this, 0, 0, '', 11, COLORS.accent, { fontStyle: 'bold' }).setDepth(4);
      const txt = label(this, 0, 0, '', 12, COLORS.text).setDepth(4);
      const idx = this.chips.length;
      bg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
        ev.stopPropagation();
        this.level.dropGroup(idx);
      });
      this.chips.push({ bg, icon, key, txt });
    }
    return this.chips[i];
  }

  update(): void {
    const lv = this.level;
    if (!lv || !lv.player) return;
    const now = this.time.now;
    const h = lv.hud;
    const sv = S.save;
    const cam = lv.cameras.main;
    const view = cam.worldView;
    const zoom = cam.zoom;
    const toScreen = (wx: number, wy: number) => ({ x: (wx - view.x) * zoom, y: (wy - view.y) * zoom });

    // ---- Тьма: фонарь, свет лодки, свет работающей подстанции, небо ----
    const p = toScreen(lv.player.x, lv.player.y);
    const boat = LEVEL.bases.boat;
    const glows = [{ ...toScreen(boat.sprite.x, boat.sprite.y + 60), r: LIT.boat * zoom }];
    if (sv.substation.restored) glows.push({ ...toScreen(LEVEL.bases.sub.sprite.x, LEVEL.bases.sub.sprite.y - 40), r: LIT.sub * zoom });
    const skyTL = toScreen(LEVEL.sky.x, LEVEL.sky.y);
    this.mask.draw({
      player: p, playerWorld: { x: lv.player.x, y: lv.player.y }, poly: h.lightPoly, radius: h.lightRadius, zoom,
      glows, rects: [{ x: skyTL.x, y: skyTL.y, w: LEVEL.sky.w * zoom, h: LEVEL.sky.h * zoom }],
    });

    this.fadeCur += (h.dock.fade - this.fadeCur) * 0.1;
    this.fade.setFillStyle(h.dock.dark ? 0x000000 : 0x05101c, 1).setAlpha(this.fadeCur * (h.dock.dark ? 1 : 0.35));

    const inWater = lv.mode === 'diving' || lv.mode === 'docking';
    for (const o of [this.leftPanel, this.o2Text, this.o2Bar, this.o2BarBg, this.cargoText, this.valueText, this.knifeText, this.bankText, this.goalText, this.keysText]) o.setVisible(inWater);
    if (!inWater) {
      for (const o of [this.overloadText, this.msgText, this.warnText, this.arrow, this.arrowText, this.cargoTitle]) o.setVisible(false);
      for (const c of this.chips) for (const o of [c.bg, c.icon, c.key, c.txt]) o.setVisible(false);
      this.hideTip();
      this.touch.update(false);
      this.devBadge.setVisible(S.devActive || S.infiniteO2);
      return;
    }

    // ---- Кислород и предупреждение с учётом возврата ----
    const d = S.dive;
    const frac = Phaser.Math.Clamp(d.oxygen / d.maxOxygen, 0, 1);
    const hard = h.warn === 'hard' || h.warn === 'out';
    const soft = h.warn === 'soft';
    this.o2Text.setText(`Кислород ${Math.ceil(d.oxygen)} с${S.infiniteO2 ? ' ∞' : ''}`).setColor(hard ? COLORS.danger : soft ? COLORS.warn : COLORS.text);
    this.o2Bar.setFillStyle(hard ? 0xff6b5e : soft ? 0xf2b134 : 0x3ec6c0, hard ? 0.6 + Math.abs(Math.sin(now / 150)) * 0.4 : 1).setSize(Math.max(0, 248 * frac), 6);
    this.leftPanel.setStrokeStyle(1, hard ? 0xff6b5e : soft ? 0xf2b134 : COLORS.panelLine, 1);
    if ((soft || hard) && h.home) {
      const where = h.home.base === 'sub' ? 'подстанции' : 'лодки';
      this.warnText.setText(`${hard ? 'Срочно назад' : 'Пора назад'}: до ${where} ≈ ${Math.ceil(h.home.returnSec)} с`)
        .setBackgroundColor(hard ? '#d9443a' : '#f2b134').setColor(hard ? '#fff1ee' : '#06202a').setVisible(true);
    } else this.warnText.setVisible(false);

    this.cargoText.setText(`Груз ${h.weight}/${h.norm} • ${h.speedPct}% скорости`).setColor(h.overloaded ? (h.overloadRatio >= 1.5 ? COLORS.danger : COLORS.warn) : COLORS.text);
    this.valueText.setText(cargoLine(h.cargoValue));
    this.knifeText.setText(h.knife || 'Нож не найден').setColor(sv.knife.owned && sv.knife.durability === 0 ? COLORS.danger : COLORS.dim);
    this.bankText.setText(`Золото ${sv.gold} • Припасы ${sv.supplies}`);
    this.goalText.setText(`Цель: ${h.goal}`);

    // ---- Сообщения и перегруз ----
    const goalBottom = this.goalText.y + this.goalText.height + 6;
    if (h.message && now < h.message.until) this.msgText.setText(h.message.text).setColor(h.message.color).setY(goalBottom).setVisible(true);
    else this.msgText.setVisible(false);
    const msgBottom = this.msgText.visible ? this.msgText.y + this.msgText.height + 6 : goalBottom;
    if (h.overloaded && lv.mode === 'diving') {
      const severe = h.overloadRatio >= 1.5;
      this.overloadText.setText(`ПЕРЕГРУЗ • ${h.speedPct}% скорости • сбросьте лишнее: 1–9 или Q`)
        .setBackgroundColor(severe ? '#d9443a' : '#f2b134').setColor(severe ? '#fff1ee' : '#06202a')
        .setPosition(this.goalText.x, msgBottom).setScale(1 + Math.sin(now / 180) * 0.03).setVisible(true);
    } else this.overloadText.setVisible(false);

    // ---- Состав связки ----
    this.cargoTitle.setVisible(h.groups.length > 0);
    let cx = 12;
    const cy = this.h - 50;
    h.groups.forEach((g, i) => {
      const c = this.chip(i);
      c.bg.setPosition(cx, cy).setVisible(true);
      c.icon.setTexture(LOOT_TEXTURE[g.type]).setScale(1).setPosition(cx + 30, cy + 15).setVisible(true);
      c.icon.setScale(Math.min(1, 22 / c.icon.width, 22 / c.icon.height));
      c.key.setText(String(i + 1)).setPosition(cx + 6, cy + 8).setVisible(i < 9);
      c.txt.setText(`×${g.count} (${g.weight})`).setPosition(cx + 44, cy + 7).setVisible(true);
      const wChip = Math.max(86, 52 + c.txt.width);
      c.bg.setSize(wChip, 30);
      cx += wChip + 6;
    });
    for (let i = h.groups.length; i < this.chips.length; i++) for (const o of [this.chips[i].bg, this.chips[i].icon, this.chips[i].key, this.chips[i].txt]) o.setVisible(false);

    // ---- Подсказка у находки или сети (только в свете) ----
    if (h.nearest && lv.mode === 'diving') {
      const tp = toScreen(h.nearest.x, h.nearest.y);
      const y = tp.y - 14 * zoom;
      this.tipTitle.setText(h.nearest.title).setPosition(tp.x, y - 30).setVisible(true);
      this.tipSub.setText(h.nearest.sub).setPosition(tp.x, y - 15).setVisible(true);
      this.tipHint.setText(h.nearest.hint).setPosition(tp.x, y).setVisible(!!h.nearest.hint);
      const wTip = Math.max(this.tipTitle.width, this.tipSub.width, this.tipHint.width) + 16;
      this.tipBg.setPosition(tp.x, y + 4).setSize(wTip, 52).setVisible(true);
    } else this.hideTip();

    // ---- Стрелка к ближайшей работающей базе по проходам ----
    if (lv.mode === 'diving' && h.home && d.active) {
      const dist = hard ? 70 : soft ? 64 : 56;
      const ax = p.x + Math.cos(h.home.angle) * dist, ay = p.y + Math.sin(h.home.angle) * dist;
      this.arrow.setPosition(ax, ay).setRotation(h.home.angle).setVisible(true)
        .setScale(hard ? 1.6 + Math.abs(Math.sin(now / 160)) * 0.3 : soft ? 1.3 : 1)
        .setTint(hard ? 0xff6b5e : soft ? 0xf2b134 : 0xffffff);
      this.arrowText.setText(h.home.base === 'sub' ? 'к подстанции' : 'к лодке').setPosition(ax, ay + 14)
        .setColor(hard ? COLORS.danger : soft ? COLORS.warn : COLORS.accent).setVisible(true);
    } else {
      this.arrow.setVisible(false);
      this.arrowText.setVisible(false);
    }

    this.devBadge.setVisible(S.devActive || S.infiniteO2);

    // ---- Всплывающие надписи ----
    while (h.floaters.length) {
      const f = h.floaters.shift()!;
      const fp = toScreen(f.x, f.y);
      const t = label(this, fp.x, fp.y, f.text, 13, f.color, { fontStyle: 'bold', stroke: '#06202a', strokeThickness: 3 }).setOrigin(0.5).setDepth(6);
      t.setData('born', now).setData('wx', f.x).setData('wy', f.y);
      this.floaters.push(t);
    }
    this.floaters = this.floaters.filter((t) => {
      const age = now - (t.getData('born') as number);
      if (age > 1100) {
        t.destroy();
        return false;
      }
      const fp = toScreen(t.getData('wx') as number, t.getData('wy') as number);
      t.setPosition(fp.x, fp.y - age * 0.04).setAlpha(1 - age / 1100);
      return true;
    });

    this.touch.update(lv.mode === 'diving');
  }

  private hideTip(): void {
    this.tipTitle.setVisible(false);
    this.tipSub.setVisible(false);
    this.tipHint.setVisible(false);
    this.tipBg.setVisible(false);
  }
}
