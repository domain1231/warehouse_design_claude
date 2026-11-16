// Excel 배치안 만들기(DOM 없음). 기준본 체인 중 자동 배치 후보 탐색 앞까지를 옮겼다:
//   40 EX.generate(열 우선 이외) → 70 EX.proposal(대상 배치·기존 랙 매칭·원본/설계 규격·누락 정책) → 90 W.base(보호 랙·구조물 유지·placementMeta·배치 규칙)
// 90 W.build의 대안 후보(W.pack)와 선택, 92 열 우선 생성은 자동 배치 단계(Phase 6)에서 붙인다. 그 전까지 후보는 '기존 배치 규칙' 하나다.
import { createObject, validateLayout, finite, dateOK } from '../core/project.js';
import { bounds, polygon } from '../geometry/polygons.js';

const clone = (v) => structuredClone(v);
const sortKey = (a, b) => String(a).localeCompare(String(b), 'en', { numeric: true });
const dims = (o) => ({ width: o.width, depth: o.depth, height: o.height ?? null });
const sameDims = (a, b) => ['width', 'depth', 'height'].every((k) => a[k] === b[k] || (Number.isFinite(a[k]) && Number.isFinite(b[k]) && Math.abs(a[k] - b[k]) < 1e-8));
const racksOf = (l) => l.objects.filter((o) => o.kind === 'rack');
/** 랙 대응 키(기준본 R.key): Excel 연결 랙은 건물+로케이션, 아니면 ID(또는 계보 ID). */
export const rackKey = (o) => (o.excel ? `excel|${o.excel.building}|${o.excel.key}` : `id|${o.lineageId || o.id}`);

/**
 * 설정 검사(기준본 40 EX.config + 70 대상·정책 + 90 간격 검사·자동 배치 설정). raw는 입력값(문자열 가능).
 * @returns {object} c
 */
export function readExcelConfig(raw) {
  const n = (k, label = '자동 배치 숫자 설정을 확인하세요.') => {
    const v = Number(raw[k]);
    if (raw[k] === '' || raw[k] === undefined || !Number.isFinite(v)) throw new Error(label);
    return v;
  };
  for (const [k, label] of [['rackGap', '랙 사이 간격'], ['wallGap', '벽 최소 이격'], ['aisleTarget', '통로 목표 폭'], ['columnGap', '열 사이 간격']]) {
    const s = String(raw[k] ?? ''), v = Number(s);
    if (!s.trim() || !Number.isFinite(v) || v < 0 || v > 50) throw new Error(`${label}은 0~50m의 숫자로 입력하세요.`);
    if (Math.abs(v * 1e3 - Math.round(v * 1e3)) > 1e-6) throw new Error(`${label}은 0.001m 단위까지 입력하세요.`);
  }
  const c = {
    building: String(raw.building ?? '').trim(), floor: raw.floor ?? '', width: n('width'), depth: n('depth'), originX: n('originX'), originY: n('originY'), northRotation: n('northRotation'),
    columnDirection: raw.columnDirection, firstRackPosition: raw.firstRackPosition, columnGap: n('columnGap'), rackGap: n('rackGap'), rotation: n('rotation'), wallGap: n('wallGap'), aisleTarget: n('aisleTarget'),
    order: String(raw.order ?? '').trim(), perColumnSettings: clone(raw.perColumnSettings ?? {}), empty: !!raw.empty, emptyW: n('emptyW'), emptyD: n('emptyD'), emptyH: n('emptyH'),
    mode: raw.mode, keep: raw.keep, date: raw.date, source: String(raw.source ?? '').trim(), recordLayout: !!raw.recordLayout,
  };
  finite(c.width, '창고 가로', 1, 500);
  finite(c.depth, '창고 세로', 1, 500);
  for (const k of ['columnGap', 'rackGap', 'wallGap', 'aisleTarget']) finite(c[k], k, 0, 50);
  for (const k of ['originX', 'originY']) finite(c[k], k, -1e3, 1e3);
  finite(c.rotation, '회전', -36e3, 36e3);
  for (const k of ['emptyW', 'emptyD', 'emptyH']) finite(c[k], k, 0.01, 100);
  if (!c.building || !c.source || !c.floor || !dateOK(c.date)) throw new Error('건물·층·기준일·출처를 확인하세요.');
  if (['merge', 'update'].includes(c.mode) && !c.keep) throw new Error('기존 객체의 위치 유지 또는 재배치를 선택하세요.');
  return {
    ...c, target: raw.target, missingPolicy: raw.missingPolicy, specPolicy: raw.specPolicy,
    // 92 W.config: 열 줄바꿈·외부 방향, 열 우선이면 구조물 항상 유지
    autoPlacement: { mode: raw.autoMode === 'fixed' ? 'order' : raw.autoMode, ...(raw.autoMode === 'fixed' ? { fixedColumns: fixedColumnsOf(raw) } : {}), keepManual: !!raw.keepManual, allowRotation: !!raw.allowRotation, allowWarnings: !!raw.allowWarnings, preserveStructures: raw.autoMode === 'column' || !!raw.preserveStructures, allowWrap: !!raw.allowWrap, externalDirection: 'right' },
  };
}

