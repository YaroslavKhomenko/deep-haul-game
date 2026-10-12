import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modeFor } from '../src/mode.ts';

test('общая ссылка всегда открывает уровень; песочница только локально по ?mode=sandbox', () => {
  assert.equal(modeFor('yaroslavkhomenko.github.io', '?mode=sandbox'), 'level');
  assert.equal(modeFor('yaroslavkhomenko.github.io', ''), 'level');
  assert.equal(modeFor('localhost', '?mode=sandbox'), 'sandbox');
  assert.equal(modeFor('127.0.0.1', '?mode=sandbox'), 'sandbox');
  assert.equal(modeFor('localhost', ''), 'level');
});
