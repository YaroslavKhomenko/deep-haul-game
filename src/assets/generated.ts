// Недостающие ассеты, нарисованные кодом в палитре набора Ansimuz: лут, капсула, сети, гарпун, причал, свет, подсветка.
import Phaser from 'phaser';

const PAL = {
  dark: 0x0b1d2e,
  navy: 0x14324a,
  teal: 0x3ec6c0,
  tealDark: 0x1f7f84,
  amber: 0xf2b134,
  amberDark: 0xb86f1d,
  orange: 0xe8742c,
  cream: 0xf6e7c1,
  steel: 0x8fa9b8,
  steelDark: 0x4a6478,
  ice: 0xcfe9f5,
  red: 0xd9443a,
  green: 0x5f9a3e,
  greenDark: 0x2c5a35,
  white: 0xffffff,
  black: 0x000000,
};

type G = Phaser.GameObjects.Graphics;

function px(g: G, color: number, x: number, y: number, w = 1, h = 1) {
  g.fillStyle(color, 1);
  g.fillRect(x, y, w, h);
}

function gen(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: G) => void) {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

function radialCanvas(scene: Phaser.Scene, key: string, size: number, inner: string, outer: string, stops?: [number, string][]) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, size, size);
  if (!tex) return;
  const ctx = tex.context;
  const grd = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  if (stops) for (const [p, c] of stops) grd.addColorStop(p, c);
  else {
    grd.addColorStop(0, inner);
    grd.addColorStop(1, outer);
  }
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, size, size);
  tex.refresh();
}

