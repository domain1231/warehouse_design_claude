// 통로 폭·보호 구역 검토 행(기준본 50 M.validate 표). DOM 없음.
import { aisleClearance } from '../geometry/clearance.js';
import { GEOMETRY_EPS_M as EPS } from '../geometry/tolerance.js';
import { formatNumber as fmt } from '../core/format.js';

export const AISLE_CSV_HEADER = ['통로', '유효 폭 m', '최소 폭 m', '목표 폭 m', '부족 m', '침범 객체', '검사 범위', '문 구역 접촉', '경로 연속성'];
const STATUS = { disabled: '경고 사용 안 함', ok: '설정한 단면 폭 기준 통과' };

/** C5: 통로 종류별 참고 안내(판정에는 쓰지 않음). settingFloor는 주통로 기준이 이 값 미만이면 설정 경고. 저장된 값은 바꾸지 않는다. */
export const AISLE_STANDARDS = Object.freeze({
  '메인 이동 통로': Object.freeze({ label: '주통로', recommended: 1.2, settingFloor: 1.0 }),
  '랙 접근 통로': Object.freeze({ label: '접근 통로', recommended: 1.0, settingFloor: null }),
});

/** 통로 하나의 비교 기준 폭 = max(통로 최소 폭, 사용자 통로 종류 기준 최소 폭). rules = project.aisleRules. */
export function aisleStandard(o, rules) {
  const s = AISLE_STANDARDS[o.aisleType];
  const r = rules?.[o.aisleType];
  const ruleMin = r && r.enabled !== false ? r.minWidth : null;
  return {
    label: s?.label ?? (o.aisleType || '통로'), recommended: s?.recommended ?? null, settingFloor: s?.settingFloor ?? null,
    standard: Math.max(o.minWidth ?? 0, ruleMin ?? 0), source: ruleMin > o.minWidth ? 'rule' : 'aisle',
  };
}

/** 주통로 기준이 설정 하한 미만인 통로(비공간·비차단 경고). */
export function aisleSettingIssues(layout, rules) {
  return layout.objects.filter((o) => o.kind === 'aisle' && o.warningsEnabled !== false).flatMap((o) => {
    const { settingFloor: f, standard } = aisleStandard(o, rules);
    return f != null && standard < f - EPS
      ? [{ id: o.id, code: o.code, key: 'aisle-setting:' + o.id, text: `${o.code} · 주통로 기준 ${fmt(standard, 3)}m < 하한 ${f.toFixed(1)}m (설정 확인)`, ids: [o.id], spatial: false }]
      : [];
  });
}

/** 현재 배치의 통로마다 한 행. */
export function aisleReviewRows(layout) {
  return layout.objects.filter((o) => o.kind === 'aisle').map((o) => {
    const c = aisleClearance(o, layout);
    const status = !c.enabled ? STATUS.disabled : c.width < c.min - EPS || c.obstacles.length ? '⚠ 보호 구역 침범 또는 폭 부족' : c.width < c.target - EPS ? '목표 폭 미달' : STATUS.ok;
    return {
      id: o.id, code: c.code, status, width: c.width, min: c.min, target: c.target, shortage: c.shortage,
      obstacles: c.obstacles.map((x) => x.code).join(', '), scope: c.partial ? '지정 랙' : '전체',
      door: c.connected === null ? '미지정' : c.connected ? '접촉' : '미연결',
    };
  });
}

/** CSV 행(헤더 포함). 경로 연속성은 검증하지 않으므로 '미검증' 고정. */
export const aisleCsvRows = (rows) => [AISLE_CSV_HEADER, ...rows.map((r) => [r.code, fmt(r.width, 3), fmt(r.min, 3), fmt(r.target, 3), fmt(r.shortage, 3), r.obstacles, r.scope, r.door, '미검증'])];
