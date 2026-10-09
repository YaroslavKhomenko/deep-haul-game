// Весь баланс в одном месте. (ТЗ) — числа документа v0.3, (Т2) — правки по первому тесту, (ДП) — допущения сборки.

export type ItemType = 'shard' | 'ore' | 'crystal' | 'parts' | 'capsule' | 'o2' | 'harpoons' | 'knife';
export type ItemKind = 'valuable' | 'material' | 'goal' | 'supply' | 'equipment';
export type UpgradeId = 'fins' | 'tank' | 'haul' | 'lantern' | 'tools' | 'weapon' | 'suit';
export type SupplyKind = 'o2' | 'harpoons';

export interface ItemDef {
  name: string;
  kind: ItemKind;
  weight: number;
  price: number;
  supply?: SupplyKind;
  amount?: number;
}

export interface LevelCost {
  coins: number;
  parts: number;
}

export interface UpgradeDef {
  name: string;
  costs: LevelCost[];
  effect: (lvl: number) => string;
}

export const ITEMS: Record<ItemType, ItemDef> = {
  shard: { name: 'Обломок', kind: 'valuable', weight: 1, price: 3 }, // ТЗ
  ore: { name: 'Руда', kind: 'valuable', weight: 2, price: 9 }, // ТЗ
  crystal: { name: 'Кристалл', kind: 'valuable', weight: 4, price: 24 }, // ТЗ
  parts: { name: 'Детали', kind: 'material', weight: 2, price: 0 }, // ДП: единственный материал
  capsule: { name: 'Тяжёлая капсула', kind: 'goal', weight: 24, price: 0 }, // ТЗ
  o2: { name: 'Баллончик O2', kind: 'supply', weight: 0, price: 0, supply: 'o2', amount: 1 }, // ДП
  harpoons: { name: 'Гарпуны ×2', kind: 'supply', weight: 0, price: 0, supply: 'harpoons', amount: 2 }, // ДП
  knife: { name: 'Нож', kind: 'equipment', weight: 0, price: 0 }, // Т2: находка, снаряжение
};

export const DIVER = {
  v0: 140, // ТЗ
  finsStep: 14, // ТЗ
  haul: 6, // ТЗ
  haulStep: 3, // ТЗ
  slowCoef: 0.5, // ТЗ: кривая до нормального веса
  overloadCoef: 6, // Т2: кривая выше нормального веса (2/3)/(1+6(r−1)²)
  overloadLimit: 2, // ТЗ: предел подбора 200% C
  speedTau: 0.15, // ТЗ: замедление
  accelTau: 0.05, // Т2: ускорение после сброса ощущается сразу
  stopTau: 0.05,
  body: 26,
};

export const OXYGEN = {
  start: 25, // Т2
  tankStep: 5, // Т2
  warnSoft: 0.3, // ТЗ
  warnHard: 0.15, // ТЗ
  canister: 8, // Т2/ДП: при баке 25 с +15 обесценивал прокачку
};

export const PICKUP = { radius: 40, redropLock: 1.0, dropDistance: 34 };

export const TETHER = { lead: 18, spacing: 13, bagAfter: 12 };

