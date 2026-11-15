// 편집 명령(DOM 없음). 기준본 commit 체인을 한 함수로 펼쳤다:
//   90 W(위치 잠금·수동 편집 표시) → 75 V(대량 삭제 백업: Phase 8) → 70 R(BEFORE 잠금·재고 이력 대상) → 60 S(크기 제한·규격 이력) → 50 M(본체)
// 50 본체: 정책 동기화 → 새 통로 기준값 → 검증 → 바뀐 객체의 새 공간 경고 검사(허용 안 함이면 전체 취소) → 명령 기록.
// 실패해도 기준본처럼 명령 기록(success:false)은 남긴다. 실행취소 기록은 세션이 성공한 경우에만 만든다.
import { validateProject, createObject, OBJECT_TYPES, AISLE_TYPES } from '../core/project.js';
import { warnings } from './constraints.js';
import { bounds } from '../geometry/polygons.js';
import { addMm, roundMm, snapToStep, GEOMETRY_EPS_M as EPS } from '../geometry/tolerance.js';

export const COMMAND_DEFAULT = '객체 수정';
const HISTORY_LIMIT = 200;
const SPEC_HISTORY_LIMIT = 500;

/** 새 객체 기본 크기(기준본 addAt). 랙은 추가 랙 설정(폭·깊이·높이·종류·단위)을 쓴다. */
export const NEW_OBJECT_SIZES = Object.freeze({ wall: [3, 0.2], column: [0.6, 0.6], door: [1.2, 1.2], aisle: [4, 1.5], blocked: [2, 2], work: [3, 2] });
export const RACK_DEFAULTS = Object.freeze({ width: 1.5, depth: 0.6, height: 2, type: '중량랙', unit: 'BOX' });

export const active = (p) => p.scenarios[p.settings.scenario];
const clone = (v) => structuredClone(v);
const geometryKey = (o) => JSON.stringify([o.kind, o.x, o.y, o.width, o.depth, o.height, o.rotation, o.vertices, o.minWidth, o.targetWidth, o.warningsEnabled, o.scopeIds, o.linkedDoorId, o.clearanceAxis]);
const placementGeom = (o) => [o.x, o.y, o.width, o.depth, o.height, o.rotation];
const placementChanged = (a, b) => !b || placementGeom(a).some((v, i) => v !== placementGeom(b)[i]);
const dims = (o) => ({ width: o.width, depth: o.depth, height: o.height ?? null });
const sameDims = (a, b) => ['width', 'depth', 'height'].every((k) => a[k] === b[k] || (Number.isFinite(a[k]) && Number.isFinite(b[k]) && Math.abs(a[k] - b[k]) < 1e-8));
const positions = (os) => os.map((o) => ({ id: o.id, code: o.code, x: o.x, y: o.y, width: o.width, depth: o.depth, rotation: o.rotation }));

/** BEFORE 원본 잠금(기준본 R.locked). */
export const isLocked = (p, k = p.settings.scenario) => k === 'before' && !!p.scenarioMeta?.before?.locked;

/** 배치 전후에서 기하가 바뀐 객체 ID(추가·삭제 포함, 창고 크기가 바뀌면 전체). 기준본 M.changed. */
export function changedIds(before, after) {
  const a = new Map(before.objects.map((o) => [o.id, o]));
  const b = new Map(after.objects.map((o) => [o.id, o]));
  const ids = new Set();
  for (const o of after.objects) if (!a.has(o.id) || geometryKey(a.get(o.id)) !== geometryKey(o)) ids.add(o.id);
  for (const o of before.objects) if (!b.has(o.id)) ids.add(o.id);
  if (JSON.stringify(before.warehouse) !== JSON.stringify(after.warehouse)) for (const o of after.objects) ids.add(o.id);
  return ids;
}

/** 편집으로 생긴(또는 편집 객체가 관련된) 공간 경고. 기준본 M.invalid. */
export function newSpatialWarnings(project, before, after, ids) {
  const old = new Set(warnings(before, project).map((w) => w.key));
  return warnings(after, project).filter((w) => w.spatial && (!old.has(w.key) || w.ids.some((id) => ids.has(id))));
}

