// D2(D-078): Δ 지도 열 단위 요약 = 열 안 랙 용적률 R의 평균. 가상 데이터.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rackDeltaMap, columnDeltaMap, columnKeyOf } from '../../src/metrics/delta.js';
import { syntheticEmpty } from './helpers/space-synthetic.js';

const layoutOf = ({ racks }) => ({
  warehouse: { width: 20, height: 12, ceiling: 2.7 },
  objects: racks.map((r, i) => ({ id: `R-${r.col}${r.no}`, kind: 'rack', code: `${r.col}${r.no}`, x: (i % 10) * 1.8, y: Math.floor(i / 10) * 1.6, width: r.w / 1000, depth: r.d / 1000, rotation: 0, height: 2, excel: { key: `7F-${r.col}-${r.no}`, shelves: [{ level: 1, items: r.rows }] } })),
});
const project = () => ({ scenarios: { before: layoutOf(syntheticEmpty({ before: true })), after: layoutOf(syntheticEmpty()) }, scenarioMeta: { before: {}, after: {} } });

test('열 키: Excel 랙 키에서 마지막 랙 번호를 뺀 값, 미연결은 null', () => {
  assert.equal(columnKeyOf({ excel: { key: '7F-A-10' } }), '7F-A');
  assert.equal(columnKeyOf({ excel: { key: 'Buffer' } }), null);
  assert.equal(columnKeyOf({}), null);
});

test('열 단위 요약 값 = 그 열 랙 R 평균의 차이(0.1%p 반올림) · 전부 비운 열은 비움', () => {
  const p = project(), m = rackDeltaMap(p), cols = columnDeltaMap(p, m), by = new Map(m.racks.map((r) => [r.id, r]));
  assert.deepEqual(cols.map((c) => c.label), ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'I', 'J', 'K']);
  for (const c of cols) {
    const rs = c.rackIds.map((id) => by.get(id));
    const mean = (k) => rs.reduce((a, r) => a + r[k], 0) / rs.length;
    assert.ok(Math.abs(c.rB - mean('rB')) < 1e-12 && Math.abs(c.rA - mean('rA')) < 1e-12, c.key);
    assert.equal(c.delta, Math.round((mean('rA') - mean('rB')) * 1000) / 10);
  }
  for (const k of ['I', 'J', 'K']) assert.equal(cols.find((c) => c.label === k).bin, 'emptied');
  assert.equal(cols.find((c) => c.label === 'A').bin, 'up20');
  assert.equal(cols.reduce((a, c) => a + c.rackIds.length, 0), 56);
});

test('건물이 달라 열 이름이 겹치면 전체 키로 표시', () => {
  const p = project();
  p.scenarios.after.objects[0].excel.key = '8F-A-1';
  p.scenarios.before.objects[0].excel.key = '8F-A-1';
  const labels = columnDeltaMap(p).map((c) => c.label);
  assert.ok(labels.includes('7F-A') && labels.includes('8F-A'));
});
