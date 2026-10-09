// HUD поверх мира: непрозрачная тьма с полигоном света фонаря и пятном причала, кислород, груз, перегруз, стрелка к базе, подсказки.
import Phaser from 'phaser';
import { LIGHT, SUPPLIES } from '../config/balance.ts';
import { MAP } from '../config/map.ts';
import { warnLevel } from '../core/dive.ts';
import { foundCount, total as beltTotal } from '../core/supplies.ts';
import type { DiveScene } from '../game/DiveScene.ts';
import { state } from '../game/state.ts';
import { TouchControls } from './TouchControls.ts';
import { COLORS, label, panel } from './widgets.ts';

export class HudScene extends Phaser.Scene {
  private dark!: Phaser.GameObjects.RenderTexture;
  private lightRT!: Phaser.GameObjects.RenderTexture;
  private lightPoly!: Phaser.GameObjects.Graphics;
  private lightInv!: Phaser.GameObjects.Image;
  private baseGlow!: Phaser.GameObjects.Image;
  private fade!: Phaser.GameObjects.Rectangle;
  private fadeCur = 0;
  private lightSize = 0;
  private polyPts: Phaser.Math.Vector2[] = [];
  private o2Text!: Phaser.GameObjects.Text;
  private o2Bar!: Phaser.GameObjects.Rectangle;
  private o2BarBg!: Phaser.GameObjects.Rectangle;
  private depthText!: Phaser.GameObjects.Text;
  private cargoText!: Phaser.GameObjects.Text;
  private valueText!: Phaser.GameObjects.Text;
  private bankText!: Phaser.GameObjects.Text;
  private beltText!: Phaser.GameObjects.Text;
  private knifeText!: Phaser.GameObjects.Text;
  private msgText!: Phaser.GameObjects.Text;
  private overloadText!: Phaser.GameObjects.Text;
  private tipTitle!: Phaser.GameObjects.Text;
  private tipSub!: Phaser.GameObjects.Text;
  private tipHint!: Phaser.GameObjects.Text;
  private tipBg!: Phaser.GameObjects.Rectangle;
  private keysText!: Phaser.GameObjects.Text;
  private arrow!: Phaser.GameObjects.Image;
  private arrowText!: Phaser.GameObjects.Text;
  private devBadge!: Phaser.GameObjects.Text;
  private leftPanel!: Phaser.GameObjects.Rectangle;
  private rightPanel!: Phaser.GameObjects.Rectangle;
  private floaters: Phaser.GameObjects.Text[] = [];
  private touch!: TouchControls;

  constructor() {
    super('Hud');
  }

