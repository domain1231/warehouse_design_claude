// Track C · C1: 공간 지표 단일 출처(로드맵 6.3 M1~M11). DOM 없음, 순수 함수.
// 용적률 계열(M1~M4·M10)은 업무 Excel(Space Optimization) 산식과 같게 계산한다.
//   Q(로케이션 용적률) = 자재높이 P ÷ 랙 단 높이 O, 분모가 0이거나 숫자가 아니면 0 (Excel IFERROR(P/O,0))
//   R(랙 용적률)      = 같은 랙 접두사(세 번째 '-'까지) 로케이션 Q의 평균
//   평균 용적률(F4)   = R의 산술평균. 접두사를 만들 수 없는 로케이션(예: 'Buffer Rack')은 Excel처럼 랙 1개로 세지만 평균에서는 뺀다.
// C10(D-073): 앱 지표(spaceMetrics)의 M3는 빈 랙(R = 0)을 빼고(Excel AVERAGEIF(>0)), M4는 빈 로케이션(품목코드 없음)을 뺀다.
//   품목코드 열이 아예 없는 자료(모든 행의 품목코드가 비어 있음)는 빈 로케이션을 가릴 수 없으므로 빼지 않는다.
//   Excel 행 복제(excelRowMetrics)는 C7 대조용이라 워크북 수식을 그대로 따른다(F4가 AVERAGEIF면 averageIf: true).
// 면적·통로 계열(M5~M7)은 총면적 기준을 고를 수 있다: ① Excel 입력 순 바닥면적(기본) ② 도면 전체(가로×세로).
import { unionArea } from '../warehouse/metrics.js';
import { aisleReviewRows, aisleStandard, aisleSettingIssues } from '../warehouse/aisles.js';
import { GEOMETRY_EPS_M as EPS } from '../geometry/tolerance.js';
import { heightUtilization } from '../warehouse/appearance.js';

export const LOW_LOCATION_RATIO = 0.8; // M4 기준(Summary C열 '용적률 80% 미만')
export const LOW_RACK_RATIO = 0.5; // M9 기본 기준
export const IDLE_MARGIN_MM = 500; // M10: 천장 − 랙 높이 − 500 > 500
const UNAVAILABLE = ['wall', 'column', 'blocked', 'door'];
const AISLE = ['aisle', 'work'];

/** 품목코드가 있는 행이 하나라도 있으면 품목코드 없는 행을 빈 로케이션으로 본다(C10). */
export function emptyLocationTest(rows) {
  const has = (r) => String(r.itemCode ?? '').trim() !== '';
  return rows.some(has) ? (r) => !has(r) : () => false;
}

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
 * @param opts { totalArea(㎡, ① 기준), ceilingMm, averageIf(F4 수식이 AVERAGEIF(>0)이면 true — R = 0인 랙을 평균에서 뺌) }
 */
export function excelRowMetrics(rows, { totalArea = null, ceilingMm = null, averageIf = false } = {}) {
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
  const rs = racks.map((g) => g.r).filter((r) => !averageIf || r > 0);
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
  location: i.location, itemCode: i.itemCode, shelfHeight: i.shelfHeight, materialHeight: i.materialHeight, rackWidth: i.rackWidth, rackDepth: i.rackDepth, rackHeight: i.rackHeight,
}));

/**
 * 배치(시나리오) 하나의 공간 지표 M1~M11.
 * @param layout 시나리오 배치, @param opts { referenceArea(㎡, Excel 총면적 ①), lowRack(M9 기준) }
 * 총면적 기준: referenceArea가 있으면 ①, 없으면 ② 도면 전체. 결과의 areaBasis로 어느 쪽인지 알린다.
 */
