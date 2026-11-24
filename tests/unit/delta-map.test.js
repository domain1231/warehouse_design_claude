import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rackDeltaMap, DELTA_BINS } from '../../src/metrics/delta.js';

const rack = (id, r) => ({ id, kind: 'rack', code: id, x: 0, y: 0, width: 1, depth: 1, rotation: 0, height: 2, excel: { key: id, building: 'B', shelves: [{ level: 1, items: r === null ? [] : [{ location: id + '-1-1-1', shelfHeight: 1000, materialHeight: r * 1000, rackWidth: 1000, rackDepth: 1000, rackHeight: 2000 }] }] } });
const lay = (racks) => ({ warehouse: { width: 20, height: 10, ceiling: 2.7 }, objects: racks });
const proj = (b, a) => ({ scenarios: { before: lay(b), after: lay(a) }, scenarioMeta: { before: {}, after: {} } });
const bin = (rB, rA) => rackDeltaMap(proj([rack('a', rB)], [rack('a', rA)])).racks[0];

test('경계값 구간', () => {
  // [BEFORE R, AFTER R, 기대 bin]
  for (const [b, a, e] of [[0.5, 0.9, 'up40'], [0.5, 0.899, 'up20'], [0.5, 0.7, 'up20'], [0.5, 0.51, 'up1'], [0.5, 0.509, 'same'], [0.5, 0.491, 'same'], [0.5, 0.49, 'worse']]) {
    assert.equal(bin(b, a).bin, e, `${b}→${a}`);
  }
  assert.equal(bin(0.5, 0.899).delta, 39.9);
});

test('신규·미확인·제거·합계', () => {
  const m = rackDeltaMap(proj([rack('a', 0.5), rack('b', 0.5), rack('gone', 0.5)], [rack('a', 0.5), rack('b', null), rack('n', 0.8)]));
  const by = Object.fromEntries(m.racks.map((r) => [r.id, r]));
  assert.equal(by.n.bin, 'new');
  assert.equal(by.n.delta, null);
  assert.equal(by.b.bin, 'unknown');
  assert.equal(by.a.bin, 'same');
  assert.deepEqual(m.removed, [{ id: 'gone', code: 'gone' }]);
  assert.equal(Object.values(m.counts).reduce((x, y) => x + y, 0), 3);
  assert.ok(m.ready);
  assert.equal(rackDeltaMap(proj([], [rack('a', 0.5)])).ready, false);
});

test('이동 유형', () => {
  const a = rack('a', 0.5);
  a.x = 3;
  assert.deepEqual(rackDeltaMap(proj([rack('a', 0.5)], [a])).racks[0].types, ['moved']);
});

const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (x, y) => (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);

test('색상 명도: 개선 단계는 명도 순, 악화는 해치 병행', () => {
  const B = Object.fromEntries(DELTA_BINS.map((b) => [b.id, b]));
  const L = Object.fromEntries(DELTA_BINS.map((b) => [b.id, lum(b.color)]));
  console.log('luminance', JSON.stringify(L), 'u40/u20', ratio(L.up40, L.up20).toFixed(2), 'u20/u1', ratio(L.up20, L.up1).toFixed(2), 'worse/u20', ratio(L.worse, L.up20).toFixed(2));
  assert.ok(L.up40 > L.up20 && L.up20 > L.up1);
  assert.ok(ratio(L.up40, L.up20) >= 1.5);
  assert.ok(ratio(L.up20, L.up1) >= 1.5);
  assert.ok(ratio(L.worse, L.up20) >= 1.2 || B.worse.pattern === 'hatch');
  assert.equal(B.worse.pattern, 'hatch');
});
