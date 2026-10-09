import { test } from 'node:test';
import assert from 'node:assert/strict';
import { castLight, hasLineOfSight } from '../src/core/visibility.ts';

const wallRight = (x: number) => x >= 100; // стена при x ≥ 100

test('лучи света останавливаются стеной и заходят в неё лишь на bleed', () => {
  const pts = castLight((x) => wallRight(x), 50, 50, 200, 8, 10);
  assert.equal(pts.length, 16);
  const right = { x: pts[0], y: pts[1] }; // луч под углом 0
  assert.ok(right.x >= 100 && right.x <= 116, `упёрся в стену: ${right.x}`);
  const left = { x: pts[8], y: pts[9] }; // луч под углом π
  assert.ok(Math.abs(left.x - -150) < 1, `свободный луч на весь радиус: ${left.x}`);
});

test('линия взгляда: через стену не видно', () => {
  assert.equal(hasLineOfSight((x) => wallRight(x), 50, 50, 150, 50), false);
  assert.equal(hasLineOfSight((x) => wallRight(x), 50, 50, 90, 50), true);
});
