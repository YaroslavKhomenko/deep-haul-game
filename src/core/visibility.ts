// Свет фонаря: лучи по сетке стен (полигон видимости) и проверка линии взгляда.

export type IsWall = (x: number, y: number) => boolean;

/** Полигон света: концы лучей от (px, py), остановленные стенами; заходят в стену на bleed, чтобы её грань была видна. */
export function castLight(isWall: IsWall, px: number, py: number, radius: number, rays: number, bleed: number, step = 4): number[] {
  const pts: number[] = [];
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    const dx = Math.cos(a), dy = Math.sin(a);
    let d = step;
    let hit = false;
    while (d <= radius) {
      if (isWall(px + dx * d, py + dy * d)) { hit = true; break; }
      d += step;
    }
    const len = hit ? Math.min(radius, d + bleed) : radius;
    pts.push(px + dx * len, py + dy * len);
  }
  return pts;
}

/** Прямая от (x0,y0) к (x1,y1) не пересекает стен (шаг step px). */
export function hasLineOfSight(isWall: IsWall, x0: number, y0: number, x1: number, y1: number, step = 4): boolean {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < step) return true;
  const n = Math.ceil(len / step);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (isWall(x0 + dx * t, y0 + dy * t)) return false;
  }
  return true;
}
