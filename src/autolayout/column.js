// 열 우선 최대 수용 배치(기준본 92 column-layout: C.* + W.fits·W.scan·W.signature·W.base·W.pack·W.build·EX.generate 래퍼). DOM 없음.
// 결정성: 기준본은 전체 후보 공통 탐색 시간 상한(1.5초, 'time-bound')으로도 탐색을 끊었다. 재구축은 AGENTS.md에 따라
// 탐색 예산(probe 24000·시작점 64·오프셋 12·후보 8)으로만 끊고, 걸린 시간은 표시용으로만 기록한다(D-023).
import { bounds, polygon } from '../geometry/polygons.js';
import { overlaps, gap } from '../geometry/collision.js';
import { GEOMETRY_EPS_M as EPS, roundMm } from '../geometry/tolerance.js';
import { formatNumber as fmt } from '../core/format.js';
import { validateColumnOptions } from '../core/project.js';
import { parseExcelLocation } from '../excel/analyze.js';
import { buildProposal, rackKey } from '../excel/proposal.js';
import { scanLayout, layoutSignature, hash, registerColumnScanner } from '../warehouse/constraints.js';
import { fitsInside, makeCandidate, placementChanged } from './candidates.js';

export const COLUMN_LIMITS = Object.freeze({ maxCandidates: 8, maxStarts: 64, maxOffsets: 12, maxProbes: 24000 });
const clone = (v) => (v === undefined ? undefined : structuredClone(v));
const sortKey = (a, b) => String(a).localeCompare(String(b), 'en', { numeric: true });
const isPlain = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
/** 탐색 진단(배치 객체 → { anchors, reasons, fatal, search }). 기준본 C.diagnostics. */
const diagnostics = new WeakMap();

/** 기준본 C.strategies. */
export function columnStrategies(allowWrap) {
  const s = [['열 우선 · 북쪽 시작', 'north'], ['열 우선 · 남쪽 시작점 탐색', 'south'], ['열 우선 · 지정 원점 근처', 'origin'], ['열 우선 · 반대쪽 시작점 탐색', 'far']];
  return allowWrap ? s.concat(s.map(([name, k]) => [name + ' · 열 줄바꿈', k + '-wrap'])) : s;
}

/** 기준본 C.checkSettings(+C.extend). */
export function checkColumnSettings(s) {
  if (isPlain(s)) {
    if (s.allowWrap === undefined) s.allowWrap = false;
    if (s.externalDirection === undefined) s.externalDirection = 'right';
  }
  if (!isPlain(s) || typeof s.allowWrap !== 'boolean' || s.externalDirection !== 'right') throw new Error('열 배치 설정 오류 · 외부 방향은 오른쪽만 지원합니다.');
}

function finite(v, name, min = 0, max = 1e7) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new Error(name + ' 값이 올바르지 않습니다.');
  return v;
}

/** 기준본 C.options: Excel 설정 → 열 배치 기준(columnOptions). */
export function columnOptions(c) {
  const first = {};
  for (const [k, v] of Object.entries(c.perColumnSettings || {})) {
    if (!isPlain(v)) throw new Error('열별 설정 형식 오류');
    for (const n of ['x', 'y']) if (v[n] !== undefined) finite(v[n], n, -1000, 1000);
    if (v.rotation !== undefined) finite(v.rotation, '열 회전', -36000, 36000);
    if (v.first !== undefined) {
      if (!['north', 'south'].includes(v.first)) throw new Error('열별 진행 방향 오류');
      first[k] = v.first;
    }
  }
  return validateColumnOptions({ allowWrap: c.autoPlacement.allowWrap ?? false, keepManual: c.autoPlacement.keepManual, allowRotation: c.autoPlacement.allowRotation, externalDirection: c.autoPlacement.externalDirection ?? 'right', northRotation: c.northRotation, columnDirection: c.columnDirection, firstRackPosition: c.firstRackPosition, order: c.order || '', first });
}

const DEFAULT_OPTIONS = () => ({ allowWrap: false, keepManual: true, allowRotation: false, externalDirection: 'right', northRotation: 0, columnDirection: 'east', firstRackPosition: 'north', order: '', first: {} });
const optsOf = (l) => l.autoPlacementRules?.columnOptions || DEFAULT_OPTIONS();

/** 기준본 C.key: Excel 건물·층·열 묶음 키(Excel이 없으면 객체별). */
export const groupKey = (o) => (o.excel ? JSON.stringify([String(o.excel.building || ''), String(o.excel.floor || ''), String(o.excel.column || '')]) : JSON.stringify(['', '', '@' + o.id]));
/** 기준본 C.number. */
export function rackNumber(o) {
  const n = o.excel?.rackNumber;
  if (Number.isSafeInteger(n) && n > 0) return n;
  return parseExcelLocation(String(o.excel?.key || '') + '-1-1')?.rackNumber ?? Number.MAX_SAFE_INTEGER;
}

/** 기준본 C.groups: 건물·층·사용자 열 순서·열 이름 순, 그룹 안은 랙 번호·코드·ID 순. */
export function columnGroups(objects, opt) {
  const map = new Map();
  for (const o of objects) {
    if (o.kind !== 'rack') continue;
    const key = groupKey(o);
    if (!map.has(key)) map.set(key, { key, building: String(o.excel?.building || ''), floor: String(o.excel?.floor || ''), column: String(o.excel?.column || o.code), racks: [] });
    map.get(key).racks.push(o);
  }
  const order = opt.order.toUpperCase().split(/[\s,]+/).filter(Boolean), rank = new Map(order.map((x, i) => [x, i]));
  const groups = [...map.values()].sort((a, b) => sortKey(a.building, b.building) || sortKey(a.floor, b.floor) || (rank.get(a.column) ?? 1e9) - (rank.get(b.column) ?? 1e9) || sortKey(a.column, b.column) || sortKey(a.key, b.key));
  for (const g of groups) g.racks.sort((a, b) => rackNumber(a) - rackNumber(b) || sortKey(a.code, b.code) || sortKey(a.id, b.id));
  return groups;
}

