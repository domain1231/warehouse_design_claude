// 공간 경고와 배치 검사.
//
// warnings(layout, project): 기준본 최종 warnings = 50(통로 유효 폭) ∘ 40(외벽·내부 벽 이격) ∘ 10(경계·통로·적재·천장·충돌·간격).
// scanLayout(layout, project): 기준본 W.scan(90, 열 우선이 아닌 배치). 경고를 랙별 이슈·집계로 바꾸고
//   이격 경고의 중복 제거·거리 상세(BUG-SCAN-001 수정 포함), 배치 규칙(autoPlacementRules)의 설계 간격 검사를 더한다.
// 기준본은 전역 P를 읽었다. 재구축본은 project를 명시적으로 받는다(project.settings.minGap, locationLayout.wallGap, aisleRules).
// 경고 문구·순서까지 Golden Master G2와 일치해야 한다.
import { GEOMETRY_EPS_M as EPS } from '../geometry/tolerance.js';
import { bounds } from '../geometry/polygons.js';
import { overlaps, gap } from '../geometry/collision.js';
import { aisleClearance } from '../geometry/clearance.js';
import { formatNumber as fmt } from '../core/format.js';

/** 수량 적재율(%) = 현재 수량 / 최대 수량. 정보가 없으면 null. 높이 활용률과 섞지 않는다. */
export function ratio(o) {
  return o.capacity > 0 && o.quantity !== null && Number.isFinite(o.quantity) ? (o.quantity / o.capacity) * 100 : null;
}

const SOLID_PAIR_WITH_AISLE = ['wall', 'column', 'blocked'];

// [10] 기본 경고
function baseWarnings(layout, project) {
  const out = [];
  const os = layout.objects;
  const w = layout.warehouse;
  const boxes = new Map(os.map((o) => [o, bounds(o)]));
  const minGap = project.settings.minGap;
  const add = (key, text, ids, spatial = true) => out.push({ key, text, ids, spatial });
  for (const o of os) {
    const b = boxes.get(o);
    if (b.minX < -EPS || b.minY < -EPS || b.maxX > w.width + EPS || b.maxY > w.height + EPS) add(`boundary:${o.id}`, `${o.code} · 창고 경계 이탈`, [o.id]);
    if (o.kind === 'aisle') {
      const width = Math.min(o.width, o.depth);
      if (width + EPS < o.minWidth) add(`aisle-min:${o.id}`, `${o.code} · 폭 ${fmt(width)}m < 최소 ${fmt(o.minWidth)}m`, [o.id]);
      else if (width + EPS < o.targetWidth) add(`aisle-target:${o.id}`, `${o.code} · 목표 폭 ${fmt(o.targetWidth)}m 미달`, [o.id], false);
    }
    if (o.kind === 'rack') {
      if (ratio(o) > 100) add(`over:${o.id}`, `${o.code} · 적재율 ${fmt(ratio(o), 1)}% 초과`, [o.id], false);
      if (w.ceiling && o.height > w.ceiling + EPS) add(`height:${o.id}`, `${o.code} · 천장 높이 초과`, [o.id], false);
    }
  }
  for (let i = 0; i < os.length; i++) {
    for (let j = i + 1; j < os.length; j++) {
      const a = os[i];
      const b = os[j];
      const relevant = (a.kind === 'rack' && b.kind !== 'work') || (b.kind === 'rack' && a.kind !== 'work') || (a.kind === 'aisle' && SOLID_PAIR_WITH_AISLE.includes(b.kind)) || (b.kind === 'aisle' && SOLID_PAIR_WITH_AISLE.includes(a.kind));
      if (!relevant) continue;
      // 보수적 사전 제외: 회전 외곽 AABB 사이 거리가 검사 한계보다 확실히 크면 정밀 판정 생략(기준본 v2.3.7 성능 개선과 동일)
      const A = boxes.get(a);
      const B = boxes.get(b);
      const distance = Math.hypot(Math.max(0, A.minX - B.maxX, B.minX - A.maxX), Math.max(0, A.minY - B.maxY, B.minY - A.maxY));
      const limit = a.kind === 'rack' && b.kind === 'rack' ? Math.max(0, minGap) : 0;
      if (Number.isFinite(distance) && distance > limit + EPS) continue;
      if (overlaps(a, b)) {
        const why = a.kind === 'door' || b.kind === 'door' ? '출입문 개방 안전 구역 침범' : a.kind === 'aisle' || b.kind === 'aisle' ? '통로 침범' : '객체 충돌';
        add(`pair:${a.id}:${b.id}`, `${a.code} ↔ ${b.code} · ${why}`, [a.id, b.id]);
      } else if (a.kind === 'rack' && b.kind === 'rack' && minGap > 0) {
        const d = gap(a, b);
        if (d + EPS < minGap) add(`gap:${a.id}:${b.id}`, `${a.code} ↔ ${b.code} · 여유 ${fmt(d)}m < ${fmt(minGap)}m`, [a.id, b.id]);
      }
    }
  }
  return out;
}

