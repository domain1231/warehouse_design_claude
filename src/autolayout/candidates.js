// 자동 배치 후보(기준본 90 W.changed·W.moved·W.orderLoss·W.score·W.compare·W.candidate·W.fits·W.pack·W.build).
// 열 우선(column) 모드는 92가 대체하므로 Phase 6c에서 옮긴다. DOM 없음. 입력 프로젝트·배치는 바꾸지 않는다.
// 결정성: 후보 탐색은 객체마다 probe 6000개까지만 본다(시간 상한 없음, AGENTS.md 결정성).
import { bounds } from '../geometry/polygons.js';
import { overlaps, gap } from '../geometry/collision.js';
import { GEOMETRY_EPS_M as EPS, roundMm } from '../geometry/tolerance.js';
import { scanLayout } from '../warehouse/constraints.js';
import { buildProposal } from '../excel/proposal.js';
import { formatNumber as fmt } from '../core/format.js';
import { buildColumnCandidates, columnBase } from './column.js';

export const PROBE_LIMIT = 6000;
const geom = (o) => [o.x, o.y, o.width, o.depth, o.height, o.rotation];
/** 기준본 W.changed: 위치·크기·회전 중 하나라도 다르면 true(이전 객체가 없어도 true). */
export const placementChanged = (a, b) => !b || geom(a).some((v, i) => v !== geom(b)[i]);

/** 기준본 W.moved: 이전 배치에 있던 랙 중 바뀐 수. manual이면 수동 편집 랙만 센다. */
export function movedCount(l, old, manual = false) {
  return l.objects.filter((o) => o.kind === 'rack').filter((o) => {
    const b = old.objects.find((x) => x.id === o.id);
    return b && placementChanged(o, b) && (!manual || b.placementMeta?.manualEdited !== false);
  }).length;
}

/** 기준본 W.orderLoss: 같은 열에서 랙 번호 순서와 진행 방향(북→남 또는 남→북)이 어긋난 쌍 수. */
export function orderLoss(l, c) {
  const groups = new Map();
  for (const o of l.objects.filter((o) => o.kind === 'rack' && o.excel)) {
    const k = o.excel.column;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(o);
  }
  let n = 0;
  for (const os of groups.values()) {
    os.sort((a, b) => a.excel.rackNumber - b.excel.rackNumber);
    for (let i = 1; i < os.length; i++) {
      const d = os[i].y - os[i - 1].y;
      if (c.firstRackPosition === 'south' ? d > EPS : d < -EPS) n++;
    }
  }
  return n;
}

/** 기준본 W.score: 방식별 우선순위 배열(사전식 비교, 작을수록 좋음). */
export function score(v, c) {
  const s = v.result.counts, issues = s.rackCollision + s.structureCollision + s.aisle + s.gap;
  if (c.autoPlacement.mode === 'order') return [issues + s.boundary + s.waiting, v.orderLoss, -s.validInside, v.moved];
  if (c.autoPlacement.mode === 'aisle') return [s.aisle, s.rackCollision + s.structureCollision, s.gap, -s.validInside, s.boundary, v.orderLoss, v.moved];
  return [-s.validInside, s.rackCollision + s.structureCollision, s.aisle, s.gap, s.boundary, v.orderLoss, v.moved];
}