/** 기준본 C.axes: 열 진행 방향 E, 열 안 번호 진행 방향 D. */
function axes(opt, col) {
  const a = (opt.northRotation * Math.PI) / 180, cs = Math.round(Math.cos(a)), sn = Math.round(Math.sin(a)), east = opt.columnDirection === 'east' ? 1 : -1;
  const first = opt.first[col] || opt.firstRackPosition, south = first === 'north' ? 1 : -1;
  return { E: [cs * east, sn * east], D: [-sn * south, cs * south], first };
}
function projectOn(o, u) {
  const vs = polygon(o).map((p) => p[0] * u[0] + p[1] * u[1]);
  return { min: Math.min(...vs), max: Math.max(...vs) };
}
function room(l, u) {
  const vs = [[0, 0], [l.warehouse.width, 0], [0, l.warehouse.height], [l.warehouse.width, l.warehouse.height]].map((p) => p[0] * u[0] + p[1] * u[1]);
  return { min: Math.min(...vs), max: Math.max(...vs) };
}
export function insideWarehouse(o, l) {
  const b = bounds(o), w = l.warehouse;
  return b.minX >= -EPS && b.minY >= -EPS && b.maxX <= w.width + EPS && b.maxY <= w.height + EPS;
}
export function representable(o) {
  const b = bounds(o);
  return [o.x, o.y, b.minX, b.minY, b.maxX, b.maxY].every((v) => Number.isFinite(v) && v >= -1000 && v <= 1000);
}
/** 기준본 C.required: 다른 Excel 열 사이는 열 간격·통로 목표 중 큰 값. */
function requiredGap(a, b, r, project) {
  if (b.kind === 'rack') return Math.max(project.settings.minGap || 0, r.rackGap, groupKey(a) !== groupKey(b) ? Math.max(r.columnGap, r.aisleTarget) : 0);
  return b.kind === 'aisle' || b.kind === 'work' ? 0 : r.wallGap;
}
const groupGap = (r, project) => Math.max(project.settings.minGap || 0, r.rackGap, r.columnGap, r.aisleTarget);
function identity(o) {
  const v = { ...o };
  delete v.x;
  delete v.y;
  delete v.rotation;
  delete v.placementMeta;
  return JSON.stringify(v);
}
const copyLayout = (l) => ({ ...l, warehouse: { ...l.warehouse }, objects: l.objects.map((o) => ({ ...o, placementMeta: o.placementMeta ? { ...o.placementMeta } : undefined })) });
function at(o, minX, minY) {
  const b = bounds({ ...o, x: 0, y: 0 });
  o.x = roundMm(minX - b.minX);
  o.y = roundMm(minY - b.minY);
  return o;
}

/** 기준본 C.index: 격자 버킷 공간 색인(아주 큰 객체는 별도 목록). 작업 구역은 넣지 않는다. */
function spatialIndex(l, objects = []) {
  const cell = Math.max(2, Math.max(l.warehouse.width, l.warehouse.height) / 32), buckets = new Map(), large = [], all = [];
  const range = (b) => [Math.floor(b.minX / cell), Math.floor(b.maxX / cell), Math.floor(b.minY / cell), Math.floor(b.maxY / cell)];
  const api = {
    add(o) {
      if (o.kind === 'work') return;
      all.push(o);
      const [x0, x1, y0, y1] = range(bounds(o));
      if ((x1 - x0 + 1) * (y1 - y0 + 1) > 512) {
        large.push(o);
        return;
      }
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        const k = x + ',' + y;
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push(o);
      }
    },
    query(o, pad = 0) {
      const b = bounds(o), [x0, x1, y0, y1] = range({ minX: b.minX - pad, maxX: b.maxX + pad, minY: b.minY - pad, maxY: b.maxY + pad });
      if ((x1 - x0 + 1) * (y1 - y0 + 1) > 512) return all;
      const out = new Set(large);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (const v of buckets.get(x + ',' + y) || []) out.add(v);
      return [...out];
    },
  };
  for (const o of objects) api.add(o);
  return api;
}

/** 탐색 예산(후보 생성 1회 공통). 시간 상한은 두지 않는다. */
export const startRun = () => ({ started: nowMs(), probes: 0, starts: 0, candidates: 0, stopReason: '' });
function check(run) {
  if (run.stopReason) return false;
  if (run.probes >= COLUMN_LIMITS.maxProbes) run.stopReason = 'probe-bound';
  return !run.stopReason;
}
export const stopText = (s) => ({ 'probe-bound': '전체 후보 공통 탐색 횟수 상한', 'time-bound': '전체 후보 공통 탐색 시간 상한' })[s] || '지정 후보 범위에서 위치 미발견';

