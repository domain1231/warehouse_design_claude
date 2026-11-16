import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pairUnits, planFixed, gapsFor } from '../../src/autolayout/fixed-columns.js';

const T = [1.2, 0.6, 0.5, 0.51, 0.51, 0.51, 0.51, 0.51, 0.51, 0.51, 0.5, 0.51, 1.11, 1.11];
const profile = T.map((thickness, i) => ({ column: 'C' + i, count: 1, thickness, length: i === 3 ? 7.23 : 6 }));
const opt = { spanE: 18.44, spanS: 8.5, wallGap: 0.1, aisleTarget: 1.2, backGap: 0.1 };

test('pairUnits: 첫 열 단독, 둘씩 묶음, 남으면 마지막 단독', () => {
  const u = pairUnits(14);
  assert.deepEqual(u[0], [0]);
  assert.deepEqual(u[1], [1, 2]);
  assert.deepEqual(u[6], [11, 12]);
  assert.deepEqual(u.at(-1), [13]);
  assert.deepEqual(pairUnits(13).at(-1), [11, 12]);
});

test('planFixed: 통로 최대 폭·목표 충족·길이', () => {
  const p = planFixed(profile, opt);
  assert.equal(p.all.aMax, 0.703);
  assert.equal(p.all.meetsTarget, false);
  assert.equal(p.pairs.aMax, 1.22);
  assert.equal(p.pairs.meetsTarget, true);
  assert.equal(p.lengthOK, true);
  const q = planFixed(profile, { ...opt, spanS: 7 });
  assert.equal(q.lengthOK, false);
  assert.ok(q.tooLong.includes('C3'));
});

test('gapsFor', () => {
  const p = planFixed(profile, opt);
  const g = gapsFor(p, 'pairs', 'max');
  assert.equal(g.gaps[2], 0.1);
  assert.equal(g.gaps[1], 1.22);
  assert.equal(gapsFor(p, 'all', 'target').aisle, 1.2);
});
