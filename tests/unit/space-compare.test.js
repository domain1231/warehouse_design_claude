import { test } from 'node:test';
import assert from 'node:assert/strict';
import { purposeCompare, rackPrefix } from '../../src/metrics/space.js';
import { rackDiff, layoutChangeSummary } from '../../src/warehouse/scenarios.js';
import { synthetic } from './helpers/space-synthetic.js';

const rackObj = (id, x, y, rows) => ({ id, kind: 'rack', code: id, x, y, width: 1, depth: 1, rotation: 0, height: 2, excel: { key: id, shelves: [{ level: 1, items: rows }] } });
const layout = (rows) => {
  const by = new Map();
  for (const r of rows) { const p = rackPrefix(r.location); if (!by.has(p)) by.set(p, []); by.get(p).push(r); }
  return { warehouse: { width: 20, height: 10, ceiling: 2.7 }, objects: [...by.values()].map((rs, i) => rackObj('R' + i, (i % 10) * 1.2, Math.floor(i / 10) * 1.2, rs)) };
};
const meta = { sourceInfo: { referenceArea: 130.5 } };
const project = () => ({ scenarios: { before: layout(synthetic({ F4: 0.5839318639455978, low: 305 })), after: layout(synthetic({ F4: 0.84308, low: 47 })) }, scenarioMeta: { before: meta, after: meta } });

test('purposeCompare: 순서·값·차이·설명', () => {
  const r = purposeCompare(project());
  assert.deepEqual(r.map((x) => x.id), ['M3', 'M4', 'M8', 'M9', 'M6', 'M7', 'M11']);
  assert.deepEqual([r[0].before, r[0].after, r[0].delta], ['58.4%', '84.3%', '+25.9%p']);
  assert.deepEqual([r[1].before, r[1].after, r[1].delta], ['305 / 343', '47 / 343', '−258']);
  for (const x of r) assert.ok(x.tip);
});

test('purposeCompare: BEFORE 비면 차이는 기준 없음', () => {
  const p = project();
  p.scenarios.before.objects = [];
  assert.ok(purposeCompare(p).every((x) => x.delta === '기준 없음'));
});

test('layoutChangeSummary: 변경 없음 → 빈 문자열, 이동·제거 집계', () => {
  const p = project();
  assert.equal(layoutChangeSummary(rackDiff(p.scenarios.before, structuredClone(p.scenarios.before))), '');
  const a = structuredClone(p.scenarios.before);
  a.objects[0].x += 3;
  a.objects.pop();
  const s = layoutChangeSummary(rackDiff(p.scenarios.before, a));
  assert.match(s, /이동 1/);
  assert.match(s, /제거 1/);
});

test('purposeCompare: AFTER 비면 AFTER 칸은 배치 없음, 차이는 —', () => {
  const p = project();
  p.scenarios.after.objects = [];
  for (const x of purposeCompare(p)) { assert.equal(x.after, '배치 없음'); assert.equal(x.delta, '—'); assert.notEqual(x.before, '배치 없음'); }
});

test('purposeCompare: BEFORE 비면 BEFORE 칸 배치 없음', () => {
  const p = project();
  p.scenarios.before.objects = [];
  for (const x of purposeCompare(p)) { assert.equal(x.before, '배치 없음'); assert.equal(x.delta, '기준 없음'); }
});