/** 기준본 92 W.fits(열 우선): 표현 범위·천장 + 90 W.fits + 열 기준 이격. */
function fitsColumn(o, l, placed, c, project) {
  if (!representable(o) || (l.warehouse.ceiling && o.height > l.warehouse.ceiling + EPS)) return false;
  if (!fitsInside(o, l, placed, c, project)) return false;
  const r = l.autoPlacementRules;
  for (const b of placed) {
    if (b.kind === 'work') continue;
    const required = requiredGap(o, b, r, project), A = bounds(o), B = bounds(b);
    if (A.maxX + required <= B.minX + EPS || A.minX - required >= B.maxX - EPS || A.maxY + required <= B.minY + EPS || A.minY - required >= B.maxY - EPS) continue;
    if (overlaps(o, b) || (required && gap(o, b) + EPS < required)) return false;
  }
  return true;
}
function observe(o, l, near, c, set, project) {
  const b = bounds(o), w = l.warehouse;
  if (b.minX < c.wallGap - EPS || b.minY < c.wallGap - EPS || b.maxX > w.width - c.wallGap + EPS || b.maxY > w.height - c.wallGap + EPS) set.add('경계·벽 이격');
  if (w.ceiling && o.height > w.ceiling + EPS) set.add('천장 높이');
  for (const p of near) {
    if (p.kind === 'work') continue;
    const req = requiredGap(o, p, l.autoPlacementRules, project), A = bounds(p);
    if (b.maxX + req <= A.minX + EPS || b.minX - req >= A.maxX - EPS || b.maxY + req <= A.minY + EPS || b.minY - req >= A.maxY - EPS) continue;
    if (overlaps(o, p) || (req && gap(o, p) + EPS < req)) set.add(p.kind === 'rack' ? '다른 랙·이격' : p.kind === 'aisle' ? '보호 통로' : '구조물·이격');
  }
}
function probe(o, l, index, local, c, observed, run, project) {
  if (!check(run)) return false;
  run.probes++;
  const pad = Math.max(c.wallGap, groupGap(l.autoPlacementRules, project)), near = [...index.query(o, pad), ...local.query(o, pad)];
  if (fitsColumn(o, l, near, c, project)) return true;
  observe(o, l, near, c, observed, project);
  return false;
}
function sizeImpossible(o, l, opt) {
  if (l.warehouse.ceiling && o.height > l.warehouse.ceiling + EPS) return true;
  const r = l.autoPlacementRules, g = r.wallGap, w = l.warehouse.width - 2 * g, h = l.warehouse.height - 2 * g;
  return [o.rotation, ...(opt.allowRotation ? [o.rotation + 90] : [])].every((rotation) => {
    const b = bounds({ ...o, x: 0, y: 0, rotation });
    return b.maxX - b.minX > w + EPS || b.maxY - b.minY > h + EPS;
  });
}

/** 기준본 92 W.signature: 열 우선 배치는 보호·묶음 정보와 탐색 진단까지 지문에 넣는다. */
export function columnSignature(l, project) {
  return hash(JSON.stringify([layoutSignature(l, project), l.objects.filter((o) => o.kind === 'rack').map((o) => [o.id, groupKey(o), rackNumber(o), o.placementMeta]), diagnosticOf(l)]));
}
const diagnosticOf = (l) => {
  const d = diagnostics.get(l);
  if (!d) return null;
  const { elapsedMs, ...search } = d.search; // 걸린 시간은 표시용(지문·결정성에서 제외)
  return { ...d, search };
};
function issue(row, type, key, text, targets = [], blocking = true) {
  if (!row.issues.some((i) => i.key === key)) row.issues.push({ type, key, text, targets, blocking });
}

