// Режим запуска: по умолчанию — прототип уровня, `?mode=sandbox` — прежняя демка (итерация 2).
export type GameMode = 'level' | 'sandbox';

function readMode(): GameMode {
  try {
    return new URLSearchParams(window.location.search).get('mode') === 'sandbox' ? 'sandbox' : 'level';
  } catch {
    return 'level';
  }
}

export const MODE: GameMode = typeof window === 'undefined' ? 'level' : readMode();
