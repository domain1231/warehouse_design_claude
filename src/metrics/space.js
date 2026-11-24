// Track C · C1: 공간 지표 단일 출처(로드맵 6.3 M1~M11). DOM 없음, 순수 함수.
// 용적률 계열(M1~M4·M10)은 업무 Excel(Space Optimization) 산식과 같게 계산한다.
//   Q(로케이션 용적률) = 자재높이 P ÷ 랙 단 높이 O, 분모가 0이거나 숫자가 아니면 0 (Excel IFERROR(P/O,0))
//   R(랙 용적률)      = 같은 랙 접두사(세 번째 '-'까지) 로케이션 Q의 평균
//   평균 용적률(F4)   = R의 산술평균. 접두사를 만들 수 없는 로케이션(예: 'Buffer Rack')은 Excel처럼 랙 1개로 세지만 평균에서는 뺀다.
// 면적·통로 계열(M5~M7)은 총면적 기준을 고를 수 있다: ① Excel 입력 순 바닥면적(기본) ② 도면 전체(가로×세로).
import { unionArea } from '../warehouse/metrics.js';
import { aisleReviewRows } from '../warehouse/aisles.js';
import { heightUtilization } from '../warehouse/appearance.js';

export const LOW_LOCATION_RATIO = 0.8; // M4 기준(Summary C열 '용적률 80% 미만')
export const LOW_RACK_RATIO = 0.5; // M9 기본 기준
export const IDLE_MARGIN_MM = 500; // M10: 천장 − 랙 높이 − 500 > 500
const UNAVAILABLE = ['wall', 'column', 'blocked', 'door'];
const AISLE = ['aisle', 'work'];

const num = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string' && v.trim() !== '') { const n = Number(v); return Number.isFinite(n) ? n : 0; }
  return 0; // 빈칸·null은 Excel 산술에서 0
};

/** M1 로케이션 용적률 Q = P ÷ O. 분모 0·오류는 0. */
export const locationRatio = (shelfHeightMm, materialHeightMm) => {
  const o = num(shelfHeightMm), p = num(materialHeightMm);
  return o !== 0 ? p / o : 0;
};

/** 랙 접두사: 세 번째 '-'까지 포함('7F-A-1-'). '-'가 3개 미만이면 null(Excel FIND 오류와 같은 경우). */
export function rackPrefix(location) {
  const s = String(location ?? '');
  let i = -1;
  for (let k = 0; k < 3; k++) { i = s.indexOf('-', i + 1); if (i < 0) return null; }
  return s.slice(0, i + 1);
}

/**
 * Excel 행 목록으로 용적률·면적 지표를 계산한다(Excel Summary와 같은 규칙).
 * @param rows [{ location, shelfHeight(O,mm), materialHeight(P,mm), rackWidth(L,mm), rackDepth(M,mm), rackHeight(N,mm) }]
 * @param opts { totalArea(㎡, ① 기준), ceilingMm }
 */
export function excelRowMetrics(rows, { totalArea = null, ceilingMm = null } = {}) {
  const groups = new Map(), loose = [];
  for (const r of rows) {
    const q = locationRatio(r.shelfHeight, r.materialHeight);
    const p = rackPrefix(r.location);
    if (p === null) { loose.push({ prefix: null, rows: [r], q: [q], r: null }); continue; }
    if (!groups.has(p)) groups.set(p, { prefix: p, rows: [], q: [] });
    const g = groups.get(p); g.rows.push(r); g.q.push(q);
  }
  const racks = [...groups.values()].map((g) => ({ ...g, r: g.q.reduce((a, b) => a + b, 0) / g.q.length }));
  const all = [...racks, ...loose];
  const rs = racks.map((g) => g.r);
  // 랙 사용 면적: 랙마다 마지막 행의 가로×세로(Excel은 접두사 마지막 행에서만 계산). 같은 랙의 규격은 같다.
  const usedArea = all.reduce((a, g) => { const last = g.rows[g.rows.length - 1]; return a + (num(last.rackWidth) * num(last.rackDepth)) / 1e6; }, 0);
  const idle = ceilingMm == null ? null : all.filter((g) => num(ceilingMm) - num(g.rows[g.rows.length - 1].rackHeight) - IDLE_MARGIN_MM > IDLE_MARGIN_MM).length;
  const qs = all.flatMap((g) => g.q);
  const areaUse = totalArea > 0 ? usedArea / totalArea : null;
  return {
    locations: qs.length,
    rackCount: all.length, // Summary G4
    racks: all,
    avgVolume: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null, // M3 (F4)
    lowLocations: qs.filter((q) => q < LOW_LOCATION_RATIO).length, // M4 (C열)
    usedArea,
    areaUse, // M5 (D4)
    aisleShareExcel: areaUse === null ? null : 1 - areaUse, // M6 ① (E4)
    idleRacks: idle, // M10 (H4)
    outOfFormat: loose.length,
  };
}

