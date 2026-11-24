// Track C 골든 테스트(로드맵 6.5) — 706호 Summary 기준값을 재현하는 익명화 가상 데이터셋.
// 운영 Excel은 저장소에 넣지 않는다. 아래 데이터는 랙 56개·로케이션 343개 구조와 Summary 값만 맞춘 가상 값이며,
// 실제 업무 Excel(706호BE)로 같은 모듈을 돌린 결과가 Summary(F4·D4·E4·G4·H4·C열)와 일치함은 로컬에서 확인했다(커밋하지 않음).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { excelRowMetrics, spaceMetrics, rackPrefix, locationRatio } from '../../src/metrics/space.js';
import { synthetic } from './helpers/space-synthetic.js';

const BE = { F4: 0.5839318639455978, low: 305 }; // 706호BE Summary F4, C열
const AF = { F4: 0.84308, low: 47 }; // 706호AF(로드맵 6.5 기준값)
const TOTAL_AREA = 130.5, USED_AREA = 54.0436, CEILING_MM = 2700;

const pct = (v) => (v * 100).toFixed(2);

test('GT-M3-BE 평균 용적률 58.39% (F4 0.58393)', () => {
  const m = excelRowMetrics(synthetic(BE), { totalArea: TOTAL_AREA, ceilingMm: CEILING_MM });
  assert.equal(pct(m.avgVolume), '58.39');
  assert.ok(Math.abs(m.avgVolume - 0.58393) < 5e-6);
});

test('GT-M3-AF 평균 용적률 84.31% (F4 0.84308)', () => {
  const m = excelRowMetrics(synthetic(AF), { totalArea: TOTAL_AREA, ceilingMm: CEILING_MM });
  assert.equal(pct(m.avgVolume), '84.31');
  assert.ok(Math.abs(m.avgVolume - 0.84308) < 5e-6);
});

test('GT-M4 80% 미만 로케이션 305 / 47 (343행 중)', () => {
  const be = excelRowMetrics(synthetic(BE), {}), af = excelRowMetrics(synthetic(AF), {});
  assert.equal(be.locations, 343);
  assert.equal(be.lowLocations, 305);
  assert.equal(af.lowLocations, 47);
});

test('GT-M5 면적 사용률 41.41% (D4 0.41413, 총면적 ① 130.5㎡) · GT-M6 통로 비중 ① 58.59% · GT-RACK 랙 56 · 유휴 0', () => {
  const m = excelRowMetrics(synthetic(BE), { totalArea: TOTAL_AREA, ceilingMm: CEILING_MM });
  assert.ok(Math.abs(m.usedArea - USED_AREA) < 1e-9);
  assert.equal(pct(m.areaUse), '41.41');
  assert.ok(Math.abs(m.areaUse - 0.41413) < 5e-6);
  assert.equal(pct(m.aisleShareExcel), '58.59');
  assert.equal(m.rackCount, 56);
  assert.equal(m.idleRacks, 0);
  assert.equal(m.outOfFormat, 0);
});

test('GT-PREFIX 7F-A-1-*와 7F-A-10-*는 서로 다른 랙', () => {
  assert.equal(rackPrefix('7F-A-1-1-1'), '7F-A-1-');
  assert.equal(rackPrefix('7F-A-10-1-1'), '7F-A-10-');
  assert.equal(rackPrefix('Buffer Rack'), null);
  const m = excelRowMetrics([
    { location: '7F-A-1-1-1', shelfHeight: 1000, materialHeight: 1000 },
    { location: '7F-A-1-2-1', shelfHeight: 1000, materialHeight: 0 },
    { location: '7F-A-10-1-1', shelfHeight: 1000, materialHeight: 200 },
  ]);
  assert.equal(m.rackCount, 2);
  assert.deepEqual(m.racks.map((g) => [g.prefix, g.r]), [['7F-A-1-', 0.5], ['7F-A-10-', 0.2]]);
  assert.ok(Math.abs(m.avgVolume - 0.35) < 1e-12);
});

test('M1 Excel 규칙: 분모 0·빈칸·문자는 0, 형식 밖 로케이션은 랙 1개로 세되 평균에서 뺀다', () => {
  assert.equal(locationRatio(0, 500), 0);
  assert.equal(locationRatio(1000, null), 0);
  assert.equal(locationRatio('1000', '250'), 0.25);
  assert.equal(locationRatio(1000, 'x'), 0);
  const m = excelRowMetrics([{ location: '7F-A-1-1-1', shelfHeight: 1000, materialHeight: 500 }, { location: 'Buffer Rack', shelfHeight: 1000, materialHeight: 900, rackWidth: 2000, rackDepth: 1000 }], { totalArea: 10 });
  assert.equal(m.rackCount, 2);
  assert.equal(m.outOfFormat, 1);
  assert.equal(m.avgVolume, 0.5);
  assert.equal(m.usedArea, 2);
});