  create(): void {
    const { width, height } = this.scale;
    this.dark = this.add.renderTexture(0, 0, width, height).setOrigin(0).setDepth(0);
    this.fade = this.add.rectangle(0, 0, width, height, 0x000000, 1).setOrigin(0).setDepth(1).setAlpha(0);
    // Источник для erase должен проходить willRender: держим его видимым, но далеко за экраном
    this.lightRT = this.add.renderTexture(-5000, -5000, 64, 64).setOrigin(0).setDepth(-10);
    this.lightPoly = this.make.graphics({ x: 0, y: 0 }, false);
    this.lightInv = this.make.image({ key: 'light-inv', add: false });
    this.baseGlow = this.make.image({ key: 'light', add: false });

    this.leftPanel = panel(this, 12, 12, 250, 108).setDepth(2);
    this.o2Text = label(this, 22, 18, 'O2 25 с', 16, COLORS.text, { fontStyle: 'bold' }).setDepth(3);
    this.o2BarBg = this.add.rectangle(22, 42, 230, 8, 0x06202a, 1).setOrigin(0).setDepth(3);
    this.o2Bar = this.add.rectangle(23, 43, 228, 6, 0x3ec6c0, 1).setOrigin(0).setDepth(3);
    this.depthText = label(this, 22, 56, 'Глубина 0 м', 13, COLORS.dim).setDepth(3);
    this.cargoText = label(this, 22, 74, 'Груз 0 / тяга 6 • 100% скорости', 13).setDepth(3);
    this.valueText = label(this, 22, 92, 'Груз на 0 монет', 13, COLORS.dim).setDepth(3);

    this.rightPanel = panel(this, width - 262, 12, 250, 80).setDepth(2);
    this.bankText = label(this, width - 252, 18, 'Банк 0 монет • Детали 0', 13).setDepth(3);
    this.beltText = label(this, width - 252, 38, '', 13, COLORS.dim).setDepth(3);
    this.knifeText = label(this, width - 252, 58, '', 13, COLORS.dim).setDepth(3);

    this.msgText = label(this, width / 2, 22, '', 15, COLORS.text, { align: 'center', backgroundColor: '#0f2338cc', padding: { x: 10, y: 6 }, wordWrap: { width: 440 } }).setOrigin(0.5, 0).setDepth(5).setVisible(false);
    this.overloadText = label(this, width / 2, 70, '', 15, '#06202a', { align: 'center', backgroundColor: '#f2b134', padding: { x: 12, y: 6 }, fontStyle: 'bold' }).setOrigin(0.5, 0).setDepth(5).setVisible(false);

    this.tipBg = this.add.rectangle(0, 0, 10, 10, 0x0f2338, 0.9).setOrigin(0.5, 1).setVisible(false).setDepth(4);
    this.tipTitle = label(this, 0, 0, '', 13, COLORS.text, { fontStyle: 'bold' }).setOrigin(0.5, 1).setDepth(5).setVisible(false);
    this.tipSub = label(this, 0, 0, '', 12, COLORS.dim).setOrigin(0.5, 1).setDepth(5).setVisible(false);
    this.tipHint = label(this, 0, 0, '', 12, COLORS.accent).setOrigin(0.5, 1).setDepth(5).setVisible(false);

    this.keysText = label(this, width - 12, height - 12, '', 12, COLORS.dim, { align: 'right', backgroundColor: '#0f2338cc', padding: { x: 8, y: 6 } }).setOrigin(1, 1).setDepth(3);
    this.arrow = this.add.image(0, 0, 'arrow').setDepth(5).setVisible(false);
    this.arrowText = label(this, 0, 0, 'к базе', 11, COLORS.accent).setOrigin(0.5, 0).setDepth(5).setVisible(false);
    this.devBadge = label(this, width / 2, height - 12, 'DEV', 12, '#06202a', { backgroundColor: '#f2b134', padding: { x: 8, y: 3 }, fontStyle: 'bold' }).setOrigin(0.5, 1).setVisible(false).setDepth(6);

    this.touch = new TouchControls(this, this.dive);
    this.scale.on(Phaser.Scale.Events.RESIZE, (gs: Phaser.Structs.Size) => this.layout(gs.width, gs.height));
    this.layout(width, height);
  }

  private get dive(): DiveScene {
    return this.scene.get('Dive') as DiveScene;
  }

  private layout(width: number, height: number): void {
    this.dark.setSize(width, height);
    this.fade.setSize(width, height);
    this.rightPanel.setPosition(width - 262, 12);
    this.bankText.setPosition(width - 252, 18);
    this.beltText.setPosition(width - 252, 38);
    this.knifeText.setPosition(width - 252, 58);
    this.msgText.setPosition(width / 2, 22);
    this.overloadText.setPosition(width / 2, 70);
    this.keysText.setPosition(width - 12, height - 12);
    this.devBadge.setPosition(width / 2, height - 12);
    this.touch.layout(width, height);
  }

