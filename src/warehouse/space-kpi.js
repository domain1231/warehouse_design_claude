// D-059: 추가 공간 지표(보관 가능 잔여 비중·통로:랙 면적비·최소 통로 폭·BEFORE→AFTER 증감·평균 용적률). DOM 없음.
import { metrics } from './metrics.js';
import { aisleReviewRows } from './aisles.js';
import { heightUtilization } from './appearance.js';
import { GEOMETRY_EPS_M as EPS } from '../geometry/tolerance.js';

// 비교용 시나리오 지표. 배치는 제자리에서 바뀔 수 있으므로 객체 기준 캐시를 두지 않는다(경고 계산은 생략, 면적 합집합은 metrics.js 캐시 사용).
const quick = (layout, project) => metrics(layout, project, { warnings: [] });
const share = (a, area) => (area > 0 ? (a / area) * 100 : null);

/**
 * @param layout 현재 보는 배치, @param project 프로젝트, @param m 현재 배치의 metrics() 결과
 * 값을 알 수 없으면 null(미확인)로 둔다.
 */
export function spaceKpis(layout, project, m) {
  const aisles = aisleReviewRows(layout).filter((r) => Number.isFinite(r.width));
  const min = aisles.reduce((a, r) => (!a || r.width < a.width ? r : a), null);
  const racks = layout.objects.filter((o) => o.kind === 'rack');
  const policy = project.settings?.heightPolicy ?? 'weightedMax';
  const hu = racks.map((o) => heightUtilization(o, policy)).filter((v) => v !== null && Number.isFinite(v));
  const before = project.scenarios?.before, after = project.scenarios?.after;
  let delta = null;
  if (before && after) {
    const mb = before === layout ? m : quick(before, project), ma = after === layout ? m : quick(after, project);
    const empty = (l) => !l.objects.length;
    delta = empty(before) || empty(after)
      ? { empty: empty(before) ? 'BEFORE' : 'AFTER' }
      : { racks: ma.racks - mb.racks, footprint: ma.footprint - mb.footprint, aisleShare: (share(ma.aisles, ma.area) ?? 0) - (share(mb.aisles, mb.area) ?? 0) };
  }
  return {
    remainingShare: share(m.remaining, m.area),
    aisleRackRatio: m.rackArea > 0 ? m.aisles / m.rackArea : null,
    minAisle: min ? { code: min.code, width: min.width, target: min.target, min: min.min, belowTarget: min.width < min.target - EPS, belowMin: min.width < min.min - EPS } : null,
    avgVolume: hu.length ? hu.reduce((a, b) => a + b, 0) / hu.length : null,
    volumeKnown: hu.length,
    rackTotal: racks.length,
    delta,
  };
}
