// 배치 통계(기준본 10-geometry metrics·unionArea·clipPolygon·unitTotals). DOM 없음.
// 면적 합집합은 x 방향 띠 분할로 계산하며, 오목 다각형은 기준본과 같이 띠마다 최소~최대 구간으로 근사한다.
import { GEOMETRY_EPS_M as EPS } from '../geometry/tolerance.js';
import { polygon } from '../geometry/polygons.js';
import { warnings, ratio } from './constraints.js';

/** 다각형을 창고 사각형(0~w, 0~h)으로 자른다(Sutherland–Hodgman). */
export function clipPolygon(poly, w, h) {
  for (const [axis, value, lower] of [[0, 0, true], [0, w, false], [1, 0, true], [1, h, false]]) {
    const out = [];
    if (!poly.length) break;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const ia = lower ? a[axis] >= value : a[axis] <= value, ib = lower ? b[axis] >= value : b[axis] <= value;
      if (ia) out.push(a);
      if (ia !== ib) {
        const t = (value - a[axis]) / (b[axis] - a[axis]);
        out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
      }
    }
    poly = out;
  }
  return poly;
}

/** 객체들이 창고 안에서 차지하는 면적(겹친 부분은 한 번만). */
export function unionArea(objects, w, h) {
  const polys = objects.map((o) => clipPolygon(polygon(o), w, h)).filter((p) => p.length >= 3);
  const edges = [], xs = [];
  for (const p of polys) {
    for (let i = 0; i < p.length; i++) {
      edges.push([p[i], p[(i + 1) % p.length]]);
      xs.push(p[i][0]);
    }
  }
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const [a, b] = edges[i], [c, d] = edges[j];
      const rx = b[0] - a[0], ry = b[1] - a[1], sx = d[0] - c[0], sy = d[1] - c[1], den = rx * sy - ry * sx;
      if (Math.abs(den) < EPS) continue;
      const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den, u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / den;
      if (t > 0 && t < 1 && u > 0 && u < 1) xs.push(a[0] + t * rx);
    }
  }
  const sorted = [...new Set(xs.map((v) => Math.round(v * 1e9) / 1e9))].sort((a, b) => a - b);
  const lengthAt = (x) => {
    const intervals = [];
    for (const p of polys) {
      const ys = [];
      for (let i = 0; i < p.length; i++) {
        const a = p[i], b = p[(i + 1) % p.length];
        if ((a[0] <= x && b[0] > x) || (b[0] <= x && a[0] > x)) ys.push(a[1] + ((x - a[0]) * (b[1] - a[1])) / (b[0] - a[0]));
      }
      if (ys.length >= 2) intervals.push([Math.min(...ys), Math.max(...ys)]);
    }
    intervals.sort((a, b) => a[0] - b[0]);
    let total = 0, end = -Infinity;
    for (const [a, b] of intervals) {
      if (a > end) {
        total += b - a;
        end = b;
      } else if (b > end) {
        total += b - end;
        end = b;
      }
    }
    return total;
  };
  let area = 0;
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1], b = sorted[i];
    if (b - a > EPS) area += (b - a) * lengthAt((a + b) / 2);
  }
  return Math.max(0, Math.min(w * h, area));
}

/** 적재 단위별 합계. 적재율은 최대·현재 수량이 모두 있는 랙(known)만으로 계산한다(미확인 수량은 0으로 보지 않음). */
export function unitTotals(racks) {
  const map = {};
  for (const o of racks) {
    const t = map[o.unit] || (map[o.unit] = { capacity: 0, quantity: 0, validCapacity: 0, validQuantity: 0, known: 0, total: 0, capacityKnown: 0 });
    t.total++;
    if (o.capacity > 0) {
      t.capacity += o.capacity;
      t.capacityKnown++;
    }
    if (ratio(o) !== null) {
      t.validCapacity += o.capacity;
      t.validQuantity += o.quantity;
      t.known++;
      t.quantity += o.quantity;
    }
  }
  return map;
}

/**
 * 배치 통계: 창고 면적, 랙 수·면적·점유율, 보관 불가(벽·기둥·보관 불가·문) 면적, 통로·작업 면적, 잔여 면적, 단위별 적재, 공간 경고.
 * 구역 지표끼리는 겹칠 수 있고, 잔여 면적만 전체 합집합을 뺀다.
 */
export function metrics(layout, project, { warnings: ws } = {}) {
  const w = layout.warehouse;
  const r = layout.objects.filter((o) => o.kind === 'rack');
  const area = w.width * w.height;
  const rackArea = r.reduce((a, o) => a + o.width * o.depth, 0);
  return {
    area,
    racks: r.length,
    rackArea,
    footprint: (rackArea / area) * 100,
    unavailable: unionArea(layout.objects.filter((o) => ['wall', 'column', 'blocked', 'door'].includes(o.kind)), w.width, w.height),
    aisles: unionArea(layout.objects.filter((o) => ['aisle', 'work'].includes(o.kind)), w.width, w.height),
    remaining: area - unionArea(layout.objects, w.width, w.height),
    units: unitTotals(r),
    warnings: ws ?? warnings(layout, project),
  };
}
