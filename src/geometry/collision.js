// 회전 사각형 충돌(SAT)과 최소 거리.
// 기준본 v2.4.1 10-geometry overlaps/pointSegment/gap의 동작을 따른다.
// - 변·꼭짓점이 닿기만 한 경우(거리 0)는 충돌이 아니다(D-004, G1 확인).
// - 분리 축은 정규화하지 않은 변 법선이며 GEOMETRY_EPS_M으로 분리를 판정한다.
import { GEOMETRY_EPS_M } from './tolerance.js';
import { polygon } from './polygons.js';

function project(points, n) {
  return points.map((v) => v[0] * n[0] + v[1] * n[1]);
}

/** 두 회전 사각형이 실제로 겹치는지 판정한다. 접촉만 한 경우 false. */
export function overlaps(a, b) {
  const A = polygon(a);
  const B = polygon(b);
  for (const p of [A, B]) {
    for (let i = 0; i < 4; i++) {
      const q = p[(i + 1) % 4];
      const n = [-(q[1] - p[i][1]), q[0] - p[i][0]];
      const aa = project(A, n);
      const bb = project(B, n);
      if (Math.min(...aa) >= Math.max(...bb) - GEOMETRY_EPS_M || Math.min(...bb) >= Math.max(...aa) - GEOMETRY_EPS_M) {
        return false;
      }
    }
  }
  return true;
}

/** 점 p와 선분 ab 사이의 최소 거리. */
export function pointSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** 두 회전 사각형 사이의 최소 거리(m). 겹치면 0. */
export function gap(a, b) {
  if (overlaps(a, b)) return 0;
  const A = polygon(a);
  const B = polygon(b);
  let d = Infinity;
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      d = Math.min(d, pointSegment(A[i], B[j], B[(j + 1) % 4]), pointSegment(B[j], A[i], A[(i + 1) % 4]));
    }
  }
  return d;
}
