// 충돌(겹침)과 최소 거리. 기준본 v2.4.1 10-geometry overlaps/pointSegment/gap과
// 50-editor의 다각형 통로 확장(mBaseOverlaps·mBaseGap 래퍼)을 합친 최종 동작이다.
// - 변·꼭짓점이 닿기만 한 경우(거리 0)는 충돌이 아니다(D-004, G1 확인).
// - 사각형끼리는 SAT(정규화하지 않은 변 법선), 다각형 통로가 끼면 삼각분할 후 볼록 교집합 면적으로 판정한다.
import { GEOMETRY_EPS_M as EPS } from './tolerance.js';
import { polygon, bounds, triangles, clipConvex, area } from './polygons.js';

function project(points, n) {
  return points.map((v) => v[0] * n[0] + v[1] * n[1]);
}

function overlapsRect(a, b) {
  const A = polygon(a);
  const B = polygon(b);
  for (const p of [A, B]) {
    for (let i = 0; i < 4; i++) {
      const q = p[(i + 1) % 4];
      const n = [-(q[1] - p[i][1]), q[0] - p[i][0]];
      const aa = project(A, n);
      const bb = project(B, n);
      if (Math.min(...aa) >= Math.max(...bb) - EPS || Math.min(...bb) >= Math.max(...aa) - EPS) return false;
    }
  }
  return true;
}

/** 두 객체가 실제로 겹치는지 판정한다. 접촉만 한 경우 false. */
export function overlaps(a, b) {
  if (!a.vertices && !b.vertices) return overlapsRect(a, b);
  const A = polygon(a);
  const B = polygon(b);
  const ba = bounds(a);
  const bb = bounds(b);
  if (ba.maxX <= bb.minX + EPS || bb.maxX <= ba.minX + EPS || ba.maxY <= bb.minY + EPS || bb.maxY <= ba.minY + EPS) return false;
  for (const t of triangles(A)) {
    for (const u of triangles(B)) {
      const p = clipConvex(t, u);
      if (p.length >= 3 && Math.abs(area(p)) > EPS) return true;
    }
  }
  return false;
}

/** 점 p와 선분 ab 사이의 최소 거리. */
export function pointSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** 두 객체 외곽 사이의 최소 거리(m). 겹치면 0. */
export function gap(a, b) {
  if (overlaps(a, b)) return 0;
  const A = polygon(a);
  const B = polygon(b);
  let d = Infinity;
  for (let i = 0; i < A.length; i++) {
    for (let j = 0; j < B.length; j++) {
      d = Math.min(d, pointSegment(A[i], B[j], B[(j + 1) % B.length]), pointSegment(B[j], A[i], A[(i + 1) % A.length]));
    }
  }
  return d;
}
