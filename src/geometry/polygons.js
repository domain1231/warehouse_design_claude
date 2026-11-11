// 회전 사각형의 꼭짓점과 축 정렬 경계(AABB).
// 좌표계: 미터, 객체의 (x, y)는 회전 전 사각형의 왼쪽 위 모서리, 회전은 중심 기준 각도(도).
// 기준본 v2.4.1 10-geometry polygon/bounds와 같은 연산 순서를 유지한다(Golden Master G1 비트 단위 근접 일치).

/** 회전을 반영한 4개 꼭짓점 [[x, y], ...]. 순서: 회전 전 기준 왼쪽 위 → 오른쪽 위 → 오른쪽 아래 → 왼쪽 아래. */
export function polygon(o) {
  const a = (o.rotation * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const cx = o.x + o.width / 2;
  const cy = o.y + o.depth / 2;
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