/** 기준본 C.enrich: 기본 배치 검사에 열 조건(연속 접두부·정렬·번호 진행·열 분리)·외부 대기 사유를 더한다. */
function enrich(l, p, r) {
  const rules = l.autoPlacementRules, opt = optsOf(l), diag = diagnostics.get(l), rows = new Map(r.rows.map((v) => [v.id, v])), racks = l.objects.filter((o) => o.kind === 'rack'), objects = new Map(l.objects.map((o) => [o.id, o])), index = spatialIndex(l, l.objects), seen = new Set();
  const addGap = (a, b, required, actual) => {
    const A = rows.get(a.id), B = rows.get(b.id), key = 'column-gap:' + JSON.stringify([a.id, b.id].sort()), text = '지정 이격 ' + fmt(required, 3) + 'm / 실제 ' + fmt(actual, 3) + 'm / 부족 ' + fmt(required - actual, 3) + 'm';
    const existing = A.issues.find((i) => i.type === 'gap' && i.targets.some((t) => t.id === b.id));
    if (existing) {
      existing.text = text;
      for (const i of B?.issues || []) if (i.type === 'gap' && i.targets.some((t) => t.id === a.id)) i.text = text;
      return;
    }
    issue(A, 'gap', key, text, [{ id: b.id, code: b.code }]);
    if (B) issue(B, 'gap', key, text, [{ id: a.id, code: a.code }]);
    r.counts.gap++;
  };
  for (const o of racks) {
    const row = rows.get(o.id), b = bounds(o), inside = insideWarehouse(o, l);
    row.waiting = !inside || !!o.placementMeta?.waiting;
    row.protected = !!o.placementMeta?.positionLocked || (opt.keepManual && o.placementMeta?.manualEdited !== false) || !!diag?.anchors.includes(o.id);
    row.columnGroup = groupKey(o);
    if (!representable(o)) issue(row, 'column', 'column-coordinate:' + o.id, '앵커 또는 회전 외곽이 좌표 범위 -1000~1000m를 벗어납니다.');
    if (inside && o.placementMeta?.waiting) issue(row, 'column', 'column-waiting-inside:' + o.id, '내부 좌표와 외부 대기 상태가 일치하지 않습니다.');
    if (inside && l.warehouse.ceiling && o.height > l.warehouse.ceiling + EPS) issue(row, 'column', 'column-height:' + o.id, '천장 높이를 초과합니다.');
    if (inside && Math.min(b.minX, b.minY, l.warehouse.width - b.maxX, l.warehouse.height - b.maxY) + EPS < rules.wallGap && !row.issues.some((i) => i.rule === 'outerWallClearance')) {
      issue(row, 'gap', 'column-wall:' + o.id, '외벽 최소 이격 ' + fmt(rules.wallGap, 3) + 'm 미달');
      r.counts.gap++;
    }
    if (!inside && !row.protected && b.minX < l.warehouse.width - EPS) issue(row, 'column', 'column-external-side:' + o.id, (row.protected ? '보호된 외부 좌표 제약 · ' : '') + '첫 버전 외부 대기는 창고 오른쪽만 지원합니다.');
    for (const other of index.query(o, Math.max(rules.wallGap, groupGap(rules, p)))) {
      if (other.id === o.id || other.kind === 'work') continue;
      const pair = JSON.stringify([o.id, other.id].sort());
      if (seen.has(pair)) continue;
      seen.add(pair);
      const required = requiredGap(o, other, rules, p);
      if (!required || overlaps(o, other)) continue;
      const B = bounds(other), lower = Math.hypot(Math.max(0, b.minX - B.maxX, B.minX - b.maxX), Math.max(0, b.minY - B.maxY, B.minY - b.maxY));
      if (lower + EPS >= required) continue;
      const actual = gap(o, other);
      if (actual + EPS < required) addGap(o, other, required, actual);
    }
  }
  const groups = columnGroups(racks, opt), groupRows = [];
  let priorInside = null, priorOutside = null;
  for (const g of groups) {
    const ax = axes(opt, g.column), inside = g.racks.filter((o) => insideWarehouse(o, l) && !o.placementMeta?.waiting), outside = g.racks.filter((o) => !insideWarehouse(o, l) || o.placementMeta?.waiting);
    const mark = (os, key, text) => {
      for (const o of os) issue(rows.get(o.id), 'column', key, text);
    };
    let outsideSeen = false;
    for (const o of g.racks) {
      if (outside.includes(o)) outsideSeen = true;
      else if (outsideSeen) mark([o], 'column-prefix:' + g.key, '열 번호의 연속 내부 접두부 조건 위반' + (g.racks.some((x) => rows.get(x.id).protected) ? ' · 보호 랙 제약 포함' : ''));
    }
    const lineCheck = (os, external) => {
      let line = null, previous = null;
      for (const o of os) {
        const U = external ? { min: bounds(o).minX, max: bounds(o).maxX } : projectOn(o, ax.E);
        const D = external ? (ax.first === 'north' ? { min: bounds(o).minY, max: bounds(o).maxY } : { min: -bounds(o).maxY, max: -bounds(o).minY }) : projectOn(o, ax.D);
        if (!line) line = { u: U.min, maxU: U.max };
        else if (Math.abs(U.min - line.u) > 0.002) {
          if (!opt.allowWrap || U.min + EPS < line.maxU + groupGap(rules, p)) {
            mark(os, 'column-line:' + g.key + ':' + external, '열 연속 정렬 조건 위반' + (os.some((x) => rows.get(x.id).protected) ? ' · 보호 좌표 제약' : ''));
            break;
          }
          line = { u: U.min, maxU: U.max };
          previous = null;
        }
        line.maxU = Math.max(line.maxU, U.max);
        if (previous && D.min + EPS < previous.max + Math.max(p.settings.minGap || 0, rules.rackGap)) {
          mark(os, 'column-number:' + g.key + ':' + external, '열 내부 랙 번호 진행·이격 조건 위반');
          break;
        }
        previous = D;
      }
    };
    lineCheck(inside, false);
    lineCheck(outside, true);
    if (inside.length) {
      const ps = inside.map((o) => projectOn(o, ax.E)), band = { min: Math.min(...ps.map((v) => v.min)), max: Math.max(...ps.map((v) => v.max)) };
      if (priorInside && band.min + EPS < priorInside.max + groupGap(rules, p)) mark([...priorInside.racks, ...inside], 'column-group:' + g.key, '서로 다른 Excel 열의 순서·분리 조건 위반 · 보호 랙 포함 여부를 확인하세요.');
      priorInside = { ...band, racks: inside };
    }
    if (outside.length) {
      const bs = outside.map(bounds), band = { min: Math.min(...bs.map((v) => v.minX)), max: Math.max(...bs.map((v) => v.maxX)) };
      if (priorOutside && band.min + EPS < priorOutside.max + groupGap(rules, p)) mark([...priorOutside.racks, ...outside], 'column-outside-group:' + g.key, '외부 대기 열 그룹 순서·분리 조건 위반 · 보호 좌표 제약 포함 가능');
      priorOutside = { ...band, racks: outside };
    }
    groupRows.push({ key: g.key, label: [g.building, g.floor, g.column + '열'].filter(Boolean).join(' / '), total: g.racks.length, inside: inside.length, outside: outside.length, protected: g.racks.filter((o) => rows.get(o.id).protected).length });
  }
  const failures = [], globalAisles = new Set();
  for (const warning of r.warnings || []) {
    if (!String(warning.key || '').startsWith('aisle-') || warning.spatial === false || (warning.ids || []).some((id) => rows.has(id))) continue;
    const aisles = (warning.ids || []).map((id) => objects.get(id)).filter((o) => o?.kind === 'aisle');
    if (!aisles.length || globalAisles.has(warning.key)) continue;
    globalAisles.add(warning.key);
    failures.push({ id: aisles[0].id, ids: [...warning.ids], key: warning.key, text: warning.text });
    for (const o of racks) {
      if (!insideWarehouse(o, l)) continue;
      const affected = aisles.filter((a) => !a.scopeIds?.length || a.scopeIds.includes(o.id));
      if (affected.length) issue(rows.get(o.id), 'aisle', warning.key, warning.text, affected.map((a) => ({ id: a.id, code: a.code })));
    }
  }
  for (const row of r.rows) {
    const o = objects.get(row.id), inside = insideWarehouse(o, l), evidence = diag?.reasons[row.id];
    if (row.waiting) {
      row.reason = row.protected ? '수동·잠금·대상 범위 보호로 이동하지 않음' : sizeImpossible(o, l, opt) ? '현재 벽 이격·허용 회전에서 단일 랙 외곽/높이 수용 불가 확인' : evidence?.stop === 'time-bound' ? '탐색 시간 제한 · 수용 불가의 수학적 증명 아님' : evidence?.stop === 'probe-bound' ? '탐색 횟수 상한 · 수용 불가의 수학적 증명 아님' : evidence ? '지정된 그룹 위치 후보에서 연속 접두부 위치 미발견' : '현재 좌표 재검사 · 이전 탐색 원인은 저장 결과로 추정하지 않음';
      if (evidence?.observed?.length) row.reason += ' · 탐색 중 관측: ' + evidence.observed.join(', ');
      issue(row, 'waiting', 'column-reason:' + row.id, row.reason, [], false);
    } else row.reason = row.protected ? '보호 좌표 유지 · 현재 공간·열 조건 재검사' : '현재 공간·열 조건 재검사';
    for (const i of row.issues) {
      const expectedOutside = !inside && ['boundary', 'waiting'].includes(i.type);
      if (!expectedOutside && i.blocking !== false && !globalAisles.has(i.key)) failures.push({ id: row.id, key: i.key, text: i.text });
    }
  }
  r.counts.inside = r.rows.filter((row) => insideWarehouse(objects.get(row.id), l)).length;
  r.counts.waiting = r.rows.filter((row) => row.waiting).length;
  r.counts.validInside = r.rows.filter((row) => insideWarehouse(objects.get(row.id), l) && !row.waiting && !row.issues.some((i) => i.blocking !== false)).length;
  r.counts.columnViolation = new Set(r.rows.flatMap((row) => row.issues.filter((i) => i.type === 'column').map((i) => i.key))).size;
  r.column = {
    version: 1, groups: groupRows, unacceptedGroups: groupRows.filter((g) => g.outside).length, acceptance: r.counts.total ? (r.counts.validInside / r.counts.total) * 100 : 0,
    failures: [...new Map(failures.map((f) => [f.key, f])).values()], fatal: diag?.fatal || [], search: diag?.search || null, searchEvidence: !!diag,
    insideFootprint: racks.filter((o) => insideWarehouse(o, l)).reduce((s, o) => s + o.width * o.depth, 0), outsideFootprint: racks.filter((o) => !insideWarehouse(o, l)).reduce((s, o) => s + o.width * o.depth, 0),
  };
  return r;
}

