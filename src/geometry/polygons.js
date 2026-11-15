// 회전 사각형·다각형 통로의 꼭짓점, 축 정렬 경계(AABB), 다각형 기본 연산.
// 좌표계: 미터, 객체의 (x, y)는 회전 전 사각형의 왼쪽 위 모서리, 회전은 중심 기준 각도(도).
// 기준본 v2.4.1 10-geometry polygon/bounds와 50-editor의 다각형 통로 확장(mBasePolygon 래퍼, M.area/cross/
// intersection/simple/triangles/clipConvex)을 같은 연산 순서로 옮겼다(Golden Master G1·G2 일치).
import { GEOMETRY_EPS_M as EPS } from './tolerance.js';

/**
 * 객체 외곽 꼭짓점 [[x, y], ...].
 * - 사각형: 회전 전 기준 왼쪽 위 → 오른쪽 위 → 오른쪽 아래 → 왼쪽 아래.
 * - 다각형 통로(vertices): 각 꼭짓점은 객체 상자 안의 0..1 상대 좌표이며 중심 기준으로 회전한다.
 */
export function polygon(o) {
  const a = (o.rotation * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const cx = o.x + o.width / 2;
  const cy = o.y + o.depth / 2;
  if (o.vertices) {
    return o.vertices.map(([u, v]) => {
      const x = (u - 0.5) * o.width;
      const y = (v - 0.5) * o.depth;
      return [cx + x * c - y * s, cy + x * s + y * c];
    });
  }
  const hw = o.width / 2;
  const hd = o.depth / 2;
  return [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
}

/** 회전 외곽 기준 축 정렬 경계. */
export function bounds(o) {
  const p = polygon(o);
  const xs = p.map((v) => v[0]);
  const ys = p.map((v) => v[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

/** 부호 있는 면적(반시계 양수). */
export function area(p) {
  return p.reduce((n, a, i) => {
    const b = p[(i + 1) % p.length];
    return n + a[0] * b[1] - a[1] * b[0];
  }, 0) / 2;
}

export function cross(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

/** 선분 ab와 cd의 교점(끝점 포함, EPS 허용). 평행하면 null. */
export function intersection(a, b, c, d) {
  const rx = b[0] - a[0];
  const ry = b[1] - a[1];
  const sx = d[0] - c[0];
  const sy = d[1] - c[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den;
  const u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / den;
  return t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS ? [a[0] + t * rx, a[1] + t * ry] : null;
}

/** 단순 다각형(면적 있음, 길이 0 변 없음, 인접하지 않은 변끼리 닿거나 교차하지 않음). 기준본 M.simple. */
export function isSimplePolygon(p) {
  if (p.length < 3 || Math.abs(area(p)) < EPS) return false;
  for (let i = 0; i < p.length; i++) {
    const n = p[(i + 1) % p.length];
    if (Math.hypot(p[i][0] - n[0], p[i][1] - n[1]) < EPS) return false;
    for (let j = i + 1; j < p.length; j++) {
      if (j === i + 1 || (i === 0 && j === p.length - 1)) continue;
      if (intersection(p[i], n, p[j], p[(j + 1) % p.length])) return false;
    }
  }
  return true;
}

/** 귀 자르기 삼각분할. 기준본 M.triangles. */
export function triangles(p) {
  let q = p.map((v) => [...v]);
  if (area(q) < 0) q.reverse();
  let changed = true;
  while (changed && q.length > 3) {
    changed = false;
    for (let i = 0; i < q.length; i++) {
      if (Math.abs(cross(q[(i + q.length - 1) % q.length], q[i], q[(i + 1) % q.length])) < 1e-10) {
        q.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  const out = [];
  let guard = 0;
  while (q.length > 3 && guard++ < 4e3) {
    let ear = false;
    for (let i = 0; i < q.length; i++) {
      const a = q[(i + q.length - 1) % q.length];
      const b = q[i];
      const c = q[(i + 1) % q.length];
      if (cross(a, b, c) <= 1e-10) continue;
      if (q.some((v, j) => j !== i && j !== (i + 1) % q.length && j !== (i + q.length - 1) % q.length && cross(a, b, v) >= -EPS && cross(b, c, v) >= -EPS && cross(c, a, v) >= -EPS)) continue;
      out.push([a, b, c]);
      q.splice(i, 1);
      ear = true;
      break;
    }
    if (!ear) throw new Error('다각형을 분해할 수 없습니다. 꼭짓점을 확인하세요.');
  }
  if (q.length === 3) out.push(q);
  return out;
}

/** 볼록 다각형 clip으로 poly를 자른다(Sutherland–Hodgman). 기준본 M.clipConvex. */
export function clipConvex(poly, clip) {
  const sign = area(clip) >= 0 ? 1 : -1;
  for (let k = 0; k < clip.length; k++) {
    const a = clip[k];
    const b = clip[(k + 1) % clip.length];
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const v = sign * cross(a, b, p);
      const w = sign * cross(a, b, q);
      const ip = v >= -1e-11;
      const iq = w >= -1e-11;
      if (ip) out.push(p);
      if (ip !== iq) {
        const t = v / (v - w);
        out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    }
    poly = out;
    if (!poly.length) break;
  }
  return poly;
}
