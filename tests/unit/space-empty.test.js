// GT-EMPTY(로드맵 6.5, C10): 빈 랙·빈 로케이션 제외 규칙(D-073). 가상 데이터(운영 Excel 아님).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { excelRowMetrics, spaceMetrics, purposeCompare } from '../../src/metrics/space.js';
import { rackDeltaMap, rackChangeList } from '../../src/metrics/delta.js';
import { summaryCompare } from '../../src/excel/summary-compare.js';
import { syntheticEmpty } from './helpers/space-synthetic.js';

const pct = (v) => (v * 100).toFixed(2);
const layoutOf = ({ racks }) => ({
  warehouse: { width: 20, height: 12, ceiling: 2.7 },
  objects: racks.map((r, i) => ({ id: `R-${r.col}${r.no}`, kind: 'rack', code: `${r.col}${r.no}`, x: (i % 10) * 1.8, y: Math.floor(i / 10) * 1.6, width: r.w / 1000, depth: r.d / 1000, rotation: 0, height: 2, excel: { key: `7F-${r.col}-${r.no}`, shelves: [{ level: 1, items: r.rows }] } })),
});
const project = () => ({ scenarios: { before: layoutOf(syntheticEmpty({ before: true })), after: layoutOf(syntheticEmpty()) }, scenarioMeta: { before: {}, after: {} } });

test('GT-EMPTY 앱 지표: 평균 용적률 84.81%(빈 랙 12대 제외) · 80% 미만 33 / 343 · 빈 랙 12 · 랙 56', () => {
  const m = spaceMetrics(layoutOf(syntheticEmpty()));
  assert.equal(pct(m.avgVolume), '84.81');
  assert.equal(m.volumeRacks, 44);
  assert.equal(m.lowLocations, 33);
  assert.equal(m.locations, 343);
  assert.equal(m.emptyLocations, 87);
  assert.equal(m.emptyRacks, 12);
  assert.equal(m.racks, 56);
  const emptyArea = m.perRack.filter((x) => x.empty).reduce((a, x) => { const o = layoutOf(syntheticEmpty()).objects.find((y) => y.id === x.id); return a + o.width * o.depth; }, 0);
  assert.ok(Math.abs(emptyArea - 9.5064) < 1e-9, `빈 랙 면적 ${emptyArea}`);
});

test('GT-EMPTY Excel 행 복제: F4가 AVERAGEIF(>0)면 84.81%, AVERAGE면 빈 랙 포함 평균 · COUNTIF는 빈 로케이션도 셈', () => {
  const { rows } = syntheticEmpty();
  const ifm = excelRowMetrics(rows, { averageIf: true }), plain = excelRowMetrics(rows);
  assert.equal(pct(ifm.avgVolume), '84.81');
  assert.ok(Math.abs(plain.avgVolume - (ifm.avgVolume * 44) / 56) < 1e-12);
  assert.equal(ifm.rackCount, 56);
  assert.equal(ifm.lowLocations, 33 + 87, 'Excel COUNTIF(<80%)는 표의 모든 행');
  const res = summaryCompare({ avgVolume: ifm.avgVolume, rackCount: 56, f4AverageIf: true }, rows);
  assert.equal(res.differs, 0);
  assert.deepEqual(res.empty, { racks: 12, locations: 87 });
});

test('품목코드 열이 없는 자료는 빈 로케이션을 빼지 않는다(기존 자료 호환)', () => {
  const { racks } = syntheticEmpty();
  for (const r of racks) for (const x of r.rows) delete x.itemCode;
  const m = spaceMetrics(layoutOf({ racks }));
  assert.equal(m.locations, 430);
  assert.equal(m.emptyLocations, 0);
  assert.equal(pct(m.avgVolume), '84.81', '빈 랙(R = 0) 제외는 품목코드와 무관');
});

test('GT-EMPTY Δ 지도: 비운 랙 12대는 비움(이전 완료) · 빨간 빗금(악화) 0건 · 변화 목록 비움 필터', () => {
  const p = project(), m = rackDeltaMap(p);
  assert.equal(m.counts.emptied, 12);
  assert.equal(m.counts.worse, 0);
  assert.equal(m.counts.up20 + m.counts.up40, 44);
  const list = rackChangeList(p, { filter: 'emptied' });
  assert.equal(list.length, 12);
  assert.ok(list.every((r) => r.group === 'emptied' && /^[IJK]\d$/.test(r.code)));
  const rows = purposeCompare(p), by = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(by.M3.after, '84.8%');
  assert.equal(by.M4.after, '33 / 343');
  assert.equal(by.M8.after, '12');
  assert.equal(by.M8.before, '0');
});

test('F4 수식이 AVERAGEIF면 excelSummary.f4AverageIf = true, AVERAGE면 키 없음(가상 Summary 예제)', async () => {
  const fs = await import('node:fs');
  const { readWorkbook, sheetMatrix } = await import('../../src/excel/xlsx.js');
  const { analyzeSheet, detectHeaderRow, autoMap } = await import('../../src/excel/analyze.js');
  const buf = fs.readFileSync(new URL('../../fixtures/excel/synthetic-summary.xlsx', import.meta.url));
  const book = await readWorkbook('synthetic-summary.xlsx', buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const name = book.sheetNames.find((n) => book.sheets[n].formulas?.has('F4'));
  const sheet = book.sheets[name], matrix = sheetMatrix(sheet), headerRow1 = detectHeaderRow(matrix), mapping = autoMap(matrix, headerRow1);
  const run = (text) => analyzeSheet({ matrix, headerRow1, mapping, cell: (a) => sheet.cells.get(a), formula: (a) => sheet.formulas.has(a), formulaText: (a) => (a === 'F4' && text ? text : sheet.formulas.get(a) ?? ''), tableRef: sheet.tableRef });
  assert.equal('f4AverageIf' in run(null).excelSummary, false, '예제 F4 = AVERAGE(...)');
  assert.equal(run('IFERROR(AVERAGEIF(Table1[랙 용적률(%)],">0"),"0")').excelSummary.f4AverageIf, true);
});