/** 기준본 92 W.scan(열 우선): 배치 규칙 없이 기본 검사 → 열 조건 보강. */
export function scanColumnLayout(l, project, opts) {
  const r = structuredClone(scanLayout({ ...l, autoPlacementRules: undefined }, project, opts));
  r.fingerprint = columnSignature(l, project);
  return enrich(l, project, r);
}

/**
 * 기준본 92 EX.generate + W.base(열 우선): 생성 랙 좌표를 0으로 두고(위치는 탐색이 정한다) 원래 생성 위치를 따로 돌려준다.
 * 보호 랙은 이전 위치·크기·회전과 설계 규격을 유지한다. 구조물은 항상 유지한다.
 */
export function columnBase(project, analysis, c, opts) {
  checkColumnSettings(c.autoPlacement);
  const opt = columnOptions(c), generated = new Map();
  const p = buildProposal(project, analysis, { ...c, autoPlacement: { ...c.autoPlacement, preserveStructures: true } }, {
    ...opts,
    onGenerated(os) {
      for (const o of os) {
        generated.set(rackKey(o), { x: o.x, y: o.y, rotation: o.rotation });
        o.x = 0;
        o.y = 0;
      }
    },
  });
  const old = new Map(project.scenarios[c.target].objects.map((o) => [o.id, o]));
  for (const o of p.layout.objects) {
    const b = old.get(o.id);
    if (o.kind === 'rack' && b && (b.placementMeta?.positionLocked || (c.autoPlacement.keepManual && b.placementMeta?.manualEdited !== false))) {
      for (const k of ['x', 'y', 'width', 'depth', 'height', 'rotation']) o[k] = b[k];
      o.designSpec = { width: o.width, depth: o.depth, height: o.height ?? null };
      const a = o.originalSpec || o, d = o.designSpec;
      o.specificationChanged = !['width', 'depth', 'height'].every((k) => a[k] === d[k] || (Number.isFinite(a[k]) && Number.isFinite(d[k]) && Math.abs(a[k] - d[k]) < 1e-8));
      o.physicalConfirmation = clone(b.physicalConfirmation || null);
    }
  }
  p.layout.autoPlacementRules = { mode: 'column', wallGap: c.wallGap, rackGap: c.rackGap, columnGap: c.columnGap, aisleTarget: c.aisleTarget, columnOptions: opt };
  p.config = c;
  p.generated = generated;
  return p;
}
const generatedKey = (o) => rackKey(o);