export const KNIFE = {
  durability: [3, 5, 8], // по уровню Инструментов (Т2)
  repairCost: 4, // монет за единицу прочности (ДП)
  cutTime: 1.5, // с удержания E
  reach: 60,
};

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  haul: {
    name: 'Тяга',
    costs: [
      { coins: 18, parts: 0 }, { coins: 35, parts: 0 }, { coins: 65, parts: 2 }, { coins: 110, parts: 4 }, { coins: 175, parts: 6 },
    ], // ТЗ цены; детали с 3 уровня — ДП
    effect: (lvl) => `тяга ${effects.haul(lvl)}`,
  },
  tank: {
    name: 'Баллон',
    costs: [
      { coins: 10, parts: 0 }, { coins: 14, parts: 0 }, { coins: 20, parts: 1 }, { coins: 28, parts: 1 },
      { coins: 38, parts: 1 }, { coins: 50, parts: 1 }, { coins: 64, parts: 1 }, { coins: 80, parts: 1 },
    ], // Т2/ДП: 8 уровней по +5 с
    effect: (lvl) => `${effects.oxygen(lvl)} с кислорода`,
  },
  fins: {
    name: 'Ласты',
    costs: [
      { coins: 22, parts: 0 }, { coins: 45, parts: 0 }, { coins: 85, parts: 2 }, { coins: 140, parts: 4 }, { coins: 220, parts: 6 },
    ], // ТЗ
    effect: (lvl) => `${effects.v0(lvl)} px/с`,
  },
  lantern: {
    name: 'Фонарь',
    costs: [{ coins: 30, parts: 0 }, { coins: 70, parts: 3 }, { coins: 130, parts: 6 }], // ДП
    effect: (lvl) => `свет ${effects.lightRadius(lvl)} px`,
  },
  tools: {
    name: 'Инструменты',
    costs: [{ coins: 40, parts: 2 }, { coins: 110, parts: 6 }], // ДП; требует найденный нож
    effect: (lvl) => ['нож: тонкие сети, прочность 3', 'резак: толстые сети, прочность 5', 'резка ×2 быстрее, прочность 8'][lvl] ?? '',
  },
  weapon: {
    name: 'Оружие',
    costs: [{ coins: 45, parts: 2 }, { coins: 120, parts: 6 }], // ДП
    effect: (lvl) => ['без оружия', 'гарпун: урон 1, 0.8 с', 'усиленный: урон 2, 0.4 с'][lvl] ?? '',
  },
  suit: {
    name: 'Костюм',
    costs: [{ coins: 50, parts: 3 }, { coins: 130, parts: 8 }], // ДП
    effect: (lvl) => ['полный урон', 'урон ×0.5', 'кораллы безвредны, рыбы −2 с'][lvl] ?? '',
  },
};

export const UPGRADE_ORDER: UpgradeId[] = ['haul', 'tank', 'fins', 'lantern', 'tools', 'weapon', 'suit'];

export const SUPPLIES: Record<SupplyKind, { name: string; plural: string; price: number; cap: number }> = {
  o2: { name: 'Баллончик O2', plural: 'Баллончики O2', price: 8, cap: 3 },
  harpoons: { name: 'Гарпун', plural: 'Гарпуны', price: 3, cap: 10 },
};

export const START = { coins: 0, parts: 0, o2: 1, harpoons: 0 };

export const COMBAT = {
  fishDamage: 6,
  coralDamage: 6,
  invuln: 1.0,
  knockback: 170,
  harpoonSpeed: 420,
  harpoonLife: 0.9,
  reload: [0, 0.8, 0.4],
  damage: [0, 1, 2],
  suitMul: [1, 0.5, 0.5],
  suitCoralImmuneLevel: 2,
  suitFishDamageLvl2: 2,
};

export const CREATURES = {
  fish: { speed: 64, aggro: 170, leash: 260, hp: 1, retreat: 2.2 },
  fishBig: { speed: 40, hp: 2 },
  dart: { dashSpeed: 380, range: 340, band: 14, stun: 1.5, returnSpeed: 60, hp: 1, dashTime: 1.1 },
};

export const LIGHT = {
  radius: [70, 110, 160, 220], // Т2
  rays: 128,
  baseGlowRadius: 200, // локальный свет причала
  wallBleed: 12, // лучи заходят в стену, чтобы была видна её грань
};

export const effects = {
  v0: (lvl: number) => DIVER.v0 + DIVER.finsStep * lvl,
  haul: (lvl: number) => DIVER.haul + DIVER.haulStep * lvl,
  oxygen: (lvl: number) => OXYGEN.start + OXYGEN.tankStep * lvl,
  lightRadius: (lvl: number) => LIGHT.radius[Math.min(lvl, LIGHT.radius.length - 1)] ?? LIGHT.radius[0],
  knifeMax: (toolsLvl: number) => KNIFE.durability[Math.min(toolsLvl, KNIFE.durability.length - 1)] ?? KNIFE.durability[0],
};

export const WORLD = { tile: 16, pxPerMeter: 10 };
