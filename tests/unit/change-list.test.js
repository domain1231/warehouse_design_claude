import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rackChangeList, changeListCsvRows, CHANGE_TYPE_NAMES } from '../../src/metrics/delta.js';

const item = (id, i, r) => ({ location: `${id}-1-1-${i}`, shelfHeight: 1000, materialHeight: r * 1000, rackWidth: 1000, rackDepth: 1000, rackHeight: 2000 });
const rack = (id, r, n = 1) => ({ id, kind: 'rack', code: id, x: 0, y: 0, width: 1, depth: 1, rotation: 0, height: 2, excel: { key: id, building: 'B', shelves: [{ level: 1, items: r === null ? [] : Array.from({ length: n }, (_, i) => item(id, i + 1, r)) }] } });
const lay = (racks) => ({ warehouse: { width: 20, height: 10, ceiling: 2.7 }, objects: racks });
const mv = (o) => ({ ...o, x: 3 });
const P = () => ({
  scenarios: {
    before: lay([rack('r1', 0.5), rack('r2', 0.5), rack('r3', 0.5), rack('r4', 0.5), rack('r5', 0.5, 2), rack('r6', 0.5), rack('r7', 0.5), rack('gone', 0.5, 3)]),
    after: lay([rack('r1', 0.95), rack('r2', 0.75), rack('r3', 0.55), rack('r4', 0.505), mv(rack('r5', 0.4, 2)), rack('r6', null), rack('r7', 0.5), rack('nw', 0.8)]),
  }, scenarioMeta: { before: {}, after: {} },
});
const ids = (o) => rackChangeList(P(), o).map((r) => r.id);

test('기본 정렬: Δ 큰 순, null은 뒤', () => {
  const l = rackChangeList(P());
  assert.deepEqual(l.slice(0, 6).map((r) => r.delta), [45, 25, 5, 0.5, 0, -10]);
  assert.deepEqual(ids().slice(0, 6), ['r1', 'r2', 'r3', 'r4', 'r7', 'r5']);
  assert.deepEqual(l.slice(6).map((r) => r.delta), [null, null, null]);
  assert.equal(l.length, 9);
});
test('delta-asc·code 정렬', () => {
  assert.equal(ids({ sort: 'delta-asc' })[0], 'r5');
  assert.deepEqual(ids({ sort: 'code' }), ['gone', 'nw', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7']);
});
test('필터', () => {
  assert.deepEqual(ids({ filter: 'better' }), ['r1', 'r2', 'r3']);
  assert.deepEqual(ids({ filter: 'worse' }), ['r5']);
  assert.deepEqual(ids({ filter: 'same' }), ['r4', 'r7']);
  assert.deepEqual(ids({ filter: 'other' }).sort(), ['gone', 'nw', 'r6']);
});
test('로케이션 수·제거·신규', () => {
  const by = Object.fromEntries(rackChangeList(P()).map((r) => [r.id, r]));
  assert.equal(by.r5.locB, 2); assert.equal(by.r5.locA, 2);
  assert.equal(by.r6.locA, 0);
  assert.equal(by.nw.locB, null); assert.equal(by.nw.locA, 1);
  assert.deepEqual([by.gone.bin, by.gone.group, by.gone.rA, by.gone.types, by.gone.locB, by.gone.locA], ['removed', 'other', null, ['removed'], 3, null]);
  assert.deepEqual(by.nw.types, ['added']);
  assert.deepEqual(by.r5.types, ['moved']);
  assert.equal(CHANGE_TYPE_NAMES.moved, '이동');
});
test('CSV 행', () => {
  const c = changeListCsvRows(rackChangeList(P(), { filter: 'worse' }));
  assert.deepEqual(c[0], ['랙', '로케이션 수 BEFORE', '로케이션 수 AFTER', 'BEFORE R %', 'AFTER R %', 'Δ %p', '구분', '배치 변경']);
  assert.deepEqual(c[1], ['r5', 2, 2, '50.0', '40.0', '−10.0', '악화', '이동']);
  assert.deepEqual(changeListCsvRows(rackChangeList(P(), { filter: 'other' })).find((r) => r[0] === 'gone'), ['gone', 3, '', '50.0', '', '', '기타', '제거']);
});