// ── 배치(시나리오) 기준 ──
const rackObj = (id, x, y, rows, extra = {}) => ({ id, kind: 'rack', code: id, x, y, width: 1, depth: 1, rotation: 0, height: 2, excel: rows ? { key: id, shelves: [{ level: 1, items: rows }] } : undefined, ...extra });
const box = (id, kind, x, y, width, depth) => ({ id, kind, x, y, width, depth, rotation: 0 });

test('GT-M7 공간 구성 4분해 합계 100.00% ± 0.01, 겹침은 랙 > 보관 불가 > 통로 순서로 한 번만', () => {
  const layout = {
    warehouse: { width: 10, height: 5, ceiling: 2.7 },
    objects: [
      rackObj('R1', 0, 0, null), rackObj('R2', 0.5, 0, null), // 랙끼리 0.5㎡ 겹침
      box('C1', 'column', 0.8, 0.5, 1, 1), // 랙과 겹침
      box('A1', 'aisle', 0, 1, 10, 1), // 기둥과 겹침
      box('B1', 'blocked', 9, 4, 2, 2), // 창고 밖으로 1㎡ 넘어감(안쪽만)
    ],
  };
  const m = spaceMetrics(layout);
  const c = m.composition, sum = c.rack.share + c.unavailable.share + c.aisle.share + c.remaining.share;
  assert.ok(Math.abs(sum - 1) < 1e-4, `합계 ${sum}`);
  assert.ok(Math.abs(c.rack.area - 1.5) < 1e-9, '랙 2개 겹침 제외 1.5㎡');
  assert.ok(Math.abs(c.unavailable.area - (0.65 + 1)) < 1e-9, '기둥 1㎡ 중 랙과 겹친 0.7×0.5㎡ 제외 + 보관 금지 창고 안쪽 1㎡');
  assert.ok(Math.abs(c.aisle.area - (10 - 1 * 0.5)) < 1e-9, '통로 10㎡ 중 기둥과 겹친 1×0.5㎡ 제외(랙과는 맞닿기만 함)');
});

test('배치 기준 지표: 연결 랙 용적률은 행 기준과 같고, 총면적 기준(①/②)·빈 랙·저활용·미연결·유휴를 센다', () => {
  const rows = synthetic(BE);
  const byRack = new Map();
  for (const r of rows) { const p = rackPrefix(r.location); if (!byRack.has(p)) byRack.set(p, []); byRack.get(p).push(r); }
  const objects = [...byRack.values()].map((rs, i) => rackObj('R' + i, (i % 10) * 1.2, Math.floor(i / 10) * 1.2, rs));
  objects.push(rackObj('EMPTY', 12, 0, [{ location: '7F-Z-1-1-1', shelfHeight: 1000, materialHeight: 0 }]));
  objects.push(rackObj('MANUAL', 12, 2, null));
  objects.push(rackObj('LOW', 12, 4, [{ location: '7F-Z-2-1-1', shelfHeight: 1000, materialHeight: 300, rackHeight: 1500 }]));
  const layout = { warehouse: { width: 20, height: 10, ceiling: 2.7 }, objects };
  const ref = excelRowMetrics(rows, {});
  const a = spaceMetrics(layout, { referenceArea: 130.5 });
  const linkedSynthetic = [...a.perRack].filter((x) => x.id.startsWith('R'));
  const avg = linkedSynthetic.reduce((s, x) => s + x.r, 0) / linkedSynthetic.length;
  assert.ok(Math.abs(avg - ref.avgVolume) < 1e-12, '랙 객체별 R 평균 = Excel 행 기준 F4');
  assert.equal(a.areaBasis, 'excel');
  assert.equal(a.totalArea, 130.5);
  assert.equal(a.racks, 59);
  assert.ok(a.usedArea > a.linkedUsedArea, '미연결 랙 면적은 Excel 범위(areaUseLinked)에서 빠진다');
  assert.ok(Math.abs(a.areaUseLinked - a.linkedUsedArea / 130.5) < 1e-12);
  assert.equal(a.unlinkedRacks, 1);
  assert.equal(a.unknownRacks, 1);
  assert.equal(a.emptyRacks, 1, '자재높이가 모두 0인 연결 랙');
  assert.equal(a.lowRacks, a.perRack.filter((x) => !x.empty && x.r < 0.5).length);
  assert.ok(a.lowRacks >= 1, 'LOW 랙(R=0.3) 포함');
  assert.equal(a.idleRacks, 1, '천장 2700 − 랙 1500 − 500 = 700 > 500');
  const b = spaceMetrics(layout);
  assert.equal(b.areaBasis, 'drawing');
  assert.equal(b.totalArea, 200);
  assert.ok(Math.abs(b.aisleShare.excel - (1 - b.areaUse)) < 1e-12);
  assert.equal(spaceMetrics({ ...layout, warehouse: { width: 20, height: 10, ceiling: null } }).idleRacks, null, '천장 높이가 없으면 유휴 랙은 미확인');
});