function template(racks, ax, rotationOffset, available, wrap, lineGap, rackGap) {
  const out = [];
  let u = 0, d = 0, lineWidth = 0;
  for (const source of racks) {
    const o = { ...source, x: 0, y: 0, rotation: rotationOffset === 0 ? source.rotation : (((source.rotation + rotationOffset) % 360) + 360) % 360 };
    const U = projectOn(o, ax.E), D = projectOn(o, ax.D), su = U.max - U.min, sd = D.max - D.min;
    if (wrap && d > 0 && d + sd > available + EPS) {
      u += lineWidth + lineGap;
      d = 0;
      lineWidth = 0;
    }
    out.push({ source, rotation: o.rotation, u, d, su, sd, localU: U.min, localD: D.min });
    d += sd + rackGap;
    lineWidth = Math.max(lineWidth, su);
  }
  return out;
}
function position(t, u, d, ax) {
  const du = u + t.u - t.localU, dd = d + t.d - t.localD;
  return { ...t.source, rotation: t.rotation, x: roundMm(du * ax.E[0] + dd * ax.D[0]), y: roundMm(du * ax.E[1] + dd * ax.D[1]), placementMeta: { ...t.source.placementMeta, waiting: false } };
}
function offsets(values, min, max, variant, origin) {
  const vs = [...new Set(values.filter(Number.isFinite).map(roundMm))].filter((v) => v >= min - EPS && v <= max + EPS);
  vs.sort((a, b) => (variant === 2 ? Math.abs(a - origin) - Math.abs(b - origin) || a - b : variant === 1 ? b - a : a - b));
  return vs.slice(0, COLUMN_LIMITS.maxOffsets);
}
/** 기준본 C.queue: 수용하지 못한 랙을 창고 오른쪽 바깥에 열 그룹별 띠로 세운다. 표현 범위를 넘으면 오류 문구를 돌려준다. */
function queue(l, groups, todo, fixed, c, project) {
  if (!todo.length) return [];
  const rules = l.autoPlacementRules, opt = optsOf(l), g = Math.max(0.001, project.settings.minGap || 0, c.rackGap), cg = Math.max(0.3, groupGap(rules, project)), plans = [];
  let x = Math.max(l.warehouse.width + Math.max(1, cg), ...fixed.map((o) => bounds(o).maxX + cg));
  for (const group of groups) {
    const os = group.racks.filter((o) => todo.some((v) => v.id === o.id));
    if (!os.length) continue;
    const strips = [];
    let strip = { items: [], height: 0, width: 0 };
    for (const o of os) {
      const b = bounds({ ...o, x: 0, y: 0 }), w = b.maxX - b.minX, h = b.maxY - b.minY;
      if (opt.allowWrap && strip.items.length && strip.height + g + h > 1000) {
        strips.push(strip);
        strip = { items: [], height: 0, width: 0 };
      }
      const y = strip.items.length ? strip.height + g : 0;
      strip.items.push({ o, y, w, h });
      strip.height = y + h;
      strip.width = Math.max(strip.width, w);
    }
    if (strip.items.length) strips.push(strip);
    const first = opt.first[group.column] || opt.firstRackPosition;
    for (const s of strips) {
      for (const item of s.items) {
        const o = { ...item.o, placementMeta: { ...item.o.placementMeta, waiting: true } }, y = first === 'north' ? item.y : s.height - item.y - item.h;
        at(o, x, y);
        if (!representable(o)) return ['외부 오른쪽 대기를 안전한 좌표 범위에 표현할 수 없습니다: ' + o.code + ' · 좌표를 자르거나 랙을 겹쳐 저장하지 않습니다.'];
        plans.push(o);
      }
      x += s.width + cg;
    }
  }
  const target = new Map(l.objects.map((o) => [o.id, o]));
  for (const o of plans) Object.assign(target.get(o.id), o);
  return [];
}

/**
 * 기준본 C.search: 열 그룹마다 랙 번호 순 템플릿을 만들고 시작점(오프셋 후보)에서 연속 접두부가 가장 긴 위치를 고른다.
 * 남은 랙은 창고 오른쪽 바깥 대기열로. 보호 객체·데이터 보존을 검사해 실패를 진단에 남긴다.
 * strategy: north | south | origin | far (+ '-wrap'). scope: all | new | selected | boundary | collision | waiting.
 */