function log(p, { command, ids, before, after, success, reason = '', now, nextId }) {
  const time = now();
  if (success) {
    // 90 M.log 래퍼: 성공한 명령에서 기하가 바뀐 랙은 수동 편집으로 표시
    for (const o of active(p).objects) {
      if (o.kind !== 'rack' || !ids.has(o.id)) continue;
      const old = before.objects.find((x) => x.id === o.id);
      if (!old || placementChanged(o, old)) o.placementMeta = { ...o.placementMeta, manualEdited: true, positionLocked: !!o.placementMeta?.positionLocked, waiting: false, editedAt: time };
    }
  }
  p.commandHistory.push({
    id: nextId(), type: command, targetIds: [...ids],
    before: positions(before.objects.filter((o) => ids.has(o.id))), after: positions(after.objects.filter((o) => ids.has(o.id))),
    time, success, reason, scenario: p.settings.scenario, // 70 M.log 래퍼
  });
  if (p.commandHistory.length > HISTORY_LIMIT) p.commandHistory.shift();
}

/**
 * 편집 명령을 적용한다. 입력 프로젝트는 바꾸지 않는다.
 * @param {object} project 현재 프로젝트(검증된 상태)
 * @param {(draft: object, layout: object) => void} mutate 복사본을 고친다
 * @param {{ command?: string, selection?: Iterable<string>, now?: () => string, nextId: () => string, overrideAllow?: boolean }} opt
 * @returns {{ ok: true, project, ids: Set<string> } | { ok: false, project, reason: string, logged: boolean }}
 *   실패 시 project는 원본 + 실패 기록(logged=true) 또는 원본 그대로(BEFORE 잠금, logged=false).
 */
export function applyCommand(project, mutate, { command = COMMAND_DEFAULT, selection = [], now = () => new Date().toISOString(), nextId, overrideAllow = false } = {}) {
  if (isLocked(project)) return { ok: false, project, reason: 'BEFORE 원본 잠금 상태입니다. 잠금 해제 후 수정하세요.', logged: false };
  const draft = clone(project);
  const before = clone(active(project));
  const oldPolicy = project.settings.policy;
  const priorInventory = new Set(project.inventoryHistory.map((r) => JSON.stringify(r)));
  const beforeObjects = new Map(before.objects.map((o) => [o.id, o]));
  try {
    mutate(draft, active(draft));
    const after = active(draft);
    const time = now();
    // 90: 위치 잠금 랙은 바꿀 수 없고, 기하가 바뀐(또는 새) 랙은 수동 편집으로 표시
    for (const o of before.objects) {
      if (o.kind === 'rack' && o.placementMeta?.positionLocked && placementChanged(o, after.objects.find((x) => x.id === o.id))) throw new Error(`${o.code} · 위치 잠금을 먼저 해제하세요.`);
    }
    for (const o of after.objects) {
      if (o.kind !== 'rack') continue;
      const old = beforeObjects.get(o.id);
      if (!old || placementChanged(o, old)) o.placementMeta = { ...o.placementMeta, manualEdited: true, positionLocked: !!o.placementMeta?.positionLocked, waiting: false, editedAt: time };
    }
    // 70: 새 재고 기록에 대상 배치 표시
    for (const rec of draft.inventoryHistory) if (!rec.scenario && !priorInventory.has(JSON.stringify(rec))) rec.scenario = draft.settings.scenario;
    // 60: 크기가 바뀐 객체는 크기 제한 검사, 실제 설비 확인 해제, 규격 변경 이력(설계만 변경)
    for (const o of after.objects) {
      const old = beforeObjects.get(o.id);
      if (!old || sameDims(old, o)) continue;
      const c = o.resizeConstraints;
      if (c && (o.width < c.minWidth - EPS || o.depth < c.minDepth - EPS || o.width > c.maxWidth + EPS || o.depth > c.maxDepth + EPS)) throw new Error('설정된 최소·최대 크기를 벗어났습니다.');
      o.physicalConfirmation = null;
      draft.specificationHistory.push({ id: nextId(), time, rackId: o.id, code: o.code, scenario: draft.settings.scenario, type: 'design-only', before: dims(old), after: dims(o), source: '도면 편집 · 실제 설비 변경 미확인' });
      if (draft.specificationHistory.length > SPEC_HISTORY_LIMIT) draft.specificationHistory.shift();
    }
    // 50: 경고 허용 정책 동기화(설정의 policy를 바꾸면 allowWarnings가 따라간다)
    if (draft.settings.policy !== oldPolicy) draft.editing.allowWarnings = draft.settings.policy === 'warn';
    draft.settings.policy = draft.editing.allowWarnings ? 'warn' : 'block';
    for (const o of after.objects) {
      if (o.kind !== 'aisle' || beforeObjects.has(o.id)) continue;
      const rule = draft.aisleRules[o.aisleType] || draft.aisleRules[AISLE_TYPES[0]];
      o.minWidth = rule.minWidth;
      o.targetWidth = rule.targetWidth;
      o.warningsEnabled = rule.enabled;
      o.clearanceAxis ??= 'auto';
    }
    validateProject(draft);
    const finalAfter = clone(active(draft));
    const ids = changedIds(before, finalAfter);
    const invalid = ids.size ? newSpatialWarnings(draft, before, finalAfter, ids) : [];
    if (invalid.length && !draft.editing.allowWarnings && !overrideAllow) throw new Error(invalid[0].text);
    if (ids.size) log(draft, { command, ids, before, after: finalAfter, success: true, now: () => time, nextId });
    return { ok: true, project: draft, ids };
  } catch (e) {
    const failed = clone(project);
    const ids = new Set(before.objects.filter((o) => new Set(selection).has(o.id)).map((o) => o.id));
    log(failed, { command, ids, before, after: before, success: false, reason: e.message, now, nextId });
    return { ok: false, project: failed, reason: e.message, logged: true };
  }
}

