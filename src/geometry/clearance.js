// 보호 통로 유효 폭 계산. 기준본 v2.4.1 50-editor M.clearance(및 toLocal/toWorld/intersection/sections/sliceFree)와 같다.
// 통로를 통로 길이 방향으로 잘라, 침범한 장애물(랙·벽·기둥·보관불가)을 뺀 남은 폭의 최소값을 구한다.
import { GEOMETRY_EPS_M as EPS } from './tolerance.js';
import { polygon, intersection } from './polygons.js';
import { overlaps, gap } from './collision.js';

function toLocal(o, p) {
  const a = (-o.rotation * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const x = p[0] - o.x - o.width / 2;
  const y = p[1] - o.y - o.depth / 2;
  return [o.width / 2 + x * c - y * s, o.depth / 2 + x * s + y * c];
}

function toWorld(o, p) {
  const a = (o.rotation * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const x = p[0] - o.width / 2;
  const y = p[1] - o.depth / 2;
  return [o.x + o.width / 2 + x * c - y * s, o.y + o.depth / 2 + x * s + y * c];
}

function sections(poly, t, axis) {
  const ci = axis === 'x' ? 0 : 1;
  const ti = 1 - ci;
  const lines = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if ((a[ti] <= t && b[ti] > t) || (b[ti] <= t && a[ti] > t)) {
      const slope = (b[ci] - a[ci]) / (b[ti] - a[ti]);
      lines.push({ a: slope, b: a[ci] - slope * a[ti] });
    }
  }
  lines.sort((a, b) => (a.a - b.a) * t + a.b - b.b);
  const out = [];
  for (let i = 0; i + 1 < lines.length; i += 2) out.push({ lo: lines[i], hi: lines[i + 1] });
  return out;
}

function sliceFree(aisle, blocks, t, axis) {
  let free = sections(aisle, t, axis);
  const at = (l) => l.a * t + l.b;
  for (const poly of blocks) {
    for (const blocked of sections(poly, t, axis)) {
      const next = [];
      for (const f of free) {
        if (at(blocked.hi) <= at(f.lo) + EPS || at(blocked.lo) >= at(f.hi) - EPS) next.push(f);
        else {
          if (at(blocked.lo) > at(f.lo) + EPS) next.push({ lo: f.lo, hi: blocked.lo });
          if (at(blocked.hi) < at(f.hi) - EPS) next.push({ lo: blocked.hi, hi: f.hi });
        }
      }
      free = next;
    }
  }
  return free;
}

/** 통로 o의 유효 폭과 침범 장애물. */
export function aisleClearance(o, layout) {
  const axis = o.clearanceAxis && o.clearanceAxis !== 'auto' ? o.clearanceAxis : o.width <= o.depth ? 'x' : 'y';
  const aisle = polygon(o).map((p) => toLocal(o, p));
  const ti = axis === 'x' ? 1 : 0;
  const scope = o.scopeIds?.length ? new Set(o.scopeIds) : null;
  const obs = layout.objects.filter((x) => ['rack', 'wall', 'column', 'blocked'].includes(x.kind) && (!scope || x.kind !== 'rack' || scope.has(x.id)) && overlaps(o, x));
  const blocks = obs.map((x) => polygon(x).map((p) => toLocal(o, p)));
  const all = [aisle, ...blocks];
  const edges = [];
  const cuts = aisle.map((p) => p[ti]);
  const lo = Math.min(...cuts);
  const hi = Math.max(...cuts);
  for (const p of all) {
    for (let i = 0; i < p.length; i++) {
      edges.push([p[i], p[(i + 1) % p.length]]);
      if (p[i][ti] > lo && p[i][ti] < hi) cuts.push(p[i][ti]);
    }
  }
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const v = intersection(...edges[i], ...edges[j]);
      if (v && v[ti] > lo && v[ti] < hi) cuts.push(v[ti]);
    }
  }
  const sorted = [...new Set(cuts.map((v) => Math.round(v * 1e9) / 1e9))].sort((a, b) => a - b);
  let best = Infinity;
  let line = null;
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    if (b - a < EPS) continue;
    const free = sliceFree(aisle, blocks, (a + b) / 2, axis);
    const functions = free.map((f) => ({ a: f.hi.a - f.lo.a, b: f.hi.b - f.lo.b, f }));
    const test = [a, b];
    for (let j = 0; j < functions.length; j++) {
      for (let k = j + 1; k < functions.length; k++) {
        const u = functions[j];
        const v = functions[k];
        if (Math.abs(u.a - v.a) > 1e-12) {
          const t = (v.b - u.b) / (u.a - v.a);
          if (t > a && t < b) test.push(t);
        }
      }
    }
    for (const t of test) {
      const values = functions.map((f) => Math.max(0, f.a * t + f.b));
      const width = values.length ? Math.max(...values) : 0;
      if (width < best) {
        best = width;
        const ix = values.indexOf(width);
        const f = functions[ix]?.f;
        let start = f ? f.lo.a * t + f.lo.b : 0;
        let end = f ? f.hi.a * t + f.hi.b : 0;
        if (!f) {
          const section = sections(aisle, (a + b) / 2, axis)[0];
          if (section) start = end = (section.lo.a * t + section.lo.b + section.hi.a * t + section.hi.b) / 2;
        }
        line = axis === 'x' ? [[start, t], [end, t]] : [[t, start], [t, end]];
      }
    }
  }
  if (!Number.isFinite(best)) best = 0;
  const min = o.minWidth;
  const target = o.targetWidth;
  const enabled = o.warningsEnabled !== false;
  const door = o.linkedDoorId ? layout.objects.find((d) => d.id === o.linkedDoorId && d.kind === 'door') : null;
  const connected = door ? overlaps(o, door) || gap(o, door) < EPS : null;
  return {
    id: o.id, code: o.code, axis, width: best, min, target,
    shortage: Math.max(0, min - best), targetShortage: Math.max(0, target - best),
    obstacles: obs.map((x) => ({ id: x.id, code: x.code })), enabled, partial: !!scope, connected,
    doorId: o.linkedDoorId || null, line: line?.map((p) => toWorld(o, p)),
    severity: !enabled ? 'disabled' : best < min - EPS || obs.length ? 'bad' : best < target - EPS ? 'target' : 'ok',
  };
}