export function columnSearch(base, c, strategy = 'north', { project, scope = 'all', chosen = new Set(), run = startRun() }) {
  const l = copyLayout(base), opt = optsOf(l), rules = l.autoPlacementRules, old = new Map(project.scenarios[c.target].objects.map((o) => [o.id, o])), source = new Map(base.objects.map((o) => [o.id, o]));
  let bad = null;
  if (['boundary', 'collision'].includes(scope)) bad = new Map(scanColumnLayout(base, project).rows.map((r) => [r.id, r]));
  const movable = (o) => {
    if (o.kind !== 'rack' || o.placementMeta?.positionLocked) return false;
    const prior = old.get(o.id);
    if (prior && (c.keep === 'keep' || (opt.keepManual && prior.placementMeta?.manualEdited !== false))) return false;
    if (scope === 'waiting') return !insideWarehouse(o, base) || !!o.placementMeta?.waiting;
    if (scope === 'selected') return chosen.has(o.id);
    if (scope === 'new') return !prior;
    if (scope === 'boundary') return bad.get(o.id)?.issues.some((i) => ['boundary', 'waiting'].includes(i.type));
    if (scope === 'collision') return bad.get(o.id)?.issues.some((i) => ['rackCollision', 'structureCollision', 'aisle'].includes(i.type));
    return true;
  };
  const movableIds = new Set(l.objects.filter(movable).map((o) => o.id)), fixed = l.objects.filter((o) => !movableIds.has(o.id)), index = spatialIndex(l, fixed), groups = columnGroups(l.objects, opt), reasons = {}, anchors = fixed.filter((o) => o.kind === 'rack').map((o) => o.id), queued = [], accepted = [];
  const wrapped = !!opt.allowWrap && strategy.endsWith('-wrap'), name = strategy.endsWith('-wrap') ? strategy.slice(0, -5) : strategy, variant = name === 'south' ? 1 : name === 'origin' ? 2 : name === 'far' ? 3 : 0;
  const minRackGap = Math.max(project.settings.minGap || 0, c.rackGap);
  let frontier = null;
  for (const group of groups) {
    const ax = axes(opt, group.column), roomU = room(l, ax.E), roomD = room(l, ax.D), margin = c.wallGap;
    const groupFixed = group.racks.filter((o) => !movableIds.has(o.id) && insideWarehouse(o, l)), todo = group.racks.filter((o) => movableIds.has(o.id));
    if (frontier === null) frontier = roomU.min + margin;
    let best = [], bestDistance = Infinity;
    const observed = new Set();
    const anchoredU = groupFixed.length ? Math.min(...groupFixed.map((o) => projectOn(o, ax.E).min)) : null;
    const anchoredD = groupFixed.length ? Math.max(...groupFixed.map((o) => projectOn(o, ax.D).max)) + minRackGap : null;
    const anchorCanAppend = !groupFixed.length || Math.max(...groupFixed.map(rackNumber)) < Math.min(...todo.map(rackNumber));
    if (todo.length && check(run) && anchorCanAppend) {
      let complete = false;
      for (const rotationOffset of [0, ...(opt.allowRotation ? [90] : [])]) {
        const t = template(todo, ax, rotationOffset, roomD.max - roomD.min - 2 * margin, wrapped, groupGap(rules, project), minRackGap);
        const first = t[0], spanU = Math.max(...t.map((v) => v.u + v.su)), spanD = Math.max(...t.map((v) => v.d + v.sd)), cfg = c.perColumnSettings?.[group.column] || {};
        const origin = [cfg.x ?? c.originX, cfg.y ?? c.originY], ou = origin[0] * ax.E[0] + origin[1] * ax.E[1], od = origin[0] * ax.D[0] + origin[1] * ax.D[1];
        const us = [frontier, roomU.min + margin, roomU.max - margin - first.su, roomU.max - margin - spanU, ou], ds = [roomD.min + margin, roomD.max - margin - first.sd, roomD.max - margin - spanD, od];
        for (const p of [...fixed, ...accepted]) {
          const U = projectOn(p, ax.E), D = projectOn(p, ax.D), clear = requiredGap(first.source, p, rules, project);
          us.push(U.max + clear, U.min - clear - spanU);
          ds.push(D.max + clear, D.min - clear - spanD);
        }
        let U = offsets(us, frontier, roomU.max - margin - first.su, variant === 3 ? 1 : variant === 2 ? 2 : 0, ou), D = offsets(ds, roomD.min + margin, roomD.max - margin - first.sd, variant === 1 ? 1 : variant === 2 ? 2 : 0, od);
        if (groupFixed.length) {
          U = [anchoredU];
          D = [anchoredD];
        }
        let starts = 0;
        trial: for (const u of U) {
          for (const d of D) {
            if (starts++ >= COLUMN_LIMITS.maxStarts || !check(run)) break trial;
            run.starts++;
            const local = spatialIndex(l), prefix = [];
            let distance = 0;
            for (const v of t) {
              if (!check(run)) break;
              const o = position(v, u, d, ax);
              if (!probe(o, l, index, local, c, observed, run, project)) break;
              prefix.push(o);
              local.add(o);
              const before = old.get(o.id) || source.get(o.id);
              distance += Math.hypot(o.x - before.x, o.y - before.y);
            }
            if (prefix.length > best.length || (prefix.length === best.length && distance < bestDistance)) {
              best = prefix;
              bestDistance = distance;
            }
            if (prefix.length === todo.length) {
              complete = true;
              break trial;
            }
          }
        }
        if (complete || !check(run)) break;
      }
    }
    const kept = new Set(best.map((o) => o.id));
    for (const o of best) {
      Object.assign(l.objects.find((v) => v.id === o.id), o);
      accepted.push(o);
      index.add(o);
    }
    for (const o of todo) {
      if (kept.has(o.id)) continue;
      const target = l.objects.find((v) => v.id === o.id);
      target.rotation = source.get(o.id).rotation;
      target.placementMeta = { ...target.placementMeta, waiting: true };
      queued.push(target);
      reasons[o.id] = { stop: run.stopReason || '', observed: [...observed].sort(), anchorConstraint: !anchorCanAppend };
    }
    const band = [...groupFixed, ...best];
    if (band.length) frontier = Math.max(frontier, ...band.map((o) => projectOn(o, ax.E).max)) + groupGap(rules, project);
  }
  const fatal = queue(l, groups, queued, [...fixed, ...accepted], c, project);
  for (const o of l.objects) {
    const b = source.get(o.id);
    if (!b || identity(o) !== identity(b) || (!movableIds.has(o.id) && placementChanged(o, b))) fatal.push('데이터·보호 좌표 보존 검사 실패: ' + o.code);
  }
  if (l.objects.length !== base.objects.length || new Set(l.objects.map((o) => o.id)).size !== base.objects.length) fatal.push('랙/객체 ID 또는 수량 보존 검사 실패');
  for (const o of fixed) if (!representable(o)) fatal.push('보호 객체 앵커/회전 외곽의 좌표 범위 초과: ' + o.code);
  diagnostics.set(l, { anchors, reasons, fatal, search: { probes: run.probes, starts: run.starts, stopReason: run.stopReason, elapsedMs: nowMs() - run.started } });
  return l;
}