// ── 명령 ──────────────────────────────────────────────────────────────

/** 다음 표시 코드(기준본 nextCode): 랙 R-001, 그 외 '<종류> 001'. */
export function nextCode(layout, kind) {
  const codes = new Set(layout.objects.map((o) => o.code));
  const prefix = kind === 'rack' ? 'R-' : `${OBJECT_TYPES[kind]} `;
  let i = 1;
  while (codes.has(prefix + String(i).padStart(3, '0'))) i++;
  return prefix + String(i).padStart(3, '0');
}

/** 스냅이 켜져 있으면 정밀 스냅 간격에 맞춘다(기준본 80 snapped). */
export const snapped = (p, n) => (p.settings.snap ? snapToStep(n, p.precision.snapStep) : n);

/** 점을 중심으로 새 객체를 추가하는 변경 함수. 창고 밖 점은 null(기준본은 무시). */
export function addObjectAt(project, kind, point, { nextId, rack = RACK_DEFAULTS } = {}) {
  const W = active(project).warehouse;
  if (!(point.x >= 0 && point.y >= 0 && point.x <= W.width && point.y <= W.height)) return null;
  const [w, d] = NEW_OBJECT_SIZES[kind] || [rack.width, rack.depth];
  const id = nextId();
  return {
    id,
    mutate(draft, layout) {
      const o = createObject(kind, snapped(draft, point.x - w / 2), snapped(draft, point.y - d / 2), w, d, { id, code: nextCode(layout, kind) }, { nextId });
      if (kind === 'rack') Object.assign(o, { height: rack.height, type: rack.type, unit: String(rack.unit).trim() });
      layout.objects.push(o);
    },
  };
}

export const deleteObjects = (ids) => (draft, layout) => {
  const set = new Set(ids);
  layout.objects = layout.objects.filter((o) => !set.has(o.id));
};

/** 복제: 새 ID·새 코드로 0.5m 오른쪽 아래에. 새 ID 목록을 함께 돌려준다. */
export function duplicateObjects(source, { nextId }) {
  const ids = source.map(() => nextId());
  return {
    ids,
    mutate(draft, layout) {
      source.forEach((o, i) => {
        layout.objects.push({ ...clone(o), id: ids[i], code: nextCode(layout, o.kind), x: addMm(o.x, 0.5), y: addMm(o.y, 0.5) });
      });
    },
  };
}

export const rotateObjects = (ids) => (draft, layout) => {
  const set = new Set(ids);
  for (const o of layout.objects) if (set.has(o.id)) o.rotation = (o.rotation + 90) % 360;
};

/** 방향키 미세 이동(기준본 Q.nudge). fast는 Shift 고속 이동. */
export function nudgeObjects(project, ids, dx, dy, fast = false) {
  const step = fast ? project.precision.fastStep : project.precision.keyStep;
  const set = new Set(ids);
  return {
    step,
    mutate(draft, layout) {
      for (const o of layout.objects) {
        if (!set.has(o.id)) continue;
        o.x = addMm(o.x, dx * step);
        o.y = addMm(o.y, dy * step);
      }
    },
  };
}

/** 속성 입력 한 칸(기준본 renderInspector onchange). 숫자 칸의 빈 값은 NaN(검증에서 거부), 수량 칸의 빈 값은 null(미확인). */
export const NULLABLE_FIELDS = new Set(['capacity', 'quantity']);
export function fieldValue(field, raw, isNumber) {
  if (!isNumber) return raw;
  if (NULLABLE_FIELDS.has(field)) return raw === '' ? null : Number(raw);
  return raw === '' ? NaN : Number(raw);
}
export const setField = (id, field, value) => (draft, layout) => {
  const o = layout.objects.find((x) => x.id === id);
  if (o) o[field] = value;
};