// D-041: 로케이션 열 고정은 v2.4.1 호환을 위해 저장 모드 'order' + 확장 필드 fixedColumns로 표현한다.
function fixedColumnsOf(raw) {
  const f = { pairing: raw.fixedPairing ?? 'all', spacing: raw.fixedSpacing ?? 'max', axis: raw.fixedAxis ?? 'column', perLine: Number(raw.fixedPerLine ?? 1), start: raw.fixedStart ?? 'config' };
  if (!['all', 'pairs'].includes(f.pairing) || !['max', 'target'].includes(f.spacing) || !['column', 'row', 'auto'].includes(f.axis) || ![1, 2].includes(f.perLine) || !['config', 'zigzag'].includes(f.start)) throw new Error('로케이션 열 고정 설정 오류');
  return f;
}

/**
 * 열·번호 순서 배치 생성(기준본 40 EX.generate). 선택 층의 규격 확정 랙만 쓴다. 빈 번호 후보는 c.empty일 때만.
 * @param {{ racks: object[] }} analysis
 * @param {{ nextId, filename, sheet }} ctx
 */
export function generateRacks(analysis, c, { nextId, filename = '', sheet = '' }) {
  const racks = clone(analysis.racks.filter((r) => r.floor === c.floor && r.dimensions && !r.unresolved));
  const columns = [...new Set(racks.map((r) => r.column))].sort(sortKey);
  const order = c.order ? c.order.toUpperCase().split(/[\s,]+/).filter(Boolean) : columns;
  if (new Set(order).size !== order.length || order.some((k) => !columns.includes(k)) || columns.some((k) => !order.includes(k))) throw new Error('사용자 정의 순서는 등록된 모든 열을 한 번씩 포함해야 합니다.');
  const angle = (c.northRotation * Math.PI) / 180, sgn = c.columnDirection === 'east' ? 1 : -1;
  const fx = c.fixedLayout; // D-041: 행 배치는 축과 랙 회전을 바꿔서 넘긴다(도면 북쪽 방향은 그대로)
  const E = fx?.axes?.E ?? [Math.cos(angle) * sgn, Math.sin(angle) * sgn], S = fx?.axes?.S ?? [-Math.sin(angle), Math.cos(angle)];
  const dot = (p, u) => p[0] * u[0] + p[1] * u[1];
  const out = [];
  let maxEast = null;
  for (const col of order) {
    const cfg = c.perColumnSettings[col] || {}, first = fx?.targets?.[col]?.first || cfg.first || c.firstRackPosition, rotation = fx?.rotationOffset ? (((cfg.rotation ?? c.rotation) + fx.rotationOffset) % 360 + 360) % 360 : cfg.rotation ?? c.rotation;
    const D = S.map((v) => v * (first === 'north' ? 1 : -1));
    const group = racks.filter((r) => r.column === col).sort((a, b) => a.rackNumber - b.rackNumber);
    if (c.empty) {
      const nums = new Set(group.map((r) => r.rackNumber)), max = Math.max(...nums);
      if (max > 1e3) throw new Error('빈 랙 후보는 열당 최대 번호 1,000까지 지원합니다.');
      for (let k = 1; k <= max; k++) if (!nums.has(k)) group.push({ key: `${c.floor}-${col}-${k}`, floor: c.floor, column: col, rackNumber: k, dimensions: [c.emptyW * 1e3, c.emptyD * 1e3, c.emptyH * 1e3], shelves: [], issues: ['실존 미확인 사용자 생성 후보'], placeholder: true });
      group.sort((a, b) => a.rackNumber - b.rackNumber);
    }
    const relative = [];
    let center = null, prevSpan = 0;
    for (const r of group) {
      const [w, d, h] = r.dimensions.map((v) => v / 1e3);
      const o = createObject('rack', 0, 0, w, d, {
        height: h, rotation, code: r.key, block: col, unit: '미설정', provenance: '자동 배치 · 위치 실측 미확인',
        excel: { key: r.key, floor: r.floor, column: col, rackNumber: r.rackNumber, building: c.building, shelves: r.shelves, issues: r.issues, sourceFile: filename, sheet, asOfDate: c.date, placeholder: !!r.placeholder, physicalConfirmed: false, missingInLatest: false },
      }, { nextId });
      const b = bounds(o), bw = b.maxX - b.minX, bh = b.maxY - b.minY, span = Math.abs(D[0]) * bw + Math.abs(D[1]) * bh;
      if (!center) center = [bw / 2, bh / 2];
      else center = [center[0] + D[0] * (prevSpan / 2 + c.rackGap + span / 2), center[1] + D[1] * (prevSpan / 2 + c.rackGap + span / 2)];
      o.x = center[0] - w / 2;
      o.y = center[1] - d / 2;
      prevSpan = span;
      relative.push(o);
    }
    const relMin = Math.min(...relative.flatMap((o) => polygon(o).map((p) => dot(p, E))));
    let shift = [c.originX, c.originY];
    if (maxEast !== null) {
      const delta = maxEast + c.columnGap - relMin - dot(shift, E);
      shift = [shift[0] + E[0] * delta, shift[1] + E[1] * delta];
    }
    if (cfg.x !== undefined && !c.fixedLayout) shift[0] = cfg.x;
    if (cfg.y !== undefined && !c.fixedLayout) shift[1] = cfg.y;
    for (const o of relative) {
      o.x += shift[0];
      o.y += shift[1];
      out.push(o);
    }
    maxEast = Math.max(maxEast ?? -Infinity, ...relative.flatMap((o) => polygon(o).map((p) => dot(p, E))));
  }
  if (fx?.targets) placeTargets(out, fx.targets, E, S, dot);
  return out;
}

