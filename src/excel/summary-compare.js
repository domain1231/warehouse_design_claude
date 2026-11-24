// C7: 방 시트의 Excel Summary(C3..H4)와 앱의 행 기준 계산을 나란히 놓고 차이 원인 후보를 자동 감지한다. DOM 없음.
// 앱 계산은 excelRowMetrics(Summary와 같은 규칙)를 쓰고, 입력 행은 분석에서 거부된 행(형식 밖 로케이션·중복)까지 포함한다.
import { excelRowMetrics, locationRatio, rackPrefix, emptyLocationTest } from '../metrics/space.js';

export const RATIO_TOLERANCE = 0.0005; // 비율 지표: 0.05%p 미만이면 같음
const MINUS = '−';
const pct = (v) => (v === null || v === undefined ? '—' : (v * 100).toFixed(1) + '%');
const pp = (d) => (d === null ? '—' : (Math.abs(d) < 0.00005 ? '±' : d > 0 ? '+' : MINUS) + Math.abs(d * 100).toFixed(1) + '%p');
const cnt = (v) => (v === null || v === undefined ? '—' : String(v));
const dcnt = (d) => (d === null ? '—' : d === 0 ? '±0' : (d > 0 ? '+' : MINUS) + Math.abs(d));
const nz = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** 'B8:U351' → { first: 9, last: 351 }(데이터 행, 머리글 제외). 해석 못 하면 null. */
export function tableDataRows(ref) {
  const m = /^[A-Z]+(\d+):[A-Z]+(\d+)$/.exec(String(ref ?? ''));
  return m ? { first: Number(m[1]) + 1, last: Number(m[2]) } : null;
}

/**
 * @param summary analyze의 excelSummary, @param rows 시트의 모든 데이터 행 [{ sourceRow, location, shelfHeight, materialHeight, rackWidth, rackDepth, rackHeight }]
 * @returns { rows:[{id,label,excel,app,diff,same,ratio,excelText,appText,diffText}], causes:[{id,text,count,sample,items}], differs }
 */
export function summaryCompare(summary, rows, { ceilingMm = null, shelfHeader = 'Rack 단 높이 (mm)' } = {}) {
  const m = excelRowMetrics(rows, { totalArea: summary.totalArea, ceilingMm, averageIf: !!summary.f4AverageIf });
  // C10: 앱 지표는 빈 랙(R = 0)·빈 로케이션(품목코드 없음)을 뺀다. Excel 대조와 별개로 몇 개인지 알린다.
  const isEmpty = emptyLocationTest(rows);
  const empty = { racks: m.racks.filter((g) => g.r === 0).length, locations: rows.filter(isEmpty).length };
  const defs = [
    ['F4', '평균 용적률 (F4)', summary.avgVolume, m.avgVolume, true],
    ['D4', '면적 사용률 (D4)', summary.areaUse, m.areaUse, true],
    ['E4', '통로 비중 (E4)', summary.aisleShare, m.aisleShareExcel, true],
    ['G4', "Rack Q'ty (G4)", summary.rackCount, m.rackCount, false],
    ['H4', "유휴 공간 Rack Q'ty (H4)", summary.idleRacks, m.idleRacks, false],
    ['C', '80% 미만 로케이션 (Summary 시트)', summary.lowLocations ?? null, m.lowLocations, false],
  ];
  const out = [];
  for (const [id, label, excel, app, ratio] of defs) {
    if (excel === null || excel === undefined || app === null) continue; // 한쪽을 알 수 없으면(천장 높이 없음 등) 비교하지 않는다
    const diff = app - excel, same = ratio ? Math.abs(diff) < RATIO_TOLERANCE : diff === 0;
    out.push({ id, label, excel, app, diff, same, ratio, excelText: ratio ? pct(excel) : cnt(excel), appText: ratio ? pct(app) : cnt(app), diffText: ratio ? pp(diff) : dcnt(diff) });
  }
  const differs = out.filter((r) => !r.same).length;
  const causes = [];
  if (differs) {
    const item = (r) => ({ location: r.location, shelfHeight: r.shelfHeight, materialHeight: r.materialHeight, q: locationRatio(r.shelfHeight, r.materialHeight) });
    const add = (id, text, list) => list.length && causes.push({ id, text, count: list.length, sample: list[0].location ?? null, items: list.map(item) });
    const qd = summary.qDivisor, norm = (v) => String(v ?? '').replace(/[\s()]/g, '').toLowerCase();
    if (qd && norm(qd.header) !== norm(shelfHeader)) causes.push({ id: 'q-divisor', text: `Excel 용적률 수식이 단 높이 열(${shelfHeader || "단 높이"})이 아닌 ${qd.column}열(${qd.header})로 나눔 ${qd.rows}행 — Excel Summary 값이 잘못 계산됨`, count: qd.rows, sample: qd.column, items: [] });
    add('outOfFormat', '형식 밖 로케이션 — 앱은 랙 1개로 세고 평균 용적률에서 뺌', rows.filter((r) => rackPrefix(r.location) === null));
    add('materialOver', '자재높이 > 단 높이 — 입력 오류 가능', rows.filter((r) => locationRatio(r.shelfHeight, r.materialHeight) > 1));
    add('zeroShelf', '단 높이 0·빈칸 — 용적률 0으로 계산', rows.filter((r) => nz(r.shelfHeight) === 0));
    const t = tableDataRows(summary.tableRef);
    if (t) add('outOfTable', 'Summary 표 범위 밖 행 — Excel Summary에 미반영', rows.filter((r) => r.sourceRow < t.first || r.sourceRow > t.last));
    const direct = Object.entries(summary.formulas ?? {}).filter(([, f]) => !f).map(([c]) => c);
    if (direct.length) causes.push({ id: 'directInput', text: `직접 입력값(${direct.join('·')}) — 앱은 행으로 다시 계산`, count: direct.length, sample: direct[0], items: [] });
    const bad = new Set(out.filter((r) => !r.same).map((r) => r.id));
    const explained = causes.some((c) => c.id !== 'directInput' || direct.some((c4) => bad.has(c4)));
    if (!explained) causes.push({ id: 'unknown', text: '그 밖의 차이 — Excel 수식·표 범위를 직접 확인', count: 0, sample: null, items: [] });
  }
  return { rows: out, causes, differs, empty };
}

/** 원인에 걸린 행 CSV용 표(머리글 포함). */
export const causeCsvTable = (res) => [['원인', '로케이션', '단 높이', '자재높이', '용적률'], ...res.causes.flatMap((c) => c.items.map((i) => [c.text.split(' — ')[0], i.location ?? '', i.shelfHeight ?? '', i.materialHeight ?? '', pct(i.q)]))];