/**
 * 설계 치수 직접 입력(기준본 65 renderInspector 래퍼: 객체 1개 선택 시 폭·깊이 칸). 빈 값은 0(크기 제한에서 거부).
 * 비율 고정이면 다른 변을 같은 비율로 바꾼다.
 */
export const DIMENSION_COMMAND = '설계 치수 직접 입력';
export const setDimension = (id, field, raw) => (draft, layout) => {
  const o = layout.objects.find((x) => x.id === id);
  if (!o) return;
  const v = Number(raw);
  if (o.resizeConstraints?.aspectLocked) {
    const other = field === 'width' ? 'depth' : 'width';
    o[other] = (o[other] * v) / o[field];
  }
  o[field] = v;
};

/** 정밀 입력 칸(X·Y·폭·깊이, 객체 1개 선택) 검사: 빈 값·숫자 아님·1mm 단위 아님은 거부(기준본 80 Q.input, 명령 기록 없음). */
export const MM_INPUT_FIELDS = new Set(['x', 'y', 'width', 'depth']);
export const MM_INPUT_MESSAGE = '숫자를 0.001m 단위까지 입력하세요. 기존 위치·규격을 유지합니다.';
export function isMmInput(raw) {
  const n = Number(raw);
  return raw !== '' && Number.isFinite(n) && Math.abs(n * 1e3 - Math.round(n * 1e3)) <= 1e-6;
}

export const setPositionLock = (id, value) => (draft, layout) => {
  const o = layout.objects.find((x) => x.id === id);
  if (o) o.placementMeta.positionLocked = value;
};

export const selectAllRacks = (layout) => new Set(layout.objects.filter((o) => o.kind === 'rack').map((o) => o.id));

// ── 드래그 이동(기준본 50 move 제스처 + 80 정밀 + 90 위치 잠금) ─────────────

/** 드래그 중 이동량: 선두 객체 위치를 스냅에 맞춘 차이. */
export function dragDelta(project, lead, start, point) {
  return {
    dx: snapped(project, lead.x + point.x - start.x) - lead.x,
    dy: snapped(project, lead.y + point.y - start.y) - lead.y,
  };
}