// D-041 로케이션 열 고정: 계산된 목표 위치로 열을 통째로 옮긴다(열 안 랙 간격·순서 불변).
// 목표 = 진행 방향 시작 쪽 끝(e)과, 첫 랙 쪽 끝(북쪽 시작이면 sMin, 남쪽 시작이면 sMax).
function placeTargets(out, targets, E, S, dot) {
  const byCol = new Map();
  for (const o of out) byCol.set(o.excel.column, [...(byCol.get(o.excel.column) ?? []), o]);
  for (const [col, list] of byCol) {
    const t = targets[col];
    if (!t) continue;
    const pts = list.flatMap((o) => polygon(o)), e = pts.map((p) => dot(p, E)), s = pts.map((p) => dot(p, S));
    const dE = t.e - Math.min(...e), dS = t.sMin !== undefined ? t.sMin - Math.min(...s) : t.sMax - Math.max(...s);
    for (const o of list) {
      o.x += E[0] * dE + S[0] * dS;
      o.y += E[1] * dE + S[1] * dS;
    }
  }
}

/**
 * 대상 배치에 대한 배치안(기준본 70 EX.proposal → 90 W.base).
 * @param {object} project 현재 프로젝트
 * @param {object} analysis analyzeSheet 결과
 * @param {object} c readExcelConfig 결과
 * @param {{ nextId, filename, sheet, missingDelete?: Set<string> }} ctx
 * @returns {{ layout, changes, missing, config, generatedKeys }}
 */
