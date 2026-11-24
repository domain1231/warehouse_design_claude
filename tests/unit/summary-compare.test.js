// C7: Excel Summary 대조(순수 함수). 가상 자료만 사용.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summaryCompare, causeCsvTable, tableDataRows } from '../../src/excel/summary-compare.js';
import { excelRowMetrics } from '../../src/metrics/space.js';

const R = (location, sh, mh, sourceRow) => ({ sourceRow, location, shelfHeight: sh, materialHeight: mh, rackWidth: 1000, rackDepth: 1000, rackHeight: 2000 });
const rows = [R('7F-A-1-1-1', 400, 200, 9), R('7F-A-1-2-1', 400, 400, 10), R('7F-A-2-1-1', 400, 100, 11)];
const F = { D4: true, E4: true, F4: true, G4: true, H4: true };
const summaryOf = (rs, o = {}) => {
  const m = excelRowMetrics(rs, { totalArea: 20, ceilingMm: 4000 });
  return { totalArea: 20, areaUse: m.areaUse, aisleShare: m.aisleShareExcel, avgVolume: m.avgVolume, rackCount: m.rackCount, idleRacks: m.idleRacks, lowLocations: null, formulas: F, tableRef: null, ...o };
};

test('Summary가 행 계산과 같으면 differs 0, 원인 없음', () => {
  const r = summaryCompare(summaryOf(rows), rows, { ceilingMm: 4000 });
  assert.equal(r.differs, 0);
  assert.deepEqual(r.causes, []);
  assert.deepEqual(r.rows.map((x) => x.id), ['F4', 'D4', 'E4', 'G4', 'H4']);
});

test('형식 밖·자재높이>단 높이·표 밖·직접 입력·단 높이 0 원인을 감지한다', () => {
  const rs = [...rows, R('Buffer Rack', 400, 100, 12), R('7F-B-1-1-1', 400, 600, 13), R('7F-B-2-1-1', 0, 100, 14)];
  const s = summaryOf(rows, { tableRef: 'A8:T12', formulas: { ...F, G4: false } });
  const r = summaryCompare(s, rs, { ceilingMm: 4000 });
  assert.ok(r.differs > 0);
  const id = (k) => r.causes.find((c) => c.id === k);
  assert.equal(id('outOfFormat').count, 1);
  assert.equal(id('outOfFormat').sample, 'Buffer Rack');
  assert.equal(id('materialOver').sample, '7F-B-1-1-1');
  assert.equal(id('zeroShelf').count, 1);
  assert.equal(id('outOfTable').count, 2);
  assert.equal(id('directInput').sample, 'G4');
  assert.equal(r.causes.some((c) => c.id === 'unknown'), false);
  assert.equal(causeCsvTable(r)[0].join(), '원인,로케이션,단 높이,자재높이,용적률');
  assert.ok(causeCsvTable(r).length > 4);
});

test('원인을 찾지 못한 차이는 그 밖의 차이로 표시', () => {
  const r = summaryCompare(summaryOf(rows, { avgVolume: 0.9 }), rows, { ceilingMm: 4000 });
  assert.equal(r.differs, 1);
  assert.deepEqual(r.causes.map((c) => c.id), ['unknown']);
});

test('허용오차 경계: 비율 0.0005 미만은 같음, 이상은 다름, 개수는 정확히', () => {
  const base = summaryOf(rows), app = excelRowMetrics(rows, { totalArea: 20 }).avgVolume;
  assert.equal(summaryCompare({ ...base, avgVolume: app + 0.0004 }, rows).rows.find((x) => x.id === 'F4').same, true);
  assert.equal(summaryCompare({ ...base, avgVolume: app + 0.0006 }, rows).rows.find((x) => x.id === 'F4').same, false);
  assert.equal(summaryCompare({ ...base, rackCount: base.rackCount + 1 }, rows).rows.find((x) => x.id === 'G4').same, false);
});

test('천장 높이가 없으면 H4는 비교하지 않는다', () => {
  const r = summaryCompare(summaryOf(rows), rows);
  assert.equal(r.rows.some((x) => x.id === 'H4'), false);
  assert.equal(r.differs, 0);
});

test('표 범위 해석', () => {
  assert.deepEqual(tableDataRows('B8:U351'), { first: 9, last: 351 });
  assert.equal(tableDataRows(null), null);
});

test('Q 수식이 단 높이가 아닌 열로 나누면 q-divisor 원인이 맨 앞에 온다', () => {
  const s = summaryOf(rows, { avgVolume: 0.9, qDivisor: { column: 'H', header: 'MAX Stock', rows: 5 } });
  const r = summaryCompare(s, rows, { ceilingMm: 4000 });
  assert.equal(r.causes[0].id, 'q-divisor');
  assert.match(r.causes[0].text, /단 높이 열\(Rack 단 높이 \(mm\)\)이 아닌 H열\(MAX Stock\)로 나눔 5행/);
  assert.equal(r.causes.some((c) => c.id === 'unknown'), false);
  const ok = summaryCompare({ ...s, qDivisor: { column: 'O', header: 'Rack 단 높이 (mm)', rows: 5 } }, rows, { ceilingMm: 4000 });
  assert.equal(ok.causes.some((c) => c.id === 'q-divisor'), false);
});