const boxOf = (os) => {
  const bs = os.map(bounds);
  const minX = Math.min(...bs.map((b) => b.minX)), maxX = Math.max(...bs.map((b) => b.maxX));
  const minY = Math.min(...bs.map((b) => b.minY)), maxY = Math.max(...bs.map((b) => b.maxY));
  return { minX, maxX, minY, maxY, width: maxX - minX, depth: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
};

/**
 * 정렬 가이드(기준본 Q.dragDelta). 다른 랙의 외곽·중심선, 양옆(위아래) 랙 사이 균등 간격 후보 중 가까운 것을 찾는다.
 * 허용 거리는 화면 6px(최대 0.04m). 스냅과 가이드 흡착이 모두 켜져 있을 때만 이동량을 가이드에 맞춘다.
 * @param {number} pixelsPerMeter 현재 화면 배율
 * @returns {{ dx, dy, guides: object[] }}
 */
export function alignmentGuides(project, layout, originals, dx, dy, pixelsPerMeter) {
  if (!project.precision.guides) return { dx, dy, guides: [] };
  const ids = new Set(originals.map((o) => o.id));
  const rest = layout.objects.filter((o) => !ids.has(o.id) && o.kind === 'rack');
  if (!originals.length || !rest.length) return { dx, dy, guides: [] };
  const b = boxOf(originals.map((o) => ({ ...o, x: addMm(o.x, dx), y: addMm(o.y, dy) })));
  const tolerance = Math.min(0.04, 6 / Math.max(0.01, Math.abs(pixelsPerMeter || 20)));
  const candidates = { x: null, y: null };
  const offer = (axis, delta, line) => {
    if (Math.abs(delta) > tolerance) return;
    if (!candidates[axis] || Math.abs(delta) < Math.abs(candidates[axis].delta)) candidates[axis] = { delta, ...line };
  };
  const boxes = rest.map((o) => boxOf([o]));
  for (const r of boxes) {
    for (const key of ['minX', 'maxX', 'cx']) offer('x', r[key] - b[key], { type: 'x', value: r[key], from: Math.min(b.minY, r.minY) - 0.1, to: Math.max(b.maxY, r.maxY) + 0.1, label: 'X 외곽/중심 정렬' });
    for (const key of ['minY', 'maxY', 'cy']) offer('y', r[key] - b[key], { type: 'y', value: r[key], from: Math.min(b.minX, r.minX) - 0.1, to: Math.max(b.maxX, r.maxX) + 0.1, label: 'Y 외곽/중심 정렬' });
  }
  const overY = (r) => r.maxY > b.minY && r.minY < b.maxY, overX = (r) => r.maxX > b.minX && r.minX < b.maxX;
  const left = boxes.filter((r) => overY(r) && r.maxX <= b.minX).sort((a, c) => c.maxX - a.maxX)[0];
  const right = boxes.filter((r) => overY(r) && r.minX >= b.maxX).sort((a, c) => a.minX - c.minX)[0];
  const top = boxes.filter((r) => overX(r) && r.maxY <= b.minY).sort((a, c) => c.maxY - a.maxY)[0];
  const bottom = boxes.filter((r) => overX(r) && r.minY >= b.maxY).sort((a, c) => a.minY - c.minY)[0];
  if (left && right) offer('x', (left.maxX + right.minX) / 2 - b.cx, { type: 'equal-x', left: left.maxX, right: right.minX, bounds: b, label: 'X 외접 균등 간격' });
  if (top && bottom) offer('y', (top.maxY + bottom.minY) / 2 - b.cy, { type: 'equal-y', top: top.maxY, bottom: bottom.minY, bounds: b, label: 'Y 외접 균등 간격' });
  if (project.settings.snap && project.precision.guideSnap) {
    if (candidates.x) dx = addMm(dx, roundMm(candidates.x.delta));
    if (candidates.y) dy = addMm(dy, roundMm(candidates.y.delta));
  }
  return { dx, dy, guides: Object.values(candidates).filter(Boolean) };
}

/** 드래그 미리보기용 배치(원본 불변). */
export function movedLayout(layout, ids, dx, dy) {
  const set = new Set(ids);
  return { ...layout, objects: layout.objects.map((o) => (set.has(o.id) ? { ...o, x: addMm(o.x, dx), y: addMm(o.y, dy) } : o)) };
}

/**
 * 드래그 이동 확정(기준본 M.finish: 90 → 80 → 50). 스냅을 끈 경우 끝 위치를 mm로 맞춘다.
 * 위치 잠금 랙이 있거나 cancel이면 취소하고 실패 기록을 남긴다. 검증 실패나 새 공간 경고(허용 안 함)도 전체 취소.
 * 실제로 움직이지 않았으면 { ok: true, moved: false }.
 */
export function applyMove(project, ids, dx, dy, { cancel = false, now = () => new Date().toISOString(), nextId } = {}) {
  const before = active(project);
  const set = new Set(ids);
  const originals = before.objects.filter((o) => set.has(o.id));
  const command = originals.length > 1 ? '그룹 이동' : '객체 이동';
  // 90: 위치 잠금 랙이 있으면 취소로 바꾼다(기록 사유는 기준본처럼 '사용자 취소', 화면 안내는 notice).
  let notice = '';
  if (originals.some((o) => o.placementMeta?.positionLocked)) {
    cancel = true;
    notice = '위치 잠금된 랙이 포함되어 이동을 취소했습니다.';
  }
  const lead = originals[0];
  if (!cancel) {
    // 80: 끝 위치 정리(스냅 켬: 그대로, 끔: mm 반올림)
    const nowX = addMm(lead.x, dx), nowY = addMm(lead.y, dy);
    dx = (project.settings.snap ? nowX : roundMm(nowX)) - lead.x;
    dy = (project.settings.snap ? nowY : roundMm(nowY)) - lead.y;
    if (!(Math.abs(dx) + Math.abs(dy) > EPS)) return { ok: true, moved: false, project };
  }
  const draft = clone(project);
  const fail = (text) => {
    const failed = clone(project);
    log(failed, { command, ids: set, before, after: before, success: false, reason: text, now, nextId });
    return { ok: false, moved: false, project: failed, reason: notice || text };
  };
  if (cancel) return fail('사용자 취소');
  for (const o of active(draft).objects) {
    if (!set.has(o.id)) continue;
    const old = before.objects.find((x) => x.id === o.id);
    o.x = addMm(old.x, dx);
    o.y = addMm(old.y, dy);
  }
  let invalid;
  try {
    validateProject(draft);
    invalid = newSpatialWarnings(draft, before, active(draft), set);
  } catch (e) {
    invalid = [{ text: e.message }];
  }
  if (invalid.length && !draft.editing.allowWarnings) return fail(invalid[0].text);
  log(draft, { command, ids: set, before, after: clone(active(draft)), success: true, now, nextId });
  return { ok: true, moved: true, project: draft };
}
