// Карта прототипа уровня: лодка на поверхности, ближняя зона, средняя зона с подстанцией, дальняя зона за решёткой.
// Координаты в игровых пикселях, кратны 16. Лут — со стабильными id (состояние сохраняется по ним).
import type { DecorSpawn, LootSpawn, NetSpawn, Rect } from '../config/map.ts';
import type { ItemType } from '../config/balance.ts';
import { ENGINE_ID, type BaseId } from './config.ts';

const R = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });
const item = (id: string, type: ItemType, x: number, y: number): LootSpawn => ({ id, type, x, y });

export interface LevelBaseDef {
  name: string;
  /** Зона базы («белый квадрат»): вход завершает вылазку, восстанавливает кислород, открывает базу. */
  zone: Rect;
  spawn: { x: number; y: number };
  sprite: { x: number; y: number };
}

export const LEVEL_WATER: Rect[] = [
  // Поверхность: бухта под лодкой и узкая шахта вниз с двумя нишами
  R(640, 112, 480, 144), R(832, 256, 96, 176), R(800, 304, 32, 32), R(928, 368, 32, 32),
  // Ближняя зона (хаб 1) и ниши
  R(560, 432, 640, 224), R(528, 464, 32, 48), R(960, 656, 48, 32), R(1136, 400, 48, 32),
  // Западный карман: нож и стартовый ящик
  R(448, 576, 112, 64), R(336, 528, 112, 144),
  // Восточный карман за необязательной сетью
  R(1200, 528, 112, 64), R(1312, 480, 144, 160),
  // Спуск в среднюю зону (сеть N1)
  R(640, 656, 96, 224),
  // Средняя зона (хаб 2) и ниши
  R(560, 880, 608, 256), R(848, 1136, 48, 32), R(1104, 848, 48, 32),
  // Западный карман за сетью N2 (компонент B)
  R(448, 976, 112, 64), R(304, 928, 144, 176),
  // Камера подстанции и шахта за решёткой
  R(1168, 960, 208, 176), R(1264, 1136, 96, 256),
  // Дальняя зона (хаб 3) и ниши
  R(992, 1392, 576, 208), R(1520, 1360, 48, 32), R(1104, 1600, 48, 32),
  // Камера двигателя за сетью N3
  R(832, 1472, 160, 64), R(656, 1424, 176, 176),
  // Необязательный карман за сетью в дальней зоне
  R(1424, 1600, 96, 64), R(1376, 1664, 192, 112),
];