  update(): void {
    const dive = this.dive;
    if (!dive || !dive.player) return;
    const now = this.time.now;
    const h = dive.hud;
    const s = state.save;
    const cam = dive.cameras.main;
    const view = cam.worldView;
    const zoom = cam.zoom;
    const toScreen = (wx: number, wy: number) => ({ x: (wx - view.x) * zoom, y: (wy - view.y) * zoom });

    // ---- Тьма: непрозрачная, стирается полигоном света и пятном причала ----
    this.dark.clear();
    this.dark.fill(0x000000, 1);
    const p = toScreen(dive.player.x, dive.player.y);
    const R = h.lightRadius * zoom;
    const size = Math.ceil(R * 2 + LIGHT.wallBleed * 2 * zoom + 8);
    // RenderTexture.resize в Phaser 3.90 оставляет текстуру пустой для последующих draw — пересоздаём объект (меняется редко)
    if (this.lightSize !== size) {
      this.lightRT.destroy();
      this.lightRT = this.add.renderTexture(-5000, -5000, size, size).setOrigin(0).setDepth(-10);
      this.lightSize = size;
    }
    const half = size / 2;
    if (h.lightPoly.length >= 6) {
      const n = h.lightPoly.length / 2;
      while (this.polyPts.length < n) this.polyPts.push(new Phaser.Math.Vector2());
      this.polyPts.length = n;
      for (let i = 0; i < n; i++) {
        this.polyPts[i].set((h.lightPoly[i * 2] - dive.player.x) * zoom + half, (h.lightPoly[i * 2 + 1] - dive.player.y) * zoom + half);
      }
      this.lightRT.clear();
      this.lightPoly.clear();
      this.lightPoly.fillStyle(0xffffff, 1);
      this.lightPoly.fillPoints(this.polyPts, true);
      this.lightRT.draw(this.lightPoly, 0, 0);
      this.lightInv.setDisplaySize(size, size);
      this.lightRT.erase(this.lightInv, half, half);
      this.dark.erase(this.lightRT, p.x - half, p.y - half);
    }
    const dc = toScreen(MAP.dock.x + MAP.dock.w / 2, MAP.dock.y + MAP.dock.h / 2);
    const g = LIGHT.baseGlowRadius * zoom;
    this.baseGlow.setDisplaySize(g * 2, g * 2);
    this.dark.erase(this.baseGlow, dc.x, dc.y);

    // ---- Переход у причала / провал ----
    this.fadeCur += (h.dock.fade - this.fadeCur) * 0.1;
    this.fade.setFillStyle(h.dock.dark ? 0x000000 : 0x05101c, 1).setAlpha(this.fadeCur * (h.dock.dark ? 1 : 0.35));

    const showHud = dive.mode === 'diving' || dive.mode === 'docking';
    for (const o of [this.leftPanel, this.o2Text, this.o2Bar, this.o2BarBg, this.depthText, this.cargoText, this.valueText, this.rightPanel, this.bankText, this.beltText, this.knifeText]) o.setVisible(showHud);
    if (!showHud) {
      this.overloadText.setVisible(false);
      this.msgText.setVisible(false);
      this.hideTip();
      this.arrow.setVisible(false);
      this.arrowText.setVisible(false);
      this.keysText.setVisible(false);
      this.touch.update(false);
      this.devBadge.setVisible(state.devActive || state.infiniteO2);
      return;
    }

    // ---- Кислород ----
    const d = state.dive;
    const lvl = warnLevel(d);
    const frac = Phaser.Math.Clamp(d.oxygen / d.maxOxygen, 0, 1);
    this.o2Text.setText(`O2 ${Math.ceil(d.oxygen)} с${state.infiniteO2 ? ' ∞' : ''}`);
    const color = lvl === 'hard' || lvl === 'out' ? 0xff6b5e : lvl === 'soft' ? 0xf2b134 : 0x3ec6c0;
    const pulse = lvl === 'hard' ? 0.6 + Math.abs(Math.sin(now / 150)) * 0.4 : 1;
    this.o2Bar.setFillStyle(color, pulse).setSize(Math.max(0, 228 * frac), 6);
    this.o2Text.setColor(lvl === 'hard' || lvl === 'out' ? COLORS.danger : lvl === 'soft' ? COLORS.warn : COLORS.text);
    this.leftPanel.setStrokeStyle(1, lvl === 'hard' ? 0xff6b5e : lvl === 'soft' ? 0xf2b134 : COLORS.panelLine, 1);

    this.depthText.setText(`Глубина ${h.depthM} м • фонарь ${h.lightRadius} px`);
    this.cargoText.setText(`Груз ${h.weight} / тяга ${h.haul} • ${h.speedPct}% скорости`);
    this.cargoText.setColor(h.overloaded ? (h.overloadRatio >= 1.5 ? COLORS.danger : COLORS.warn) : COLORS.text);
    const partsN = state.cargo.filter((c) => c.type === 'parts').length;
    this.valueText.setText(`Груз на ${h.cargoValue} монет${partsN ? ` + детали ×${partsN}` : ''}`);

    // ---- Банк, пояс, нож ----
    this.bankText.setText(`Банк ${s.coins} монет • Детали ${s.parts}`);
    const o2f = foundCount(state.belt, 'o2'), hf = foundCount(state.belt, 'harpoons');
    const harpoonsLine = s.upgrades.weapon > 0
      ? ` • Гарпуны ${beltTotal(state.belt, 'harpoons')}${hf ? ` (+${hf} найдено)` : ''}`
      : (hf || state.belt.base.harpoons ? ` • Гарпуны ${beltTotal(state.belt, 'harpoons')} (нет ружья)` : '');
    this.beltText.setText(`Пояс: O2 ×${beltTotal(state.belt, 'o2')}${o2f ? ` (+${o2f} найдено)` : ''}${harpoonsLine}`);
    this.knifeText.setText(h.knife || 'Нож не найден');
    void SUPPLIES;

    // ---- Сообщения и перегруз ----
    if (h.message && now < h.message.until) this.msgText.setText(h.message.text).setColor(h.message.color).setVisible(true);
    else this.msgText.setVisible(false);
    if (h.overloaded && dive.mode === 'diving') {
      const severe = h.overloadRatio >= 1.5;
      this.overloadText.setText(`ПЕРЕГРУЗ • ${h.speedPct}% скорости • Q сбросит: ${h.lastItemName}`);
      this.overloadText.setBackgroundColor(severe ? '#d9443a' : '#f2b134').setColor(severe ? '#fff1ee' : '#06202a');
      this.overloadText.setScale(1 + Math.sin(now / 180) * 0.03).setVisible(true);
    } else this.overloadText.setVisible(false);

    // ---- Подсказка у предмета (только в свете) ----
    if (h.nearest && dive.mode === 'diving') {
      const tp = toScreen(h.nearest.x, h.nearest.y);
      const y = tp.y - 14 * zoom;
      this.tipTitle.setText(h.nearest.title).setPosition(tp.x, y - 30).setVisible(true);
      this.tipSub.setText(h.nearest.sub).setPosition(tp.x, y - 15).setVisible(true);
      this.tipHint.setText(h.nearest.hint).setPosition(tp.x, y).setVisible(!!h.nearest.hint);
      const w = Math.max(this.tipTitle.width, this.tipSub.width, this.tipHint.width) + 16;
      this.tipBg.setPosition(tp.x, y + 4).setSize(w, 52).setVisible(true);
    } else this.hideTip();

    // ---- Клавиши ----
    if (dive.mode === 'diving') {
      const lines: string[] = [];
      const last = state.cargo[state.cargo.length - 1];
      lines.push(last ? `Q — сбросить: ${h.lastItemName} (вес ${last.weight})` : 'Q — сбросить (груз пуст)');
      if (beltTotal(state.belt, 'o2') > 0) lines.push(`R — баллончик O2 (+8 с), есть ${beltTotal(state.belt, 'o2')}`);
      if (s.upgrades.weapon > 0) lines.push(`F / Пробел — гарпун${h.reloadFrac < 1 ? ' (перезарядка)' : ''}`);
      lines.push('Esc — пауза');
      this.keysText.setText(lines.join('\n')).setVisible(!this.touch.enabled);
    } else this.keysText.setVisible(false);

    // ---- Стрелка к базе: по проходам, заметнее при низком кислороде ----
    if (dive.mode === 'diving' && !h.inDock && d.active) {
      const angle = h.home ? h.home.angle : h.homeFallbackAngle;
      const strong = lvl === 'hard' || lvl === 'out';
      const dist = strong ? 70 : lvl === 'soft' ? 64 : 58;
      const ax = p.x + Math.cos(angle) * dist, ay = p.y + Math.sin(angle) * dist;
      this.arrow.setPosition(ax, ay).setRotation(angle).setVisible(true);
      this.arrow.setScale(strong ? 1.6 + Math.abs(Math.sin(now / 160)) * 0.3 : lvl === 'soft' ? 1.3 : 1);
      this.arrow.setTint(strong ? 0xff6b5e : lvl === 'soft' ? 0xf2b134 : 0xffffff);
      this.arrowText.setPosition(ax, ay + 14).setVisible(lvl !== 'ok').setColor(strong ? COLORS.danger : COLORS.warn);
      this.arrowText.setText(strong ? 'к базе!' : 'к базе');
    } else {
      this.arrow.setVisible(false);
      this.arrowText.setVisible(false);
    }

    this.devBadge.setVisible(state.devActive || state.infiniteO2);

    // ---- Всплывающие числа ----
    while (h.floaters.length) {
      const f = h.floaters.shift()!;
      const fp = toScreen(f.x, f.y);
      const t = label(this, fp.x, fp.y, f.text, 13, f.color, { fontStyle: 'bold', stroke: '#06202a', strokeThickness: 3 }).setOrigin(0.5).setDepth(6);
      t.setData('born', now);
      t.setData('wx', f.x);
      t.setData('wy', f.y);
      this.floaters.push(t);
    }
    this.floaters = this.floaters.filter((t) => {
      const age = now - (t.getData('born') as number);
      if (age > 1000) {
        t.destroy();
        return false;
      }
      const fp = toScreen(t.getData('wx') as number, t.getData('wy') as number);
      t.setPosition(fp.x, fp.y - age * 0.04).setAlpha(1 - age / 1000);
      return true;
    });

    this.touch.update(dive.mode === 'diving');
  }

  private hideTip(): void {
    this.tipTitle.setVisible(false);
    this.tipSub.setVisible(false);
    this.tipHint.setVisible(false);
    this.tipBg.setVisible(false);
  }
}