/** 기준본 C.safe: 열 검사 결과에 치명 오류·실패가 없는 후보. */
export const columnSafe = (v) => !!v?.result.column && !v.result.column.fatal.length && !v.result.column.failures.length;
function distanceFrom(l, old) {
  const map = new Map(old.objects.map((o) => [o.id, o]));
  return l.objects.reduce((n, o) => {
    const b = map.get(o.id);
    return n + (b && o.kind === 'rack' ? Math.hypot(o.x - b.x, o.y - b.y) : 0);
  }, 0);
}
/** 기준본 C.candidate: 90 후보 + 열 위반 수(순서 차이)·이동 거리·회전 변경 수. */
export function columnCandidate(name, l, c, old, project, generated = new Map()) {
  const v = makeCandidate(name, l, c, old, project), prior = new Map(old.objects.map((o) => [o.id, o]));
  v.orderLoss = v.result.counts.columnViolation || 0;
  v.columnDistance = distanceFrom(l, old);
  v.columnRotations = l.objects.filter((o) => {
    if (o.kind !== 'rack') return false;
    const rotation = (prior.get(o.id) || generated.get(generatedKey(o)))?.rotation;
    return rotation !== undefined && o.rotation !== rotation;
  }).length;
  return v;
}
/** 기준본 C.compare. */
export function compareColumn(a, b) {
  const score = (v) => [columnSafe(v) ? 0 : 1, -v.result.counts.validInside, v.result.counts.columnViolation || 0, v.manualMoved, v.columnDistance, v.columnRotations, v.result.column?.failures.length || 0];
  const A = score(a), B = score(b);
  for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) return A[i] - B[i];
  return 0;
}

/**
 * 기준본 92 W.build(열 우선): 비교 전용 참고 후보(현재 저장 배치 또는 기존 배치 규칙) + 전략별 열 우선 후보(최대 8개, 탐색 예산 공통).
 * @returns {{ proposal, candidates, choice, reference, run }}
 */
export function buildColumnCandidates(project, analysis, c, opts) {
  const run = startRun(), p = columnBase(project, analysis, c, opts), old = project.scenarios[c.target];
  const legacyConfig = { ...c, autoPlacement: { ...c.autoPlacement, mode: 'inside' } }, saved = old.objects.some((o) => o.kind === 'rack');
  const reference = saved ? old : copyLayout(p.layout);
  if (!saved) {
    reference.autoPlacementRules = { mode: 'inside', wallGap: c.wallGap, rackGap: c.rackGap, columnGap: c.columnGap, aisleTarget: c.aisleTarget };
    for (const o of reference.objects) {
      const pos = o.excel && p.generated.get(generatedKey(o));
      if (pos) Object.assign(o, pos);
    }
  }
  const ref = reference.objects.every(representable) ? makeCandidate(saved ? '현재 저장 배치 · 비교 전용' : '기존 배치 규칙 · 비교 전용', reference, legacyConfig, old, project) : { name: '기존 배치 규칙 · 좌표 표현 범위 초과로 비교 불가' };
  const candidates = [];
  for (const [name, strategy] of columnStrategies(columnOptions(c).allowWrap)) {
    if (candidates.length >= COLUMN_LIMITS.maxCandidates || (candidates.length && !check(run))) break;
    const t = nowMs(), layout = columnSearch(p.layout, c, strategy, { project, run });
    run.candidates++;
    const v = columnCandidate(name, layout, c, old, project, p.generated);
    v.columnElapsedMs = nowMs() - t;
    candidates.push(v);
  }
  let choice = 0;
  for (let i = 1; i < candidates.length; i++) if (compareColumn(candidates[i], candidates[choice]) < 0) choice = i;
  run.searchMs = nowMs() - run.started;
  return { proposal: p, candidates, choice, reference: ref, run };
}

/**
 * 기준본 C.optimize의 계산 부분: 현재 후보를 기준으로 범위 안 랙만 전략별로 다시 찾아 가장 좋은 후보와 안내 문구를 돌려준다.
 * scope='waiting'이면 '외부 재수용'. 선택 범위인데 선택이 없으면 오류.
 */
export function columnReoptimize(prior, c, scope, { project, chosen = new Set(), generated = new Map() }) {
  if (scope === 'selected' && !chosen.size) throw new Error('아래 목록에서 랙을 선택하세요.');
  const run = startRun(), variants = [];
  for (const [, strategy] of columnStrategies(columnOptions(c).allowWrap)) {
    if (variants.length >= COLUMN_LIMITS.maxCandidates || (variants.length && !check(run))) break;
    const layout = columnSearch(prior.layout, { ...c, keep: 'reflow' }, strategy, { project, scope, chosen, run });
    variants.push(columnCandidate((scope === 'waiting' ? '외부 재수용' : '재최적화') + ' · ' + strategy, layout, c, project.scenarios[c.target], project, generated));
    run.candidates++;
  }
  variants.sort(compareColumn);
  const next = variants[0];
  const note = (columnSafe(next) ? '검증된 후보' : '적용 불가 후보') + ' · 유효 내부 ' + prior.result.counts.validInside + ' → ' + next.result.counts.validInside + ' · 기존 내부/수동/잠금 랙 보호를 포함해 비교하세요.';
  return { candidate: next, note, run };
}

registerColumnScanner(scanColumnLayout);