export const LEVEL = {
  width: 1664,
  height: 1840,
  surfaceY: 112,
  /** Воздух над бухтой: без тайлов, свет дня. */
  sky: R(0, 0, 1664, 112),
  water: LEVEL_WATER,
  bases: {
    boat: { name: 'Лодка', zone: R(784, 112, 192, 96), spawn: { x: 880, y: 168 }, sprite: { x: 880, y: 112 } },
    sub: { name: 'Подстанция', zone: R(1232, 976, 144, 160), spawn: { x: 1270, y: 1044 }, sprite: { x: 1326, y: 1137 } },
  } as Record<BaseId, LevelBaseDef>,
  loot: [
    // Бухта и шахта: первые находки рядом с лодкой
    item('b-sh-01', 'shard', 716, 242), item('b-sh-02', 'shard', 1044, 242),
    item('s1-sh-01', 'shard', 816, 320), item('s1-sh-02', 'shard', 944, 384), item('s1-sh-03', 'shard', 846, 420),
    // Ближняя зона: обломки и руда у стен, в нишах
    item('h1-sh-01', 'shard', 584, 642), item('h1-sh-02', 'shard', 764, 644), item('h1-sh-03', 'shard', 984, 676),
    item('h1-sh-04', 'shard', 1180, 642), item('h1-sh-05', 'shard', 544, 488), item('h1-sh-06', 'shard', 1160, 414),
    item('h1-sh-07', 'shard', 904, 446),
    item('h1-ore-01', 'ore', 618, 448), item('h1-ore-02', 'ore', 1040, 644), item('h1-ore-03', 'ore', 1186, 456), item('h1-ore-04', 'ore', 824, 644),
    // Западный карман: нож и стартовые припасы
    item('w1-knife', 'knife', 372, 660), item('w1-crate', 'crate', 420, 658),
    item('w1-sh-01', 'shard', 352, 544), item('w1-sh-02', 'shard', 432, 546),
    // Восточный карман (необязательная сеть)
    item('e1-ore-01', 'ore', 1330, 626), item('e1-ore-02', 'ore', 1438, 626), item('e1-ore-03', 'ore', 1438, 496), item('e1-cr-01', 'crystal', 1330, 496),
    // Спуск
    item('d-sh-01', 'shard', 722, 800),
    // Средняя зона
    item('h2-ore-01', 'ore', 584, 1122), item('h2-ore-02', 'ore', 700, 1124), item('h2-ore-03', 'ore', 1004, 1122),
    item('h2-ore-04', 'ore', 1150, 896), item('h2-ore-05', 'ore', 578, 896), item('h2-ore-06', 'ore', 1064, 1124),
    item('h2-cr-01', 'crystal', 1128, 862), item('h2-cr-02', 'crystal', 764, 896),
    item('h2-crate', 'crate', 930, 1122),
    item('h2-comp-a', 'component', 872, 1154),
    // Западный карман за N2
    item('w2-comp-b', 'component', 326, 1090), item('w2-ore-01', 'ore', 428, 1090), item('w2-ore-02', 'ore', 326, 944), item('w2-cr-01', 'crystal', 428, 944),
    // Дальняя зона
    item('h3-cr-01', 'crystal', 1544, 1374), item('h3-cr-02', 'crystal', 1128, 1616), item('h3-cr-03', 'crystal', 1016, 1586), item('h3-cr-04', 'crystal', 1404, 1586),
    item('h3-ore-01', 'ore', 1250, 1588), item('h3-ore-02', 'ore', 1550, 1500),
    // Камера двигателя за N3
    item(ENGINE_ID, 'engine', 744, 1586), item('er-cr-01', 'crystal', 680, 1442),
    // Необязательный карман дальней зоны
    item('z3-crate', 'crate', 1400, 1762), item('z3-cr-01', 'crystal', 1472, 1762), item('z3-cr-02', 'crystal', 1546, 1682),
  ] as LootSpawn[],
  nets: [
    { id: 'net-e1', x: 1248, y: 528, w: 16, h: 64, kind: 'thin' },
    { id: 'net-n1', x: 640, y: 720, w: 96, h: 16, kind: 'thin' },
    { id: 'net-n2', x: 512, y: 976, w: 16, h: 64, kind: 'thin' },
    { id: 'gate', x: 1264, y: 1152, w: 96, h: 16, kind: 'thick' },
    { id: 'net-n3', x: 912, y: 1472, w: 16, h: 64, kind: 'thin' },
    { id: 'net-z3', x: 1424, y: 1616, w: 96, h: 16, kind: 'thin' },
  ] as NetSpawn[],
  optionalNets: ['net-e1', 'net-z3'],
  decor: [
    { frame: 'seaweed', x: 704, y: 256 }, { frame: 'bush', x: 1060, y: 256 },
    { frame: 'bush', x: 640, y: 656 }, { frame: 'seaweed', x: 1110, y: 656 }, { frame: 'seaweed', x: 436, y: 672 },
    { frame: 'seaweed', x: 620, y: 1136 }, { frame: 'pillar', x: 1100, y: 1136 },
    { frame: 'ruins', x: 1290, y: 1600 }, { frame: 'seaweed', x: 1050, y: 1600 }, { frame: 'seaweed', x: 806, y: 1600 },
  ] as DecorSpawn[],
};

export function inLevelRect(x: number, y: number, r: Rect): boolean {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}
