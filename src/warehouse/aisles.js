// 통로 폭·보호 구역 검토 행(기준본 50 M.validate 표). DOM 없음.
import { aisleClearance } from '../geometry/clearance.js';
import { GEOMETRY_EPS_M as EPS } from '../geometry/tolerance.js';
import { formatNumber as fmt } from '../core/format.js';

export const AISLE_CSV_HEADER = ['통로', '유효 폭 m', '최소 폭 m', '목표 폭 m', '부족 m', '침범 객체', '검사 범위', '문 구역 접촉', '경로 연속성'];
const STATUS = { disabled: '경고 사용 안 함', ok: '설정한 단면 폭 기준 통과' };

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
