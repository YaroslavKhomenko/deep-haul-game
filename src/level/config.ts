// Баланс прототипа уровня. Все числа — стартовые для плейтеста; калибруются тестами tests/level-*.test.ts и прогоном.

export type LevelUpgradeId = 'oxygen' | 'lantern' | 'fins' | 'tow';
export type BaseId = 'boat' | 'sub';

export interface LevelUpgradeDef {
  name: string;
  /** Значение параметра на уровнях 0..N. */
  values: number[];
  /** Цена покупки уровня 1..N в золоте. */
  costs: number[];
  describe(value: number): string;
  hint: string;
}

export const LEVEL_UPGRADES: Record<LevelUpgradeId, LevelUpgradeDef> = {
  oxygen: {
    name: 'Кислород',
    values: [25, 35, 45, 60],
    costs: [10, 22, 40],
    describe: (v) => `${v} с под водой`,
    hint: 'дольше погружение',
  },
  tow: {
    name: 'Буксир',
    values: [6, 9, 13, 17],
    costs: [12, 24, 40],
    describe: (v) => `норма груза ${v}`,
    hint: 'тяжёлый груз замедляет меньше',
  },
  fins: {
    name: 'Ласты',
    values: [140, 165, 190, 220],
    costs: [15, 30, 50],
    describe: (v) => `скорость ${v}`,
    hint: 'быстрее плавание',
  },
  lantern: {
    name: 'Фонарь',
    values: [70, 110, 160, 220],
    costs: [15, 30, 50],
    describe: (v) => `свет ${v} px`,
    hint: 'шире освещённая область',
  },
};

export const LEVEL_UPGRADE_ORDER: LevelUpgradeId[] = ['oxygen', 'tow', 'fins', 'lantern'];

export const LEVEL_KNIFE = {
  max: 2,
  /** Припасов за единицу прочности. */
  repairCost: 1,
  cutTime: 1.5,
};

/** Припасов из одного ящика снабжения. */
export const CRATE_SUPPLIES = 2;
export const COMPONENTS_NEEDED = 2;

/** Сети, которые нужно разрезать ножом для прохождения (решётка открывается подстанцией). */
export const MANDATORY_NETS = ['net-n1', 'net-n2', 'net-n3'] as const;
export const GATE_ID = 'gate';
/** id двигателя лодки на карте (цель «заберите двигатель», если он остался в пещере). */
export const ENGINE_ID = 'engine';

/**
 * Предупреждения о кислороде с учётом возврата: оценка = длина пути до ближайшей базы / текущая скорость с грузом.
 * Мягкое — O2 ≤ max(softFloor·запас, оценка·softMul + softAdd); красное — O2 ≤ max(hardFloor·запас, оценка·hardMul + hardAdd).
 * Калибровка по ручному прогону: фактический возврат с клавиатуры = оценка × 1.02–1.22 (5 маршрутов, 5–15 с),
 * поэтому красное берёт ×1.25 + 2 с, мягкое — ×1.4 + 3 с.
 */
export const LEVEL_WARN = {
  softFloor: 0.35,
  hardFloor: 0.2,
  softMul: 1.4,
  softAdd: 3,
  hardMul: 1.25,
  hardAdd: 2,
  /** Поправка: BFS считает диагональный шаг как прямой. */
  pathFactor: 1.1,
};

export function upgradeValue(id: LevelUpgradeId, level: number): number {
  const v = LEVEL_UPGRADES[id].values;
  return v[Math.max(0, Math.min(level, v.length - 1))];
}

export function upgradeMax(id: LevelUpgradeId): number {
  return LEVEL_UPGRADES[id].costs.length;
}
