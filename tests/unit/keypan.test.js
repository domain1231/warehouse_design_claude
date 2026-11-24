import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heldVector, panDelta, isArrow, PAN_SPEED, PAN_FAST } from '../../src/cad/keypan.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test('단일 방향키', () => {
  assert.deepEqual(heldVector(new Set(['ArrowRight'])), [1, 0]);
  assert.deepEqual(heldVector(new Set(['ArrowUp'])), [0, -1]);
  assert.deepEqual(panDelta(new Set(), false, 1), { dx: 0, dy: 0 });
  assert.ok(isArrow('ArrowLeft') && !isArrow('a'));
});
test('대각선과 상쇄', () => {
  assert.deepEqual(heldVector(new Set(['ArrowUp', 'ArrowRight'])), [1, -1]);
  assert.deepEqual(heldVector(new Set(['ArrowLeft', 'ArrowRight'])), [0, 0]);
  assert.deepEqual(heldVector(new Set(['ArrowLeft', 'ArrowRight', 'ArrowDown'])), [0, 1]);
  const d = panDelta(new Set(['ArrowDown', 'ArrowLeft']), false, 1);
  near(Math.hypot(d.dx, d.dy), PAN_SPEED);
  assert.ok(d.dx < 0 && d.dy > 0);
});
test('Shift 배율과 dt 비례', () => {
  const k = new Set(['ArrowRight']);
  near(panDelta(k, false, 0.5).dx, PAN_SPEED * 0.5);
  near(panDelta(k, true, 0.5).dx, PAN_SPEED * PAN_FAST * 0.5);
  near(panDelta(k, false, 0.1).dx * 2, panDelta(k, false, 0.2).dx);
});