/** 랙 객체의 Excel 로케이션을 행 목록으로(값은 원본 그대로, mm). */
const rowsOf = (o) => (o.excel?.shelves ?? []).flatMap((s) => s.items ?? []).map((i) => ({
  location: i.location, shelfHeight: i.shelfHeight, materialHeight: i.materialHeight, rackWidth: i.rackWidth, rackDepth: i.rackDepth, rackHeight: i.rackHeight,
}));

/**
 * 배치(시나리오) 하나의 공간 지표 M1~M11.
 * @param layout 시나리오 배치, @param opts { referenceArea(㎡, Excel 총면적 ①), lowRack(M9 기준) }
 * 총면적 기준: referenceArea가 있으면 ①, 없으면 ② 도면 전체. 결과의 areaBasis로 어느 쪽인지 알린다.
 */
export function spaceMetrics(layout, { referenceArea = null, lowRack = LOW_RACK_RATIO } = {}) {
  const w = layout.warehouse, drawingArea = w.width * w.height;
  const racks = layout.objects.filter((o) => o.kind === 'rack');
  const linked = racks.filter((o) => o.excel);
  // 용적률: 랙 객체 하나 = Excel 랙 하나(가져오기가 접두사로 묶는다). 연결 로케이션이 없는 랙은 평균에서 뺀다.
  const perRack = linked.map((o) => {
    const rows = rowsOf(o);
    const q = rows.map((r) => locationRatio(r.shelfHeight, r.materialHeight));
    return { id: o.id, code: o.code, rows, q, r: q.length ? q.reduce((a, b) => a + b, 0) / q.length : null, empty: !rows.length || rows.every((r) => num(r.materialHeight) === 0) };
  });
  const rs = perRack.filter((x) => x.r !== null).map((x) => x.r);
  const qs = perRack.flatMap((x) => x.q);
  const basis = referenceArea > 0 ? 'excel' : 'drawing';
  const totalArea = basis === 'excel' ? referenceArea : drawingArea;
  const usedArea = racks.reduce((a, o) => a + o.width * o.depth, 0); // 도면의 모든 랙 바닥면적 합(설계 규격)
  const linkedUsedArea = linked.reduce((a, o) => a + o.width * o.depth, 0); // Excel 연결 랙만(Excel D4와 같은 범위)
  const areaUse = totalArea > 0 ? usedArea / totalArea : null;
  // M7: 우선순위 랙 > 보관 불가 > 통로 > 잔여로 겹침을 지워 합계 100%(도면 전체 기준).
  const U = (kinds) => unionArea(layout.objects.filter((o) => kinds.includes(o.kind)), w.width, w.height);
  const uR = U(['rack']), uRU = U(['rack', ...UNAVAILABLE]), uRUA = U(['rack', ...UNAVAILABLE, ...AISLE]);
  const parts = { rack: uR, unavailable: uRU - uR, aisle: uRUA - uRU, remaining: drawingArea - uRUA };
  const ceilingMm = w.ceiling > 0 ? w.ceiling * 1000 : null;
  const rackHeightMm = (o) => { const r = rowsOf(o)[0]; return r && num(r.rackHeight) > 0 ? num(r.rackHeight) : o.height * 1000; };
  const aisles = aisleReviewRows(layout).filter((r) => Number.isFinite(r.width));
  const minAisle = aisles.reduce((a, r) => (!a || r.width < a.width ? r : a), null);
  return {
    drawingArea, totalArea, areaBasis: basis,
    racks: racks.length, linkedRacks: linked.length, unlinkedRacks: racks.length - linked.length,
    avgVolume: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null, // M3
    volumeRacks: rs.length,
    lowLocations: qs.filter((q) => q < LOW_LOCATION_RATIO).length, locations: qs.length, // M4
    usedArea, areaUse, // M5(도면의 모든 랙)
    linkedUsedArea, areaUseLinked: totalArea > 0 ? linkedUsedArea / totalArea : null, // M5(Excel 연결 랙만 — Excel D4와 비교할 때)
    aisleShare: { excel: areaUse === null ? null : 1 - areaUse, drawing: drawingArea > 0 ? U(AISLE) / drawingArea : null }, // M6 ①·②
    composition: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, { area: v, share: drawingArea > 0 ? v / drawingArea : null }])), // M7
    emptyRacks: perRack.filter((x) => x.empty).length, unknownRacks: racks.length - linked.length, // M8
    lowRacks: perRack.filter((x) => x.r !== null && !x.empty && x.r < lowRack).length, lowRackThreshold: lowRack, // M9
    idleRacks: ceilingMm === null ? null : racks.filter((o) => ceilingMm - rackHeightMm(o) - IDLE_MARGIN_MM > IDLE_MARGIN_MM).length, // M10
    minAisle: minAisle ? { code: minAisle.code, width: minAisle.width, target: minAisle.target, min: minAisle.min } : null, // M11
    perRack,
  };
}

