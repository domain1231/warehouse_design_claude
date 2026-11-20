import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pairUnits, linesOf, evaluateShape, recommend, targetsFor } from '../../src/autolayout/fixed-columns.js';

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

test('evaluateShape(한 줄 1열): 통로 최대 폭·목표 충족·길이', () => {
  const ev = evaluateShape(profile, { ...opt, perLine: 1, pairing: 'all' });
  assert.equal(ev.aMax, 0.703);
  assert.equal(ev.meetsTarget, false);
  const pr = evaluateShape(profile, { ...opt, perLine: 1, pairing: 'pairs' });
  assert.equal(pr.aMax, 1.22);
  assert.equal(pr.meetsTarget, true);
  assert.equal(ev.lengthOK, true);
  const q = evaluateShape(profile, { ...opt, spanS: 7, perLine: 1, pairing: 'all' });
  assert.equal(q.lengthOK, false);
  assert.ok(q.tooLong.includes('C3'));
});

const sh = { spanE: 18.44, spanS: 8.5, wallGap: 0.1, aisleTarget: 1.2, backGap: 0.1, perLine: 1, pairing: 'all' };

test('linesOf: perLine 2 묶음', () => {
  const l = linesOf(profile, 2);
  assert.equal(l.length, 7);
  assert.equal(l[0].m, 2);
  assert.equal(l[0].thickness, 1.2);
  assert.equal(l[0].sumL, 12);
});

test('evaluateShape: 열 배치 1열', () => {
  assert.equal(evaluateShape(profile, sh).aMax, 0.703);
  const p = evaluateShape(profile, { ...sh, pairing: 'pairs' });
  assert.equal(p.aMax, 1.22);
  assert.equal(p.meetsTarget, true);
  assert.equal(evaluateShape(profile, { ...sh, perLine: 2 }).lengthOK, false);
});

test('evaluateShape: 행 배치처럼 가로가 짧은 경우 2열', () => {
  const ev = evaluateShape(profile, { ...sh, spanE: 8.5, spanS: 18.44, perLine: 2 });
  assert.equal(ev.lines.length, 7);
  assert.equal(ev.lengthOK, true);
  assert.equal(ev.fits, true);
  const sumT = ev.lines.reduce((s, l) => s + l.thickness, 0);
  const aE = (8.5 - 0.2 - sumT) / 6;
  const aS = Math.min(...ev.lines.filter((l) => l.m > 1).map((l) => (18.44 - 0.2 - l.sumL) / (l.m - 1)));
  assert.equal(ev.aMax, Math.floor(Math.min(aE, aS) * 1000 + 1e-6) / 1000);
});

test('recommend', () => {
  const s = (name, aMax, meetsTarget, fits) => ({ name, ev: { aMax, meetsTarget, fits } });
  assert.equal(recommend([s('a', 2, false, true), s('b', 1.3, true, true), s('c', 1.5, true, true)]).name, 'c');
  assert.equal(recommend([s('a', 0.5, false, true), s('b', 0.9, false, true), s('c', 2, false, false)]).name, 'b');
});

test('targetsFor', () => {
  const ev = evaluateShape(profile, sh);
  const t = targetsFor(ev, { aisle: 0.5, wallGap: 0.1, loE: 0, loS: 0, hiS: 8.5, lineFirst: (k) => (k % 2 ? 'south' : 'north') });
  assert.deepEqual(t.C0, { first: 'north', e: 0.1, sMin: 0.1 });
  assert.equal(t.C1.first, 'south');
  assert.equal(t.C1.sMax, 8.4);
  assert.ok(Math.abs(t.C1.e - (0.1 + 1.2 + 0.5)) < 1e-9);
});