export function createGeneratedTextures(scene: Phaser.Scene): void {
  // 1×1 белый пиксель для прямоугольников интерфейса и верёвки
  gen(scene, 'pixel', 1, 1, (g) => px(g, PAL.white, 0, 0));

  // Обломок: тёплый угловатый кусок (ценность)
  gen(scene, 'item-shard', 12, 12, (g) => {
    px(g, PAL.amberDark, 2, 4, 8, 6);
    px(g, PAL.amber, 3, 3, 6, 5);
    px(g, PAL.cream, 4, 3, 2, 1);
    px(g, PAL.amberDark, 5, 9, 4, 1);
  });
  // Руда: оранжево-бурый камень с золотыми вкраплениями
  gen(scene, 'item-ore', 14, 14, (g) => {
    px(g, PAL.amberDark, 2, 4, 10, 8);
    px(g, PAL.orange, 3, 3, 8, 7);
    px(g, PAL.amber, 5, 5, 2, 2);
    px(g, PAL.amber, 9, 7, 2, 2);
    px(g, PAL.cream, 5, 5, 1, 1);
    px(g, PAL.amberDark, 4, 11, 6, 1);
  });
  // Кристалл: яркий тёплый самоцвет
  gen(scene, 'item-crystal', 16, 18, (g) => {
    px(g, PAL.amberDark, 6, 2, 4, 14);
    px(g, PAL.orange, 7, 1, 2, 15);
    px(g, PAL.amber, 7, 3, 1, 10);
    px(g, PAL.cream, 7, 4, 1, 3);
    px(g, PAL.amberDark, 3, 8, 3, 8);
    px(g, PAL.orange, 4, 7, 1, 9);
    px(g, PAL.amberDark, 10, 9, 3, 7);
    px(g, PAL.orange, 11, 8, 1, 8);
    px(g, PAL.amberDark, 2, 16, 12, 1);
  });
  // Детали: холодный стальной ящик с шестерёнкой
  gen(scene, 'item-parts', 14, 12, (g) => {
    px(g, PAL.steelDark, 1, 2, 12, 9);
    px(g, PAL.steel, 2, 3, 10, 7);
    px(g, PAL.steelDark, 5, 5, 4, 4);
    px(g, PAL.ice, 6, 6, 2, 2);
    px(g, PAL.steelDark, 2, 1, 10, 1);
    px(g, PAL.ice, 3, 3, 1, 1);
  });
  // Баллончик O2: белый цилиндр с бирюзовым крестом
  gen(scene, 'item-o2', 10, 16, (g) => {
    px(g, PAL.steelDark, 2, 2, 6, 13);
    px(g, PAL.ice, 3, 3, 4, 11);
    px(g, PAL.steel, 4, 0, 2, 2);
    px(g, PAL.teal, 4, 6, 2, 5);
    px(g, PAL.teal, 3, 8, 4, 1);
  });
  // Гарпуны: тёмная связка со стрелкой
  gen(scene, 'item-harpoons', 16, 10, (g) => {
    px(g, PAL.steelDark, 1, 3, 13, 4);
    px(g, PAL.steel, 2, 4, 11, 2);
    px(g, PAL.amber, 12, 2, 3, 6);
    px(g, PAL.cream, 13, 4, 1, 2);
  });
  // Капсула: тяжёлый тёмный контейнер с красным маячком
  gen(scene, 'item-capsule', 40, 24, (g) => {
    px(g, PAL.black, 4, 4, 32, 16);
    px(g, PAL.steelDark, 5, 5, 30, 14);
    px(g, PAL.steel, 7, 7, 26, 3);
    px(g, PAL.navy, 7, 12, 26, 5);
    px(g, PAL.steelDark, 0, 8, 4, 8);
    px(g, PAL.steelDark, 36, 8, 4, 8);
    px(g, PAL.red, 18, 2, 4, 2);
    px(g, PAL.amber, 10, 13, 20, 1);
  });
  // Нож: находка, снаряжение
  gen(scene, 'item-knife', 18, 10, (g) => {
    px(g, PAL.steelDark, 0, 3, 7, 4);
    px(g, PAL.amberDark, 1, 4, 5, 2);
    px(g, PAL.steel, 7, 2, 10, 5);
    px(g, PAL.ice, 8, 3, 8, 1);
    px(g, PAL.steelDark, 16, 4, 2, 2);
  });
  // ---- Режим уровня: ящик снабжения, компонент подстанции, двигатель, лодка, подстанция ----
  // Ящик снабжения: стальной короб с бирюзовым крестом (знак припасов)
  gen(scene, 'item-crate', 16, 14, (g) => {
    px(g, PAL.black, 0, 1, 16, 13);
    px(g, PAL.steelDark, 1, 2, 14, 11);
    px(g, PAL.steel, 2, 3, 12, 2);
    px(g, PAL.teal, 7, 5, 2, 7);
    px(g, PAL.teal, 4, 7, 8, 2);
    px(g, PAL.ice, 2, 3, 1, 1);
  });
  // Компонент подстанции: блок с изолятором и янтарной молнией
  gen(scene, 'item-component', 14, 16, (g) => {
    px(g, PAL.black, 2, 3, 10, 13);
    px(g, PAL.steelDark, 3, 4, 8, 11);
    px(g, PAL.ice, 5, 0, 4, 4);
    px(g, PAL.steel, 6, 1, 2, 2);
    px(g, PAL.amber, 7, 6, 2, 2);
    px(g, PAL.amber, 6, 8, 2, 2);
    px(g, PAL.amber, 7, 10, 2, 3);
  });
  // Двигатель лодки: тяжёлый корпус с винтом
  gen(scene, 'item-engine', 36, 24, (g) => {
    px(g, PAL.black, 2, 5, 26, 17);
    px(g, PAL.steelDark, 3, 6, 24, 15);
    px(g, PAL.steel, 5, 8, 20, 3);
    px(g, PAL.navy, 5, 13, 20, 6);
    px(g, PAL.amberDark, 9, 2, 12, 4);
    px(g, PAL.amber, 10, 3, 10, 1);
    px(g, PAL.steelDark, 28, 11, 3, 4);
    px(g, PAL.ice, 31, 5, 3, 6);
    px(g, PAL.ice, 31, 15, 3, 6);
    px(g, PAL.steel, 32, 11, 2, 4);
  });
  // Лодка: корпус, рубка, лампа, лебёдка
  gen(scene, 'boat', 132, 52, (g) => {
    px(g, PAL.black, 6, 30, 120, 14);
    px(g, PAL.navy, 8, 31, 116, 6);
    px(g, PAL.steelDark, 12, 37, 108, 6);
    px(g, PAL.amberDark, 8, 30, 116, 1);
    px(g, PAL.steelDark, 40, 12, 40, 18);
    px(g, PAL.steel, 42, 14, 36, 4);
    px(g, PAL.ice, 46, 20, 8, 6);
    px(g, PAL.ice, 58, 20, 8, 6);
    px(g, PAL.amber, 70, 20, 6, 6);
    px(g, PAL.steelDark, 88, 6, 3, 24);
    px(g, PAL.steelDark, 88, 6, 22, 3);
    px(g, PAL.amber, 104, 9, 4, 4);
    px(g, PAL.steel, 108, 9, 1, 30);
    px(g, PAL.amber, 26, 24, 6, 6);
    px(g, PAL.cream, 28, 26, 2, 2);
  });
  // Подстанция: бетонный блок с трубами; выкл — красная лампа, вкл — бирюзовая
  const substation = (key: string, on: boolean) => gen(scene, key, 60, 60, (g) => {
    px(g, PAL.black, 4, 12, 52, 48);
    px(g, on ? PAL.tealDark : PAL.steelDark, 6, 14, 48, 44);
    px(g, on ? PAL.teal : PAL.steel, 8, 16, 44, 3);
    px(g, PAL.navy, 12, 24, 14, 22);
    px(g, PAL.navy, 34, 24, 14, 22);
    px(g, on ? PAL.ice : PAL.steelDark, 15, 28, 8, 3);
    px(g, on ? PAL.ice : PAL.steelDark, 37, 28, 8, 3);
    px(g, PAL.steelDark, 26, 0, 8, 12);
    px(g, on ? PAL.teal : PAL.red, 27, 2, 6, 6);
    px(g, on ? PAL.ice : PAL.amberDark, 29, 3, 2, 2);
    px(g, PAL.steelDark, 0, 40, 6, 6);
    px(g, PAL.steelDark, 54, 32, 6, 6);
  });
  substation('substation-off', false);
  substation('substation-on', true);
  // Гарпун-снаряд
  gen(scene, 'harpoon', 16, 4, (g) => {
    px(g, PAL.steelDark, 0, 1, 12, 2);
    px(g, PAL.steel, 2, 1, 9, 1);
    px(g, PAL.ice, 12, 0, 4, 4);
    px(g, PAL.steel, 13, 1, 3, 2);
  });
  // Тонкая сеть (тайл 16×16)
  gen(scene, 'net-thin', 16, 16, (g) => {
    for (let i = 0; i < 16; i++) {
      px(g, 0x9fb7a4, i, i);
      px(g, 0x9fb7a4, 15 - i, i);
    }
    px(g, PAL.cream, 7, 7, 2, 2);
  });
  // Толстая сеть с цепью
  gen(scene, 'net-thick', 16, 16, (g) => {
    px(g, PAL.steelDark, 0, 0, 16, 16);
    px(g, PAL.navy, 1, 1, 14, 14);
    for (let i = 0; i < 16; i += 2) {
      px(g, PAL.steel, i, i, 2, 2);
      px(g, PAL.steel, 14 - i, i, 2, 2);
    }
    px(g, PAL.steel, 0, 7, 16, 2);
    px(g, PAL.ice, 7, 7, 2, 2);
  });
  // Причал базы: тёмно-синяя платформа с тёплыми лампами
  gen(scene, 'dock', 240, 40, (g) => {
    px(g, PAL.black, 0, 10, 240, 10);
    px(g, PAL.navy, 2, 12, 236, 6);
    px(g, PAL.steelDark, 0, 18, 240, 2);
    for (let x = 16; x < 240; x += 56) {
      px(g, PAL.steelDark, x, 20, 6, 20);
      px(g, PAL.steelDark, x + 3, 0, 3, 10);
      px(g, PAL.amber, x, 2, 9, 6);
      px(g, PAL.cream, x + 3, 4, 3, 2);
    }
    px(g, PAL.teal, 100, 13, 40, 2);
  });
  // Радиальный свет фонаря и тёплое свечение базы
  radialCanvas(scene, 'light', 256, '', '', [
    [0, 'rgba(255,255,255,1)'], [0.45, 'rgba(255,255,255,0.95)'], [0.75, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)'],
  ]);
  radialCanvas(scene, 'glow-warm', 256, '', '', [
    [0, 'rgba(255,190,90,0.55)'], [0.5, 'rgba(255,160,60,0.18)'], [1, 'rgba(255,140,40,0)'],
  ]);
  // Инверсный градиент: прозрачный центр → непрозрачный край; им «стирается» край полигона света
  radialCanvas(scene, 'light-inv', 256, '', '', [
    [0, 'rgba(0,0,0,0)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)'],
  ]);
  // Режим уровня: шире яркая часть света, край короче
  radialCanvas(scene, 'light-inv-soft', 256, '', '', [
    [0, 'rgba(0,0,0,0)'], [0.72, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)'],
  ]);
  radialCanvas(scene, 'glow-teal', 64, '', '', [
    [0, 'rgba(120,240,230,0.9)'], [1, 'rgba(120,240,230,0)'],
  ]);
  // Кольцо подсветки ближайшего предмета
  gen(scene, 'ring', 32, 32, (g) => {
    g.lineStyle(2, PAL.teal, 1);
    g.strokeCircle(16, 16, 13);
  });
  // Стрелка к базе
  gen(scene, 'arrow', 24, 24, (g) => {
    g.fillStyle(PAL.teal, 1);
    g.fillTriangle(22, 12, 4, 3, 4, 21);
    g.fillStyle(PAL.dark, 1);
    g.fillTriangle(16, 12, 7, 7, 7, 17);
  });
}

export const LOOT_TEXTURE: Record<string, string> = {
  crate: 'item-crate',
  component: 'item-component',
  engine: 'item-engine',
  knife: 'item-knife',
  shard: 'item-shard',
  ore: 'item-ore',
  crystal: 'item-crystal',
  parts: 'item-parts',
  o2: 'item-o2',
  harpoons: 'item-harpoons',
  capsule: 'item-capsule',
};