export function spaceMetrics(layout, { referenceArea = null, lowRack = LOW_RACK_RATIO, aisleRules = null } = {}) {
  const w = layout.warehouse, drawingArea = w.width * w.height;
  const racks = layout.objects.filter((o) => o.kind === 'rack');
  const linked = racks.filter((o) => o.excel);
  // 용적률: 랙 객체 하나 = Excel 랙 하나(가져오기가 접두사로 묶는다). 연결 로케이션이 없는 랙은 평균에서 뺀다.
  const perRack = linked.map((o) => {
    const rows = rowsOf(o);
    const q = rows.map((r) => locationRatio(r.shelfHeight, r.materialHeight));
    return { id: o.id, code: o.code, rows, q, r: q.length ? q.reduce((a, b) => a + b, 0) / q.length : null, empty: !rows.length || rows.every((r) => num(r.materialHeight) === 0) };
  });
  // C10: M3 = R > 0인 랙만(빈 랙 제외, Excel AVERAGEIF(>0)). M4 = 빈 로케이션(품목코드 없음) 제외.
  const rs = perRack.filter((x) => x.r !== null && x.r > 0).map((x) => x.r);
  const isEmptyLoc = emptyLocationTest(perRack.flatMap((x) => x.rows));
  const qs = perRack.flatMap((x) => x.rows.flatMap((r, i) => (isEmptyLoc(r) ? [] : [x.q[i]])));
  const allLocations = perRack.reduce((a, x) => a + x.rows.length, 0);
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
  const byId = new Map(layout.objects.map((o) => [o.id, o]));
  const stdOf = (r) => aisleStandard(byId.get(r.id), aisleRules);
  const minStd = minAisle ? stdOf(minAisle) : null;
  const aisleBelowStandard = aisles.filter((r) => r.status !== '경고 사용 안 함' && byId.get(r.id).warningsEnabled !== false && r.width < stdOf(r).standard - EPS).length;
  return {
    drawingArea, totalArea, areaBasis: basis,
    racks: racks.length, linkedRacks: linked.length, unlinkedRacks: racks.length - linked.length,
    avgVolume: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null, // M3
    volumeRacks: rs.length,
    lowLocations: qs.filter((q) => q < LOW_LOCATION_RATIO).length, locations: qs.length, emptyLocations: allLocations - qs.length, // M4(분모 = 적치 로케이션)
    usedArea, areaUse, // M5(도면의 모든 랙)
    linkedUsedArea, areaUseLinked: totalArea > 0 ? linkedUsedArea / totalArea : null, // M5(Excel 연결 랙만 — Excel D4와 비교할 때)
    aisleShare: { excel: areaUse === null ? null : 1 - areaUse, drawing: drawingArea > 0 ? U(AISLE) / drawingArea : null }, // M6 ①·②
    composition: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, { area: v, share: drawingArea > 0 ? v / drawingArea : null }])), // M7
    emptyRacks: perRack.filter((x) => x.empty).length, unknownRacks: racks.length - linked.length, // M8
    lowRacks: perRack.filter((x) => x.r !== null && !x.empty && x.r < lowRack).length, lowRackThreshold: lowRack, // M9
    idleRacks: ceilingMm === null ? null : racks.filter((o) => ceilingMm - rackHeightMm(o) - IDLE_MARGIN_MM > IDLE_MARGIN_MM).length, // M10
    minAisle: minAisle ? { code: minAisle.code, width: minAisle.width, target: minAisle.target, min: minAisle.min, standard: minStd.standard, standardLabel: minStd.label } : null, // M11
    aisleBelowStandard, aisleSettingIssues: aisleSettingIssues(layout, aisleRules).length, // C5
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
export const scenarioSpace = (project, key, layout = project.scenarios[key]) => spaceMetrics(layout, { referenceArea: referenceAreaOf(project, key), aisleRules: project.aisleRules });

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

// ── C2: 비교 대화상자 '목적 지표' 표(표시 문자열) ──
const pctText = (v) => (v === null || v === undefined ? '미확인' : (v * 100).toFixed(1) + '%');
const MINUS = '−';
const signed = (n, f = (x) => String(x), unit = '') => (n > 0 ? '+' : n < 0 ? MINUS : '±') + f(Math.abs(n)) + unit;
const signedPp = (b, a) => (b === null || a === null ? '—' : signed(Math.round((a - b) * 1000) / 10, (x) => x.toFixed(1), '%p'));

