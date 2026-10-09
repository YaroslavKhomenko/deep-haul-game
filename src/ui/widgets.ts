// Мини-набор виджетов Phaser для интерфейса: панели, текст, кнопки.
import Phaser from 'phaser';

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
export const COLORS = { panel: 0x0f2338, panelLine: 0x1f4866, text: '#e6f3f8', dim: '#9db4c4', accent: '#3ec6c0', warn: '#f2b134', danger: '#ff6b5e', accentHex: 0x3ec6c0 };

export function textStyle(size = 14, color = COLORS.text, extra: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {}): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: FONT, fontSize: `${size}px`, color, ...extra };
}

export function label(scene: Phaser.Scene, x: number, y: number, text: string, size = 14, color = COLORS.text, extra: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {}): Phaser.GameObjects.Text {
  const t = scene.add.text(x, y, text, textStyle(size, color, extra));
  t.setResolution(Math.min(2, window.devicePixelRatio || 1));
  return t;
}

export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, alpha = 0.88): Phaser.GameObjects.Rectangle {
  const r = scene.add.rectangle(x, y, w, h, COLORS.panel, alpha).setOrigin(0);
  r.setStrokeStyle(1, COLORS.panelLine, 1);
  return r;
}

export interface Button {
  bg: Phaser.GameObjects.Rectangle;
  txt: Phaser.GameObjects.Text;
  setEnabled(on: boolean): void;
  setLabel(t: string): void;
  destroy(): void;
}

export function button(scene: Phaser.Scene, x: number, y: number, w: number, h: number, text: string, onClick: () => void, enabled = true, size = 13): Button {
  const bg = scene.add.rectangle(x, y, w, h, COLORS.accentHex, 1).setOrigin(0);
  const txt = label(scene, x + w / 2, y + h / 2, text, size, '#06202a', { fontStyle: 'bold' }).setOrigin(0.5);
  let on = enabled;
  const apply = () => {
    bg.setFillStyle(on ? COLORS.accentHex : 0x24465a, 1);
    txt.setColor(on ? '#06202a' : '#7f97a6');
    if (on) bg.setInteractive({ useHandCursor: true });
    else bg.disableInteractive();
  };
  bg.on('pointerover', () => on && bg.setFillStyle(0x62dcd6, 1));
  bg.on('pointerout', () => apply());
  bg.on('pointerdown', (p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
    ev.stopPropagation();
    void p;
    if (on) onClick();
  });
  apply();
  return {
    bg, txt,
    setEnabled(v) { on = v; apply(); },
    setLabel(t) { txt.setText(t); },
    destroy() { bg.destroy(); txt.destroy(); },
  };
}

export function formatTime(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
