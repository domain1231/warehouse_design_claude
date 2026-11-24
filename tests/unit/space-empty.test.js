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

// ── C8(D-074): 공간 구성 5분해 · M12 보관 가능 합계 · M13 선반 여유 용적 ──
import { shelfFreeVolume } from '../../src/metrics/space.js';

test('GT-M7(개정) 5분해 합계 100.00% ± 0.01, 빈 랙 면적 = 빈 랙 footprint 합 9.5064㎡ · M12 = 빈 랙 + 잔여', () => {
  const l = layoutOf(syntheticEmpty());
  l.objects.push({ id: 'C1', kind: 'column', x: 0.5, y: 0.5, width: 1, depth: 1, rotation: 0 }, { id: 'A1', kind: 'aisle', x: 0, y: 11, width: 20, depth: 1, rotation: 0 });
  const m = spaceMetrics(l), c = m.composition;
  const sum = ['rack', 'emptyRack', 'unavailable', 'aisle', 'remaining'].reduce((a, k) => a + c[k].share, 0);
  assert.ok(Math.abs(sum - 1) < 1e-4, `합계 ${sum}`);
  assert.ok(Math.abs(c.emptyRack.area - 9.5064) < 1e-9, `빈 랙 ${c.emptyRack.area}`);
  assert.ok(Math.abs(c.rack.area - 44) < 1e-9, '적치 랙 44 × 1㎡');
  assert.ok(Math.abs(c.unavailable.area - 0.75) < 1e-9, '기둥 1㎡ 중 랙과 겹친 0.5×0.5㎡ 제외');
  assert.ok(Math.abs(m.storable.area - (c.emptyRack.area + c.remaining.area)) < 1e-12);
  assert.ok(Math.abs(m.storable.share - m.storable.area / 240) < 1e-12);
});

test('빈 랙과 적치 랙이 겹치면 적치 랙이 우선(빈 랙은 겹치지 않은 부분만)', () => {
  const rk = (id, x, mh) => ({ id, kind: 'rack', code: id, x, y: 0, width: 2, depth: 1, rotation: 0, height: 2, excel: { key: id, shelves: [{ level: 1, items: [{ location: `7F-A-${id}-1-1`, itemCode: mh ? 'P' : '', shelfHeight: 1000, materialHeight: mh }] }] } });
  const c = spaceMetrics({ warehouse: { width: 10, height: 5 }, objects: [rk('1', 0, 500), rk('2', 1, 0)] }).composition;
  assert.ok(Math.abs(c.rack.area - 2) < 1e-9);
  assert.ok(Math.abs(c.emptyRack.area - 1) < 1e-9);
});

test('M13 선반 여유 용적: (단 높이 − 선반 최대 자재높이) × 가로 × 세로, 빈 선반은 단 높이 전체, 초과는 0', () => {
  const o = { width: 2, depth: 0.5, excel: { shelves: [
    { level: 1, items: [{ shelfHeight: 1000, materialHeight: 300 }, { shelfHeight: 1000, materialHeight: 600 }] }, // 여유 0.4m
    { level: 2, items: [{ shelfHeight: 800, materialHeight: 0 }] }, // 빈 선반 0.8m
    { level: 3, items: [{ shelfHeight: 500, materialHeight: 700 }] }, // 초과 → 0
  ] } };
  const r = shelfFreeVolume([o]);
  assert.ok(Math.abs(r.free - (0.4 + 0.8) * 1) < 1e-12);
  assert.ok(Math.abs(r.total - (1 + 0.8 + 0.5) * 1) < 1e-12);
  assert.ok(Math.abs(r.share - 1.2 / 2.3) < 1e-12);
  assert.deepEqual(shelfFreeVolume([]), { free: 0, total: 0, share: null });
});

test('비교표에 보관 가능 합계·선반 여유 용적 행(GT-EMPTY: AFTER 빈 랙 12대만큼 보관 여유 증가)', () => {
  const by = Object.fromEntries(purposeCompare(project()).map((r) => [r.id, r]));
  assert.ok(by.M12 && by.M13);
  const b = spaceMetrics(project().scenarios.before), a = spaceMetrics(project().scenarios.after);
  assert.ok(Math.abs(a.storable.area - b.storable.area - 9.5064) < 1e-9, '비운 랙 면적만큼 보관 가능 합계 증가');
  assert.ok(Math.abs(a.shelfFree.total - b.shelfFree.total) < 1e-12, '선반 구성 같음');
  assert.equal(by.M13.after, `${a.shelfFree.free.toFixed(2)}m³ (${(a.shelfFree.share * 100).toFixed(1)}%)`);
  assert.match(by.M12.delta, /^\+\d+\.\d%p$/);
  assert.match(by.M13.delta, /^[+−]\d+\.\d\dm³$/);
  assert.match(by.M7.after, /빈 랙 \d+\.\d%/);
});