const wallClearanceOf = (layout, project) => layout.wallGap ?? project.locationLayout?.wallGap ?? 0;

/** 공간 경고 목록 [{key, text, ids, spatial}]. spatial=false는 검토 경고(공간 판정에 영향 없음). */
export function warnings(layout, project) {
  // [40] 외벽·내부 벽 최소 이격
  const ws = baseWarnings(layout, project);
  const clear = wallClearanceOf(layout, project);
  if (clear > 0) {
    for (const o of layout.objects.filter((x) => x.kind === 'rack')) {
      const b = bounds(o);
      const w = layout.warehouse;
      if (Math.min(b.minX, b.minY, w.width - b.maxX, w.height - b.maxY) < clear - EPS && !ws.some((v) => v.key === `boundary:${o.id}`)) {
        ws.push({ key: `clearance:${o.id}`, text: `${o.code} · 외벽 최소 이격 ${fmt(clear)}m 미달`, ids: [o.id], spatial: true });
      }
      for (const wall of layout.objects.filter((x) => x.kind === 'wall')) {
        if (!overlaps(o, wall) && gap(o, wall) < clear - EPS) ws.push({ key: `wall-clearance:${o.id}:${wall.id}`, text: `${o.code} · 내부 벽 최소 이격 미달`, ids: [o.id, wall.id], spatial: true });
      }
    }
  }
  // [50] 통로는 단순 폭 대신 유효 폭(장애물 제외)으로 판정
  const results = layout.objects.filter((o) => o.kind === 'aisle').map((o) => aisleClearance(o, layout));
  const aisleIds = new Set(results.map((r) => r.id));
  const out = ws.filter((w) => {
    if (w.key.startsWith('aisle-min:') || w.key.startsWith('aisle-target:')) return false;
    if (w.key.startsWith('pair:') && w.ids.some((id) => aisleIds.has(id))) return false;
    return true;
  });
  for (const r of results) {
    if (!r.enabled) continue;
    const ids = [r.id, ...r.obstacles.map((o) => o.id)];
    if (r.width < r.min - EPS) out.push({ key: `aisle-effective:${r.id}`, text: `${r.code} · 통로 폭 부족 ${fmt(r.width, 3)}m / 최소 ${fmt(r.min)}m · 부족 ${fmt(r.shortage, 3)}m`, ids, spatial: true });
    else if (r.width < r.target - EPS) out.push({ key: `aisle-effective-target:${r.id}`, text: `${r.code} · 유효 폭 ${fmt(r.width, 3)}m / 목표 ${fmt(r.target)}m 미달`, ids, spatial: false });
    for (const o of r.obstacles) out.push({ key: `aisle-intrusion:${r.id}:${o.id}`, text: `${o.code} → ${r.code} · 보호 통로 침범 (유효 폭 ${fmt(r.width, 3)}m)`, ids: [r.id, o.id], spatial: true });
    if (r.doorId && r.connected !== true) out.push({ key: `aisle-door-link:${r.id}`, text: `${r.code} · 지정 출입문 개방 구역과 연결되지 않음`, ids: [r.id, r.doorId], spatial: true });
  }
  return out;
}

// ---------- 배치 검사 ----------