// ── C1 2단계: 화면 연결용 보조 함수 ──

/** Excel 총면적(①). Excel 적용 시 sourceInfo.referenceArea로 저장된다(D-061). 없으면 null → ② 도면 전체. */
export const referenceAreaOf = (project, key) => {
  const v = project?.scenarioMeta?.[key]?.sourceInfo?.referenceArea;
  return Number.isFinite(v) && v > 0 ? v : null;
};

/** 보조 모드 '선반 가중' 평균 용적률(기존 앱 방식: 랙별 높이 활용률 평균, 높이 정책 설정 그대로). */
export function shelfWeightedVolume(layout, policy = 'weightedMax') {
  const v = layout.objects.filter((o) => o.kind === 'rack').map((o) => heightUtilization(o, policy)).filter((x) => x !== null && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length / 100 : null;
}

/** 시나리오 지표(BEFORE·AFTER 각각 자기 Excel 총면적 기준). */
export const scenarioSpace = (project, key, layout = project.scenarios[key]) => spaceMetrics(layout, { referenceArea: referenceAreaOf(project, key) });

/** BEFORE→AFTER 증감(AFTER − BEFORE). 한쪽 배치가 비면 { empty: 'BEFORE'|'AFTER' }. */
export function scenarioDelta(project, current = null) {
  const b = project.scenarios?.before, a = project.scenarios?.after;
  if (!b || !a) return null;
  if (!b.objects.length || !a.objects.length) return { empty: !b.objects.length ? 'BEFORE' : 'AFTER' };
  const mb = current?.key === 'before' ? current.m : scenarioSpace(project, 'before');
  const ma = current?.key === 'after' ? current.m : scenarioSpace(project, 'after');
  const d = (x, y) => (x === null || y === null ? null : x - y);
  return { racks: ma.racks - mb.racks, avgVolume: d(ma.avgVolume, mb.avgVolume), areaUse: d(ma.areaUse, mb.areaUse), aisleShare: d(ma.aisleShare.excel, mb.aisleShare.excel) };
}