export function compareCandidates(a, b, c) {
  const x = score(a, c), y = score(b, c);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

/** 기준본 W.candidate. */
export function makeCandidate(name, layout, c, old, project) {
  return { name, layout, result: scanLayout(layout, project), moved: movedCount(layout, old), manualMoved: movedCount(layout, old, true), orderLoss: orderLoss(layout, c) };
}

/** 랙 o와 이미 놓인 p 사이에 필요한 이격(기준본 W.fits·W.pack 공통 식). */
function clearanceBetween(o, p, c, project) {
  if (p.kind === 'rack') return Math.max(project.settings.minGap, c.rackGap, o.excel?.column !== p.excel?.column ? c.columnGap : 0, c.autoPlacement.mode === 'aisle' ? c.aisleTarget : 0);
  return p.kind === 'aisle' ? 0 : c.wallGap;
}

/** 기준본 W.fits: 벽 이격 안쪽이고, 놓인 객체(작업 구역 제외)와 겹치지 않으며 필요한 이격을 지키는가. */
export function fitsInside(o, l, placed, c, project) {
  const b = bounds(o), w = l.warehouse, g = c.wallGap;
  if (b.minX < g - EPS || b.minY < g - EPS || b.maxX > w.width - g + EPS || b.maxY > w.height - g + EPS) return false;
  for (const p of placed) {
    if (p.kind === 'work') continue;
    const required = clearanceBetween(o, p, c, project), t = bounds(p);
    if (b.maxX + required <= t.minX + EPS || b.minX - required >= t.maxX - EPS || b.maxY + required <= t.minY + EPS || b.minY - required >= t.maxY - EPS) continue;
    if (overlaps(o, p) || (required && gap(o, p) + EPS < required)) return false;
  }
  return true;
}

/**
 * 기준본 W.pack: 움직일 수 있는 랙을 후보 좌표(벽·원점·놓인 객체 가장자리+이격)에서 차례로 시험해 첫 자리에 둔다.
 * 자리가 없으면 창고 오른쪽 바깥 대기열에 세우고 placementMeta.waiting=true.
 * strategy: row | reverse | column | area | rotate. scope: all | new | selected | boundary | collision.
 */
export function pack(base, c, strategy, { project, scope = 'all', chosen = new Set() }) {
  const l = { ...base, objects: base.objects.map((o) => ({ ...o, placementMeta: o.placementMeta ? { ...o.placementMeta } : undefined })) };
  const old = project.scenarios[c.target], oldMap = new Map(old.objects.map((o) => [o.id, o]));
  const bad = new Map(scanLayout(base, project).rows.map((r) => [r.id, r]));
  const movable = (o) => {
    if (o.kind !== 'rack' || o.placementMeta?.positionLocked) return false;
    const prior = oldMap.get(o.id);
    if (prior && (c.keep === 'keep' || (c.autoPlacement.keepManual && prior.placementMeta?.manualEdited !== false))) return false;
    return scope === 'all' || (scope === 'new' && !prior) || (scope === 'selected' && chosen.has(o.id))
      || (scope === 'boundary' && bad.get(o.id)?.issues.some((v) => v.type === 'boundary' || v.type === 'waiting'))
      || (scope === 'collision' && bad.get(o.id)?.issues.some((v) => ['rackCollision', 'structureCollision', 'aisle'].includes(v.type)));
  };
  const todo = l.objects.filter(movable), placed = l.objects.filter((o) => !movable(o));
  if (strategy === 'area') todo.sort((a, b) => b.width * b.depth - a.width * a.depth);
  else if (strategy === 'reverse') todo.reverse();
  const w = l.warehouse, reverse = strategy === 'reverse' || c.columnDirection === 'west', south = c.firstRackPosition === 'south', column = strategy === 'column';
  let queueX = w.width + Math.max(1, c.columnGap), queueY = 0, queueWidth = 0;
  for (const o of todo) {
    let found = false;
    const angles = [o.rotation];
    if (c.autoPlacement.allowRotation) angles.push((o.rotation + 90) % 360);
    if (strategy === 'rotate' && angles.length > 1) angles.reverse();
    for (const rotation of angles) {
      o.rotation = rotation;
      const z = bounds({ ...o, x: 0, y: 0 }), bw = z.maxX - z.minX, bh = z.maxY - z.minY, g = c.wallGap;
      const xs = new Set([g, w.width - g - bw, Math.max(g, Math.min(w.width - g - bw, c.originX))]);
      const ys = new Set([g, w.height - g - bh, Math.max(g, Math.min(w.height - g - bh, c.originY))]);
      for (const p of placed) {
        const b = bounds(p), clear = clearanceBetween(o, p, c, project);
        xs.add(b.maxX + clear);
        xs.add(b.minX - clear - bw);
        ys.add(b.maxY + clear);
        ys.add(b.minY - clear - bh);
      }
      const X = [...xs].filter((x) => x >= g - EPS && x + bw <= w.width - g + EPS).sort((a, b) => (reverse ? b - a : a - b));
      const Y = [...ys].filter((y) => y >= g - EPS && y + bh <= w.height - g + EPS).sort((a, b) => (south ? b - a : a - b));
      let probes = 0;
      search: for (const a of column ? X : Y) {
        for (const b of column ? Y : X) {
          if (++probes > PROBE_LIMIT) break search;
          o.x = roundMm((column ? a : b) - z.minX);
          o.y = roundMm((column ? b : a) - z.minY);
          if (fitsInside(o, l, placed, c, project)) {
            found = true;
            break search;
          }
        }
      }
      if (found) break;
    }
    if (!found) {
      o.rotation = base.objects.find((x) => x.id === o.id).rotation;
      const b = bounds({ ...o, x: 0, y: 0 }), bw = b.maxX - b.minX, bh = b.maxY - b.minY;
      if (queueY + bh > Math.max(w.height, 10)) {
        queueX += queueWidth + Math.max(0.3, c.rackGap);
        queueY = 0;
        queueWidth = 0;
      }
      o.x = roundMm(Math.min(999, queueX - b.minX));
      o.y = roundMm(Math.min(999, queueY - b.minY));
      queueY += bh + Math.max(0.3, c.rackGap);
      queueWidth = Math.max(queueWidth, bw);
    }
    o.placementMeta = { ...o.placementMeta, waiting: !found };
    placed.push(o);
  }
  return l;
}

export const STRATEGIES = [['순서 유지 · 행 재구성', 'row'], ['진행 방향 반전', 'reverse'], ['열 재구성', 'column'], ['면적 순 내부 탐색', 'area']];
export const ROTATE_STRATEGY = ['90° 회전 허용', 'rotate'];

/**
 * 기준본 W.build: 기본 배치안(후보 0 '기존 배치 규칙') + 재배치 후보 4~5개. 후보 0이 모두 내부 정상이면 0, 아니면 1부터
 * 방식별 점수가 가장 좋은 후보를 고른다(동점이면 앞 후보).
 * @returns {{ proposal, candidates, choice }} proposal = buildProposal 결과(후보 0 배치 포함).
 */
export function buildCandidates(project, analysis, c, opts) {
  if (c.autoPlacement.mode === 'column') return buildColumnCandidates(project, analysis, c, opts);
  const proposal = buildProposal(project, analysis, c, opts), old = project.scenarios[c.target];
  const candidates = [makeCandidate('기존 배치 규칙', proposal.layout, c, old, project)];
  for (const [name, s] of [...STRATEGIES, ...(c.autoPlacement.allowRotation ? [ROTATE_STRATEGY] : [])]) candidates.push(makeCandidate(name, pack(proposal.layout, c, s, { project }), c, old, project));
  let choice = candidates[0].result.counts.validInside === candidates[0].result.counts.total ? 0 : 1;
  for (let i = 1; i < candidates.length; i++) if (compareCandidates(candidates[i], candidates[choice], c) < 0) choice = i;
  return { proposal, candidates, choice };
}

export const REOPTIMIZE_SCOPES = ['all', 'new', 'selected', 'boundary', 'collision'];

/** 기준본 W.summary: 배치 검사 결과 한 줄 요약. */
export function candidateSummary(r) {
  const s = r.counts;
  return `전체 ${s.total}랙 · 경계 내부 ${s.inside} / 기준 충족 ${s.validInside} · 경계 초과 ${s.boundary}랙 · 랙 충돌 ${s.rackCollision}건 / 구조물 ${s.structureCollision}건 / 통로 ${s.aisle}건 / 간격 ${s.gap}건 · 대기 ${s.waiting}랙`;
}

/**
 * 기준본 wOptimize: 현재 후보(prior)를 기준으로 범위 안 랙만 다시 배치한 변형(행·반전·열·면적·회전)을 만들어
 * 점수가 가장 좋은 하나를 돌려준다. 기존 랙 위치 유지 설정(keep)은 이 재배치에서만 'reflow'로 본다.
 * scope='selected'인데 chosen이 비면 오류. 프로젝트·후보는 바꾸지 않는다.
 * @returns {{ candidate, worse: boolean, note: string }}
 */
export function reoptimize(prior, c, scope, { project, chosen = new Set() }) {
  if (scope === 'selected' && !chosen.size) throw new Error('아래 목록에서 재최적화할 랙을 선택하세요.');
  const old = project.scenarios[c.target];
  const variants = ['row', 'reverse', 'column', 'area', ...(c.autoPlacement.allowRotation ? ['rotate'] : [])]
    .map((s) => makeCandidate('재최적화 · ' + scope + ' · ' + s, pack(prior.layout, { ...c, keep: 'reflow' }, s, { project, scope, chosen }), c, old, project));
  variants.sort((a, b) => compareCandidates(a, b, c));
  const next = variants[0], worse = compareCandidates(next, prior, c) > 0;
  const p = prior.result.counts, n = next.result.counts;
  const note = `${worse ? '개선되지 않은 후보입니다. 이전 후보로 돌아갈 수 있습니다.' : '재최적화 후보를 생성했습니다.'} 이전 경계 ${p.boundary} / 현재 ${n.boundary} · 충돌 ${p.rackCollision + p.structureCollision} → ${n.rackCollision + n.structureCollision} · 이동 ${movedCount(next.layout, prior.layout)}랙 · 창고 면적 − 랙 면적 ${fmt(next.result.warehouseArea - next.result.footprint, 3)}㎡ (순 가용 공간 아님)`;
  return { candidate: next, worse, note };
}

/** 기준본 W.base(92 래퍼 포함): 열 우선이면 columnBase, 아니면 buildProposal. */
export function baseProposal(project, analysis, c, opts) {
  return c.autoPlacement.mode === 'column' ? columnBase(project, analysis, c, opts) : buildProposal(project, analysis, c, opts);
}