/** 기준본 W.hash: FNV-1a + djb2 결합 문자열 지문 */
export function hash(s) {
  let a = 2166136261;
  let b = 5381;
  for (let i = 0; i < s.length; i++) {
    a = Math.imul(a ^ s.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ s.charCodeAt(i);
  }
  return `${(a >>> 0).toString(16)}${(b >>> 0).toString(16)}:${s.length}`;
}

const geom = (o) => [o.x, o.y, o.width, o.depth, o.height, o.rotation];

/** 공간 판정에 영향을 주는 값만 담은 배치 지문(기준본 W.signature, 열 우선이 아닌 배치). */
export function layoutSignature(layout, project) {
  return hash(JSON.stringify([
    layout.warehouse,
    wallClearanceOf(layout, project),
    layout.autoPlacementRules,
    project.settings.minGap,
    project.aisleRules,
    layout.objects.map((o) => [o.id, o.code, o.kind, ...geom(o), o.vertices, o.minWidth, o.targetWidth, o.clearanceAxis, o.scopeIds, o.warningsEnabled, o.doorId, o.aisleType, o.placementMeta?.waiting]),
  ]));
}

function excess(o, layout) {
  const b = bounds(o);
  const w = layout.warehouse;
  return { left: Math.max(0, -b.minX) * 1e3, right: Math.max(0, b.maxX - w.width) * 1e3, top: Math.max(0, -b.minY) * 1e3, bottom: Math.max(0, b.maxY - w.height) * 1e3 };
}

const SIDE = { left: '좌', right: '우', top: '상', bottom: '하' };
function excessText(e) {
  return Object.entries(e).filter(([, v]) => v > EPS * 1e3).map(([k, v]) => `${SIDE[k]} ${fmt(v, 3)}mm`).join(' / ') || '경계 내부';
}

/**
 * 배치 검사 결과 { fingerprint, checkedAt, counts, rows, warnings, footprint, warehouseArea }.
 * counts.validInside: 경계 안이면서 어떤 공간 이슈도 없는 랙 수(수용률의 분자).
 * 열 우선 모드(autoPlacementRules.mode === 'column')의 확장 검사는 Phase 6에서 추가한다.
 */
export function scanLayout(layout, project, { now = () => new Date().toISOString() } = {}) {
  if (layout.autoPlacementRules?.mode === 'column') throw new Error('열 우선 모드 배치 검사는 아직 지원하지 않습니다(Phase 6).');
  const fingerprint = layoutSignature(layout, project);
  const ws = warnings(layout, project).map((w) => ({ ...w, ids: [...w.ids] }));
  const racks = layout.objects.filter((o) => o.kind === 'rack');
  const map = new Map(layout.objects.map((o) => [o.id, o]));
  const rows = racks.map((o) => ({ id: o.id, code: o.code, excess: excess(o, layout), issues: [], waiting: !!o.placementMeta?.waiting }));
  const by = new Map(rows.map((r) => [r.id, r]));
  const counts = { total: racks.length, inside: 0, validInside: 0, boundary: 0, rackCollision: 0, structureCollision: 0, aisle: 0, gap: 0, waiting: 0 };
  const clearances = new Map();
  const outerDistance = (o) => {
    const b = bounds(o);
    return Math.min(b.minX, b.minY, layout.warehouse.width - b.maxX, layout.warehouse.height - b.maxY);
  };
  const targetsOf = (ids, id) => ids.filter((x) => x !== id).map((x) => ({ id: x, code: map.get(x)?.code || x }));
  const addClearance = (w, rule, actualDistance, requiredDistance) => {
    const identity = JSON.stringify([rule, [...w.ids].sort()]);
    const prior = clearances.get(identity);
    if (prior && prior.requiredDistance >= requiredDistance) return;
    const detail = { rule, actualDistance, requiredDistance, shortfall: Math.max(0, requiredDistance - actualDistance) };
    const text = `${w.text} · 기준 ${fmt(requiredDistance, 3)}m / 실제 ${fmt(actualDistance, 3)}m / 부족 ${fmt(detail.shortfall, 3)}m`;
    if (prior) {
      Object.assign(prior, detail);
      for (const i of prior.issues) Object.assign(i, detail, { text });
      return;
    }
    const issues = [];
    for (const id of w.ids) {
      const r = by.get(id);
      if (r) {
        const issue = { type: 'gap', key: w.key, text, targets: targetsOf(w.ids, id), blocking: w.spatial !== false, rackId: id, rackCode: r.code, ...detail };
        r.issues.push(issue);
        issues.push(issue);
      }
    }
    if (issues.length) {
      counts.gap++;
      clearances.set(identity, { ...detail, issues });
    }
  };

  const required = wallClearanceOf(layout, project);
  for (const w of ws) {
    if (w.key.startsWith('wall-clearance:')) {
      const rack = w.ids.map((id) => map.get(id)).find((o) => o?.kind === 'rack');
      const wall = w.ids.map((id) => map.get(id)).find((o) => o?.kind === 'wall');
      if (rack && wall) addClearance(w, 'wallClearance', gap(rack, wall), required);
      continue;
    }
    if (w.key.startsWith('clearance:')) {
      const rack = map.get(w.ids[0]);
      if (rack?.kind === 'rack') addClearance(w, 'outerWallClearance', outerDistance(rack), required);
      continue;
    }
    let type = 'other';
    if (w.key.startsWith('boundary:')) type = 'boundary';
    else if (w.key.startsWith('gap:')) type = 'gap';
    else if (w.key.startsWith('aisle-')) type = 'aisle';
    else if (w.key.startsWith('pair:')) type = w.ids.some((id) => map.get(id)?.kind === 'aisle') ? 'aisle' : w.ids.every((id) => map.get(id)?.kind === 'rack') ? 'rackCollision' : 'structureCollision';
    if (type === 'other') continue;
    if (type !== 'boundary') counts[type]++;
    for (const id of w.ids) {
      const r = by.get(id);
      if (r) r.issues.push({ type, key: w.key, text: w.text, targets: targetsOf(w.ids, id), blocking: w.spatial !== false });
    }
  }

  const cfg = layout.autoPlacementRules;
  if (cfg) {
    for (const o of racks) {
      const b = bounds(o);
      const g = cfg.wallGap;
      if (b.minX >= -EPS && b.minY >= -EPS && b.maxX <= layout.warehouse.width + EPS && b.maxY <= layout.warehouse.height + EPS && outerDistance(o) + EPS < g) {
        addClearance({ key: `wall-gap:${o.id}`, text: '외벽 최소 이격 미달', ids: [o.id], spatial: true }, 'outerWallClearance', outerDistance(o), g);
      }
    }
    for (let i = 0; i < racks.length; i++) {
      for (let j = i + 1; j < racks.length; j++) {
        const a = racks[i];
        const b = racks[j];
        if (overlaps(a, b)) continue;
        const need = Math.max(project.settings.minGap || 0, cfg.rackGap, a.excel?.column !== b.excel?.column ? cfg.columnGap : 0, cfg.mode === 'aisle' ? cfg.aisleTarget : 0);
        if (gap(a, b) + EPS < need && !by.get(a.id).issues.some((v) => v.type === 'gap' && v.targets.some((t) => t.id === b.id))) {
          const key = `design-gap:${a.id}:${b.id}`;
          for (const [o, t] of [[a, b], [b, a]]) by.get(o.id).issues.push({ type: 'gap', key, text: `지정 랙/열 간격 ${fmt(need, 3)}m 미달`, targets: [{ id: t.id, code: t.code }], blocking: true });
          counts.gap++;
        }
      }
    }
  }

  for (const r of rows) {
    if (Object.values(r.excess).some((v) => v > EPS * 1e3)) {
      counts.boundary++;
      if (!r.issues.some((v) => v.type === 'boundary')) r.issues.push({ type: 'boundary', key: `boundary:${r.id}`, text: excessText(r.excess), targets: [], blocking: true });
    } else counts.inside++;
    if (r.waiting) {
      counts.waiting++;
      r.issues.push({ type: 'waiting', key: `waiting:${r.id}`, text: '외부 대기 · 실제 창고 구역 아님', targets: [], blocking: true });
    }
    if (!r.issues.length) counts.validInside++;
  }

  return {
    fingerprint,
    checkedAt: now(),
    counts,
    rows,
    warnings: ws,
    footprint: racks.reduce((s, o) => s + o.width * o.depth, 0),
    warehouseArea: layout.warehouse.width * layout.warehouse.height,
  };
}