export function purposeCompare(project) {
  const hasRack = (k) => project.scenarios[k].objects.some((o) => o.kind === 'rack');
  const ready = hasRack('before'), afterOk = hasRack('after');
  const NONE = '배치 없음';
  const b = scenarioSpace(project, 'before'), a = scenarioSpace(project, 'after');
  const dl = (s) => (!ready ? '기준 없음' : !afterOk ? '—' : s);
  const cnt = (x, y) => dl(signed(y - x));
  const loc = (m) => (m.locations ? `${m.lowLocations} / ${m.locations}` : '미확인');
  const emp = (m) => `${m.emptyRacks}` + (m.unknownRacks > 0 ? ` (미확인 ${m.unknownRacks})` : '');
  const cs = (m) => { const c = m.composition, p = (k) => pctText(c[k].share); return `랙 ${p('rack')} · 보관 불가 ${p('unavailable')} · 통로 ${p('aisle')} · 잔여 ${p('remaining')}`; };
  const aw = (m) => (m.minAisle ? `${m.minAisle.width.toFixed(3)}m` + (m.minAisle.code ? ` (${m.minAisle.code})` : "") : '통로 없음');
  const row = (id, label, before, after, delta, tip) => ({ id, label, before: ready ? before : NONE, after: afterOk ? after : NONE, delta, tip });
  return [
    row('M3', '평균 용적률', pctText(b.avgVolume), pctText(a.avgVolume), dl(signedPp(b.avgVolume, a.avgVolume)), '로케이션 용적률 Q = 자재높이 ÷ 단 높이 → 랙 용적률 R = 같은 랙 Q 평균 → 평균 용적률 = R의 평균 (Excel Summary F4). 빈 랙(R = 0)은 빼고 빈 랙 행에 따로 셈'),
    row('M4', '80% 미만 로케이션', loc(b), loc(a), dl(signed(a.lowLocations - b.lowLocations)), '로케이션 용적률 Q < 80%인 로케이션 수 / 적치 로케이션 수 (Excel Summary C열). 품목코드가 없는 빈 로케이션은 뺌'),
    row('M8', '빈 랙', emp(b), emp(a), cnt(b.emptyRacks, a.emptyRacks), '연결 로케이션의 자재높이가 모두 0인 랙(평균 용적률·80% 미만에서 뺌). Excel 미연결 랙은 미확인으로 따로 셈'),
    row('M9', '저활용 랙', `${b.lowRacks}`, `${a.lowRacks}`, cnt(b.lowRacks, a.lowRacks), `랙 용적률 R < ${b.lowRackThreshold * 100}%인 랙 (빈 랙 제외)`),
    row('M6', '통로 비중', pctText(b.aisleShare.excel), pctText(a.aisleShare.excel), dl(signedPp(b.aisleShare.excel, a.aisleShare.excel)), `① Excel 방식 = 1 − 면적 사용률 (총면적: Excel 입력값, 없으면 도면 전체). 도면 통로 기준 BEFORE ${pctText(b.aisleShare.drawing)} / AFTER ${pctText(a.aisleShare.drawing)}`),
    row('M7', '공간 구성', cs(b), cs(a), dl('랙 ' + signedPp(b.composition.rack.share, a.composition.rack.share)), '랙 > 보관 불가 > 통로 > 잔여 순으로 겹침을 한 번만 셈. 도면 전체 기준, 합계 100%'),
    row('M11', '최소 통로 폭', aw(b), aw(a), dl(b.minAisle && a.minAisle ? signed(Math.round((a.minAisle.width - b.minAisle.width) * 1000) / 1000, (x) => x.toFixed(3), 'm') : '—'), '통로 단면 기준 최소 폭' + (a.minAisle?.target || b.minAisle?.target ? ` · 목표 ${a.minAisle?.target ?? b.minAisle.target}m` : '') + (a.minAisle?.standard || b.minAisle?.standard ? ` · 기준 ${(a.minAisle ?? b.minAisle).standard}m(${(a.minAisle ?? b.minAisle).standardLabel})` : '')),
  ];
}
