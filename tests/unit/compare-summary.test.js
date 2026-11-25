// D1(D-078): 비교 지표 방향 메타데이터·추세 판정·결론 문장. 가상 데이터.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { METRIC_DIRECTION, metricTrend, purposeCompare, compareSummary, HEADLINE_PRIORITY } from '../../src/metrics/space.js';
import { syntheticEmpty } from './helpers/space-synthetic.js';

const layoutOf = ({ racks }) => ({
  warehouse: { width: 20, height: 12, ceiling: 2.7 },
  objects: racks.map((r, i) => ({ id: `R-${r.col}${r.no}`, kind: 'rack', code: `${r.col}${r.no}`, x: (i % 10) * 1.8, y: Math.floor(i / 10) * 1.6, width: r.w / 1000, depth: r.d / 1000, rotation: 0, height: 2, excel: { key: `7F-${r.col}-${r.no}`, shelves: [{ level: 1, items: r.rows }] } })),
});
const proj = (b, a) => ({ scenarios: { before: b, after: a }, scenarioMeta: { before: {}, after: {} } });

test('모든 비교 지표에 좋아지는 방향이 정의됨(누락 0) · 허용 값만', () => {
  const rows = purposeCompare(proj(layoutOf(syntheticEmpty({ before: true })), layoutOf(syntheticEmpty())));
  const missing = rows.filter((r) => !['higher', 'lower', 'neutral'].includes(METRIC_DIRECTION[r.id]));
  assert.deepEqual(missing.map((r) => r.id), []);
  assert.deepEqual(Object.keys(METRIC_DIRECTION).sort(), rows.map((r) => r.id).sort(), '메타데이터에 없는 지표·남는 지표 없음');
  for (const r of rows) assert.equal(r.direction, METRIC_DIRECTION[r.id]);
  assert.equal(METRIC_DIRECTION.M6, 'neutral', '통로 비중은 사용자 결정 전까지 neutral(로드맵 7.3)');
  for (const id of HEADLINE_PRIORITY) assert.notEqual(METRIC_DIRECTION[id], 'neutral', `${id}: 결론 후보는 방향이 있어야 함`);
});

test('추세 판정: 방향 × 부호, 0은 변화 없음, neutral은 색 없음, 계산 불가는 none', () => {
  assert.equal(metricTrend('higher', 1.2), 'better');
  assert.equal(metricTrend('higher', -0.1), 'worse');
  assert.equal(metricTrend('lower', -185), 'better');
  assert.equal(metricTrend('lower', 3), 'worse');
  assert.equal(metricTrend('higher', 0), 'same');
  assert.equal(metricTrend('neutral', 5), 'neutral');
  assert.equal(metricTrend('neutral', 0), 'neutral');
  assert.equal(metricTrend('higher', null), 'none');
});

test('결론 문장(GT-EMPTY): 평균 용적률 → 빈 랙 → 보관 가능 공간 순, 최대 3개 · KPI 4개', () => {
  const p = proj(layoutOf(syntheticEmpty({ before: true })), layoutOf(syntheticEmpty()));
  const rows = purposeCompare(p), by = Object.fromEntries(rows.map((r) => [r.id, r]));
  const s = compareSummary(p, rows);
  assert.equal(s.headline, `평균 용적률 ${by.M3.delta}, 빈 랙 12대 확보, 보관 가능 공간 ${by.M12.delta}`);
  assert.match(s.headline, /^평균 용적률 \+\d+\.\d%p, 빈 랙 12대 확보, 보관 가능 공간 \+\d+\.\d%p$/);
  assert.equal(by.M3.trend, 'better');
  assert.equal(by.M8.trend, 'better');
  assert.deepEqual(s.kpis.map((k) => k.id), ['M3', 'M4', 'M8', 'M12']);
  assert.ok(s.kpis.every((k) => k.before && k.after && k.delta && k.trend));
});

test('악화 지표는 따로 경고 문장 · 개선이 없으면 그렇게 표시 · 변화 없음 · 기준 없음', () => {
  const be = layoutOf(syntheticEmpty({ before: true })), af = layoutOf(syntheticEmpty());
  const back = compareSummary(proj(af, be));
  assert.match(back.warning, /^주의: 평균 용적률 −\d+\.\d%p · 빈 랙 12대 감소/);
  const same = compareSummary(proj(be, structuredClone(be)));
  assert.equal(same.headline, '목적 지표 변화 없음');
  assert.equal(same.warning, null);
  const none = compareSummary(proj({ warehouse: be.warehouse, objects: [] }, af));
  assert.match(none.headline, /기준 도면이 없어/);
  assert.ok(purposeCompare(proj({ warehouse: be.warehouse, objects: [] }, af)).every((r) => r.trend === 'none'));
});

test('D4: 비교표용 짧은 값 — 공간 구성은 랙 비율, 보관 가능 합계는 %, 선반 여유는 m³ 2자리, 나머지는 원문', () => {
  const rows = purposeCompare(proj(layoutOf(syntheticEmpty({ before: true })), layoutOf(syntheticEmpty())));
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.match(by.M7.short.after, /^랙 \d+\.\d%$/);
  assert.match(by.M12.short.after, /^\d+\.\d%$/);
  assert.match(by.M13.short.after, /^\d+\.\d\dm³$/);
  assert.equal(by.M11.short.after, '통로 없음');
  for (const id of ['M3', 'M4', 'M8', 'M9', 'M6']) assert.deepEqual(by[id].short, { before: by[id].before, after: by[id].after });
  assert.ok(rows.every((r) => `${r.short.before} → ${r.short.after}`.length <= 32), '한 줄 길이');
});