export function buildProposal(project, analysis, c, { nextId, filename = '', sheet = '', missingDelete = new Set(), onGenerated }) {
  // 70: 기존 랙 매칭·규격·누락
  const old = project.scenarios[c.target];
  const generated = generateRacks(analysis, c, { nextId, filename, sheet });
  onGenerated?.(generated); // 열 우선 배치: 생성 위치를 따로 두고 좌표를 비운다(기준본 92 EX.generate)
  const priorMap = new Map();
  for (const o of racksOf(old).filter((x) => x.excel)) {
    const key = rackKey(o);
    if (priorMap.has(key)) throw new Error('대상 배치 중복 로케이션: ' + o.excel.key);
    priorMap.set(key, o);
  }
  let objects = c.mode === 'new' ? [] : clone(old.objects);
  const changes = { added: 0, updated: 0, missing: 0, dimensions: 0, itemsAdded: 0, itemsRemoved: 0, itemsChanged: 0, deleted: 0, skippedNew: 0 };
  const matched = new Set();
  const incomingKeys = new Set(generated.map(rackKey));
  const codes = new Set(racksOf(old).filter((o) => c.mode !== 'new' || (o.excel && incomingKeys.has(rackKey(o))) || o.placementMeta?.positionLocked || (c.autoPlacement?.keepManual && !project.metadata.sample && o.placementMeta?.manualEdited !== false)).map((o) => o.code));
  for (const fresh of generated) {
    const prior = priorMap.get(rackKey(fresh));
    fresh.originalSpec = { ...dims(fresh), source: filename, asOf: c.date, origin: 'excel' };
    fresh.excel.originalRackSpecification = clone(fresh.originalSpec);
    if (prior) {
      matched.add(prior.id);
      Object.assign(fresh, { id: prior.id, code: prior.code, note: prior.note, capacity: prior.capacity, quantity: prior.quantity, unit: prior.unit });
      if (c.keep === 'keep') Object.assign(fresh, { x: prior.x, y: prior.y, rotation: prior.rotation, provenance: prior.provenance });
      if (!sameDims(prior.originalSpec || prior, fresh.originalSpec)) changes.dimensions++;
      if (c.specPolicy === 'keep') Object.assign(fresh, dims(prior));
      fresh.resizeConstraints = clone(prior.resizeConstraints);
      fresh.physicalConfirmation = sameDims(prior, fresh) ? clone(prior.physicalConfirmation || null) : null;
      const a = new Map(prior.excel.shelves.flatMap((s) => s.items).map((i) => [i.location, i]));
      const b = new Map(fresh.excel.shelves.flatMap((s) => s.items).map((i) => [i.location, i]));
      changes.itemsAdded += [...b.keys()].filter((k) => !a.has(k)).length;
      changes.itemsRemoved += [...a.keys()].filter((k) => !b.has(k)).length;
      changes.itemsChanged += [...b.keys()].filter((k) => a.has(k) && JSON.stringify(a.get(k)) !== JSON.stringify(b.get(k))).length;
      changes.updated++;
      const idx = objects.findIndex((o) => o.id === prior.id);
      if (idx >= 0) objects[idx] = fresh;
      else objects.push(fresh);
    } else if (c.mode === 'update') {
      changes.skippedNew++;
      continue;
    } else {
      if (codes.has(fresh.code)) {
        fresh.code = `${c.building}/${fresh.code}`;
        const base = fresh.code;
        let serial = 2;
        while (codes.has(fresh.code)) fresh.code = `${base}-${serial++}`;
      }
      codes.add(fresh.code);
      objects.push(fresh);
      changes.added++;
    }
    fresh.designSpec = dims(fresh);
    fresh.specificationChanged = !sameDims(fresh.originalSpec, fresh.designSpec);
  }
  const missing = old.objects.filter((o) => o.excel && o.excel.building === c.building && o.excel.floor === c.floor && !matched.has(o.id));
  changes.missing = missing.length;
  if (c.mode !== 'new') {
    for (const oldO of missing) {
      const o = objects.find((x) => x.id === oldO.id);
      if (c.missingPolicy === 'delete' && missingDelete.has(o.id)) {
        objects = objects.filter((x) => x.id !== o.id);
        changes.deleted++;
      } else if (c.missingPolicy === 'mark') o.excel.missingInLatest = true;
    }
  }
  if (c.mode === 'new') {
    changes.deleted = old.objects.filter((o) => o.kind === 'rack' && !objects.some((x) => x.id === o.id)).length;
    changes.structuresDeleted = old.objects.filter((o) => o.kind !== 'rack' && !objects.some((x) => x.id === o.id)).length;
  }
  const layout = { ...clone(old), warehouse: { ...clone(old.warehouse), width: c.width, height: c.depth }, objects, wallGap: c.wallGap, northRotation: c.northRotation, referenceSample: false };
  validateLayout(layout);
  const p = { layout, changes, missing, config: c, generatedKeys: generated.map((o) => `${o.excel.building}|${o.excel.key}`) };

  // 90 W.base: 위치 잠금·수동 편집 랙 보호, 전체 교체 시 구조물 유지, placementMeta, 배치 규칙
  const prior = new Map(old.objects.map((o) => [o.id, o]));
  const keepManual = (o) => o.placementMeta?.positionLocked || (c.autoPlacement.keepManual && !project.metadata.sample && o.placementMeta?.manualEdited !== false);
  for (const o of racksOf(old).filter(keepManual)) {
    if (!p.layout.objects.some((x) => x.id === o.id)) {
      p.layout.objects.push(clone(o));
      p.changes.deleted = Math.max(0, p.changes.deleted - 1);
      p.changes.protected = (p.changes.protected || 0) + 1;
    }
  }
  if (c.mode === 'new' && c.autoPlacement.preserveStructures) {
    p.layout.objects.push(...clone(old.objects.filter((o) => o.kind !== 'rack')));
    p.changes.structuresDeleted = 0;
  }
  for (const o of racksOf(p.layout)) {
    const b = prior.get(o.id);
    o.placementMeta = clone(b?.placementMeta || { manualEdited: false, positionLocked: false, waiting: false, editedAt: null });
    if (b && (b.placementMeta.positionLocked || (c.autoPlacement.keepManual && b.placementMeta.manualEdited !== false))) {
      o.x = b.x;
      o.y = b.y;
      o.rotation = b.rotation;
    }
  }
  p.layout.autoPlacementRules = { mode: c.autoPlacement.mode, wallGap: c.wallGap, rackGap: c.rackGap, columnGap: c.columnGap, aisleTarget: c.aisleTarget };
  return p;
}
