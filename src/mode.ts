// Режим запуска: по умолчанию — прототип уровня. Прежняя демка (итерация 2) открывается по `?mode=sandbox`
// только при локальном запуске (localhost); на общей ссылке игроки видят только уровень.
export type GameMode = 'level' | 'sandbox';

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

export function modeFor(hostname: string, search: string): GameMode {
  return LOCAL_HOSTS.includes(hostname) && new URLSearchParams(search).get('mode') === 'sandbox' ? 'sandbox' : 'level';
}

function readMode(): GameMode {
  try {
    return modeFor(window.location.hostname, window.location.search);
  } catch {
    return 'level';
  }
}

export const MODE: GameMode = typeof window === 'undefined' ? 'level' : readMode();
