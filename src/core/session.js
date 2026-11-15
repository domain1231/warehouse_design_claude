// 편집 세션: 현재 프로젝트, 편집 확정(검증 → 실행취소 기록 → 자동 저장), 저장 상태, 다른 탭 충돌.
// DOM에 의존하지 않는다. 화면은 subscribe로 상태를 받아 그린다.
//
// 상태(status):
//   loading  초기 로드 중
//   saved    검증된 저장 완료 (저장소가 쓰기 후 읽기 확인까지 통과)
//   unsaved  메모리에 저장되지 않은 변경 있음
//   saving   저장 진행 중
//   error    저장 실패. 메모리의 편집은 유지된다. error.code: QUOTA | CONFLICT | CORRUPT | VERIFY | VALIDATION | STORAGE
// 편집은 검증에 실패하면 적용하지 않는다(프로젝트·이력 불변).
import { checkpointReason } from '../persistence/backups.js';
import { createProject, validateProject, assertIndependent } from './project.js';
import { createHistory } from './history.js';
import { createIdGenerator } from './ids.js';
import { scanLayout, layoutSignature } from '../warehouse/constraints.js';

export function projectValidator(p) {
  const v = validateProject(p);
  assertIndependent(v);
  return v;
}

/**
 * 기준본 V.write 래퍼(90 W.storeResults)와 같이 저장 직전에 BEFORE/AFTER 배치 검사 결과를 프로젝트에 기록한다.
 * 배치 지문이 같으면 기존 결과(검사 시각 포함)를 유지해 내용이 같은 저장이 생략되도록 한다.
 * 열 우선 모드 배치는 열 조건 보강 검사(autolayout/column.js 등록)의 지문으로 비교한다(기준본 92 validateProject 래퍼).
 * 불러올 때(init)도 호출해 저장된 결과가 현재 배치와 다르면 다시 계산한다(F-041). 지문이 같으면 그대로 둔다.
 */
export function storeScanResults(project, { now } = {}) {
  const results = project.autoPlacement.results;
  for (const k of ['before', 'after']) {
    const layout = project.scenarios[k];
    if (layout.autoPlacementRules?.mode === 'column') {
      const scan = scanLayout(layout, project, now ? { now } : undefined);
      if (results[k]?.fingerprint !== scan.fingerprint) results[k] = JSON.parse(JSON.stringify(scan));
      continue;
    }
    if (results[k]?.fingerprint === layoutSignature(layout, project)) continue;
    results[k] = JSON.parse(JSON.stringify(scanLayout(layout, project, now ? { now } : undefined)));
  }
  return project;
}

export function createSession({ store, nextId, today, now = () => new Date().toISOString(), historyLimit = 60, autosave = true, backups = null }) {
  const ids = nextId ?? createIdGenerator();
  const history = createHistory({ limit: historyLimit });
  const listeners = new Set();
  const state = {
    project: null,
    status: 'loading',
    source: null, // 'slot-a' | 'slot-b' | 'legacy' | 'new' | 'corrupt'
    error: null, // { code, stage, message }
    notice: '',
    corrupt: false,
    lastFailure: null, // 적용 실패(전체 취소) 직전 프로젝트 원문 { reason, text, time } — 복구 JSON 내려받기용(기준본 R.lastFailure)
  };

  const emit = () => {
    for (const fn of listeners) fn(view());
  };
  const view = () => ({
    project: state.project,
    status: state.status,
    source: state.source,
    error: state.error,
    notice: state.notice,
    corrupt: state.corrupt,
    lastFailure: state.lastFailure,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
  });

  async function init() {
    const r = await store.load();
    if (r.status === 'loaded') {
      state.project = r.project;
      try {
        storeScanResults(state.project); // 저장된 검사 결과가 현재 배치와 다르면 다시 계산(F-041). 다음 저장 때 기록된다.
      } catch {
        // 검사 모듈이 없는 환경(열 우선 미등록 등)에서는 저장된 결과를 그대로 둔다.
      }
      state.source = r.source;
      state.status = r.source === 'legacy' ? 'unsaved' : 'saved';
      if (r.source === 'legacy') state.notice = '기준본(v2.4.1) 저장 데이터를 불러왔습니다. 저장하면 새 저장 영역에 기록하며 기준본 데이터는 그대로 둡니다.';
    } else if (r.status === 'empty') {
      state.project = projectValidator(createProject({ sample: true, nextId: ids, today }));
      state.source = 'new';
      state.status = 'unsaved';
    } else {
      // 손상: 기존 저장본은 보호하고 빈 프로젝트로 시작한다. 저장은 명시적 교체 확인 후에만 가능하다.
      state.project = projectValidator(createProject({ sample: false, nextId: ids, today }));
      state.source = 'corrupt';
      state.corrupt = true;
      state.status = 'error';
      state.error = { code: 'CORRUPT', stage: r.error?.stage, message: `기존 저장본을 읽을 수 없어 보호 중입니다. ${r.lastGoodAvailable ? '직전 저장본이 있습니다. ' : ''}JSON 백업 후 교체를 확인하세요.` };
    }
    emit();
    return view();
  }

  // 저장은 한 번에 하나씩 순서대로 실행한다(편집 자동 저장과 화면 상태 저장이 겹쳐 스스로 충돌로 보이지 않게).
  let chain = Promise.resolve();
  let viewTimer = null;
  function save(opts) {
    const run = chain.then(() => saveNow(opts));
    chain = run.catch(() => {});
    return run;
  }

  async function saveNow({ force = false, replaceCorrupt = false } = {}) {
    if (!state.project) throw new Error('init() 전에는 저장할 수 없습니다.');
    clearTimeout(viewTimer);
    viewTimer = null;
    state.status = 'saving';
    emit();
    try {
      storeScanResults(state.project);
      const r = await store.save(state.project, { force, replaceCorrupt });
      state.project.persistence = structuredClone(r.persistence);
      state.status = 'saved';
      state.error = null;
      state.corrupt = false;
      if (state.notice && (r.state === 'SAVED' || force)) state.notice = '';
      emit();
      return r;
    } catch (e) {
      state.status = 'error';
      state.error = { code: e.code || 'STORAGE', stage: e.stage, message: e.message };
      emit();
      return { state: 'FAILED', error: state.error };
    }
  }

  /**
   * 편집을 확정한다. mutate(draft)는 복사본을 고친다. 검증 실패 시 아무것도 바꾸지 않고 오류를 던진다.
   * 성공하면 실행취소에 기록하고 autosave가 켜져 있으면 저장한다(저장 실패는 상태로 보고, 편집은 유지).
   */
  async function edit(label, mutate) {
    const before = state.project;
    const draft = structuredClone(before);
    mutate(draft);
    const next = projectValidator(draft);
    if (JSON.stringify(next) === JSON.stringify(before)) return { changed: false };
    const receipt = await checkpointFor(before, next, label); // 실패하면 오류를 던지고 편집을 적용하지 않는다
    if (!history.record(before, next, label)) return { changed: false };
    state.project = next;
    state.status = 'unsaved';
    emit();
    if (autosave) await saveWithReceipt(receipt);
    return { changed: true };
  }

  /**
   * 주요 작업(객체 2개 이상 삭제·BEFORE 변경·복원) 직전 전체 프로젝트 백업(기준본 75 commit 래퍼 + V.checkpoint).
   * 백업 실패는 편집을 막는다(기준본과 같음). 영수증은 이어지는 저장이 실패하면 백업을 되돌리는 데 쓴다.
   */
  async function checkpointFor(before, next, label) {
    if (!backups) return null;
    const reason = checkpointReason(before, next, label);
    if (!reason) return null;
    try {
      return (await backups.checkpoint(before, reason)).receipt;
    } catch (e) {
      state.error = { code: e.code || 'STORAGE', stage: e.stage, message: '프로젝트 백업 실패 · 편집을 적용하지 않았습니다: ' + e.message };
      emit();
      throw new Error(state.error.message);
    }
  }
  async function saveWithReceipt(receipt) {
    const r = await save();
    if (receipt && r.state === 'FAILED') {
      try {
        backups.rollback(receipt);
      } catch {
        // 되돌리기 실패는 저장 오류로 이미 보고됨. 백업 링에는 직전 상태 백업이 하나 더 남을 뿐이다.
      }
    }
    return r;
  }

  /**
   * 전체 프로젝트 교체(JSON 불러오기, 기준본 V.install): 검증 → 현재 프로젝트 백업 → 교체(실행취소 가능) → 저장.
   * 저장에 실패하면 이전 프로젝트로 되돌리고 백업도 되돌린다(전체 교체 취소).
   * @returns {{ ok: boolean, reason?: string }}
   */
  async function replaceProject(data, label) {
    const before = state.project;
    let next;
    try {
      next = projectValidator(structuredClone(data));
    } catch (e) {
      return { ok: false, reason: e.message };
    }
    let receipt = null;
    if (backups) {
      try {
        receipt = (await backups.checkpoint(before, label + ' 적용 전')).receipt;
      } catch (e) {
        return { ok: false, reason: '현재 프로젝트 백업 실패: ' + e.message };
      }
    }
    const snapshot = history.snapshot();
    history.record(before, next, label);
    state.project = next;
    state.status = 'unsaved';
    emit();
    const r = await save();
    if (r.state === 'FAILED') {
      history.restore(snapshot);
      state.project = before;
      if (receipt) backups.rollback(receipt);
      emit();
      return { ok: false, reason: r.error.message };
    }
    return { ok: true };
  }

  /** 검증된 적용 전 복구 JSON(기준본 V.recoveryText). 없거나 검증 실패면 null. */
  function recoveryText() {
    if (!state.lastFailure) return null;
    try {
      projectValidator(JSON.parse(state.lastFailure.text));
      return state.lastFailure.text;
    } catch {
      return null;
    }
  }

  /**
   * 편집 명령 실행. compute(project, { nextId, now })는 src/warehouse/commands.js의 applyCommand/applyMove 결과를 돌려준다.
   * 성공: 실행취소에 기록하고 저장. 실패: 기준본처럼 실패 명령 기록(commandHistory)만 남기고 저장(실행취소 기록 없음).
   * @returns 명령 결과({ ok, reason?, ... })
   */
  async function apply(label, compute) {
    if (!state.project) throw new Error('init() 전에는 편집할 수 없습니다.');
    const before = state.project;
    const r = compute(before, { nextId: ids, now });
    if (r && r.ok === false && r.project === before) {
      state.lastFailure = { reason: r.reason, text: JSON.stringify(before), time: now() };
      emit();
    }
    if (!r || r.project === before) return r;
    let receipt = null;
    if (r.ok) {
      const next = projectValidator(r.project);
      if (JSON.stringify(next) === JSON.stringify(before)) return { ...r, changed: false };
      try {
        receipt = await checkpointFor(before, next, label);
      } catch (e) {
        return { ...r, ok: false, reason: e.message, project: before };
      }
      if (!history.record(before, next, label)) return { ...r, changed: false };
      state.project = next;
    } else {
      state.project = projectValidator(r.project);
    }
    state.status = 'unsaved';
    emit();
    if (autosave && !state.corrupt) await saveWithReceipt(receipt);
    return r;
  }

  async function step(kind) {
    const snapshot = history.snapshot();
    const draft = structuredClone(state.project);
    const label = kind === 'undo' ? history.undo(draft) : history.redo(draft);
    if (label === null) return { changed: false };
    try {
      state.project = projectValidator(draft);
    } catch (e) {
      history.restore(snapshot);
      throw e;
    }
    state.status = 'unsaved';
    emit();
    if (autosave) await save();
    return { changed: true, label };
  }

  /**
   * 화면·편집 환경 상태(카메라 viewport, 선택, 경고 허용, 스냅·정밀 간격)를 바꾼다. 기준본처럼 프로젝트에 저장하지만 실행취소 기록에는 넣지 않는다.
   * 확대·이동 중 매 프레임 저장하지 않도록 delay(ms) 뒤에 한 번 저장한다. delay가 0이면 바로 저장한다.
   * viewport 값은 스키마 범위(배율 0.05–30, 이동 ±5000m, fitScale 0.001–100000)로 제한한다.
   */
  function setView({ viewport, selection, selectionRule, allowWarnings, snap, precision, scenario, beforeLocked, panels, rackInfographic } = {}, { delay = 250 } = {}) {
    if (!state.project) throw new Error('init() 전에는 화면 상태를 바꿀 수 없습니다.');
    const next = { ...state.project };
    if (viewport) {
      const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
      if (![viewport.zoom, viewport.panX, viewport.panY].every(Number.isFinite)) throw new Error('화면 상태 값이 올바르지 않습니다.');
      next.viewport = { zoom: clamp(viewport.zoom, 0.05, 30), panX: clamp(viewport.panX, -5e3, 5e3), panY: clamp(viewport.panY, -5e3, 5e3), centerLocked: !!viewport.centerLocked };
      if (Number.isFinite(viewport.fitScale) && viewport.fitScale > 0) next.viewport.fitScale = Math.max(1e-3, Math.min(1e5, viewport.fitScale));
    }
    if (selection) next.editing = { ...state.project.editing, selectedRackIds: [...selection], selectionScenario: state.project.settings.scenario };
    // 편집 환경 설정(기준본은 실행취소 없이 바로 저장): 경고 허용 정책, 스냅, 정밀 이동 간격
    if (typeof allowWarnings === 'boolean') {
      next.editing = { ...(next.editing ?? state.project.editing), allowWarnings };
      next.settings = { ...state.project.settings, policy: allowWarnings ? 'warn' : 'block' };
    }
    if (selectionRule === 'intersect' || selectionRule === 'contain') next.editing = { ...(next.editing ?? state.project.editing), selectionRule };
    if (typeof snap === 'boolean') next.settings = { ...(next.settings ?? state.project.settings), snap };
    if (precision) next.precision = { ...state.project.precision, ...precision };
    // BEFORE/AFTER 전환(기준본 R.switch): 대상의 자동 배치 설정을 현재 설정으로 복사하고 선택을 비운다.
    if (scenario === 'before' || scenario === 'after') {
      next.settings = { ...(next.settings ?? state.project.settings), scenario };
      next.locationLayout = structuredClone(state.project.scenarioMeta[scenario].locationLayout);
      next.editing = { ...(next.editing ?? state.project.editing), selectedRackIds: [], selectionScenario: scenario };
    }
    // BEFORE 원본 잠금 전환(기준본 rLock). 해제 확인은 화면에서 받는다.
    // 패널 접기·랙 목록 검색/필터/정렬(기준본 50 M.togglePanel, 65 B.capture): 실행취소 없이 저장
    if (panels) next.panels = { ...state.project.panels, ...panels, view: { ...state.project.panels.view, ...(panels.view ?? {}) } };
    // 랙 상세 선반 번호 방향(기준본 65 sShelfOrder: save만, 실행취소 없음)
    if (rackInfographic) next.rackInfographic = { ...state.project.rackInfographic, ...rackInfographic };
    if (typeof beforeLocked === 'boolean') next.scenarioMeta = { ...state.project.scenarioMeta, before: { ...state.project.scenarioMeta.before, locked: beforeLocked } };
    if (allowWarnings !== undefined || selectionRule !== undefined || snap !== undefined || precision || scenario !== undefined || beforeLocked !== undefined || panels || rackInfographic) projectValidator(structuredClone(next));
    const viewKeys = ['viewport', 'editing', 'settings', 'precision', 'locationLayout', 'scenarioMeta', 'panels', 'rackInfographic'];
    if (JSON.stringify(viewKeys.map((k) => next[k])) === JSON.stringify(viewKeys.map((k) => state.project[k]))) return { changed: false };
    state.project = next;
    if (state.status !== 'error') state.status = 'unsaved';
    emit();
    if (!autosave || state.corrupt) return { changed: true };
    clearTimeout(viewTimer);
    if (delay <= 0) return save().then(() => ({ changed: true }));
    viewTimer = setTimeout(() => save(), delay);
    return { changed: true };
  }

  /** 예약된 화면 상태 저장을 바로 실행한다(페이지를 떠나기 전 등). */
  function flushView() {
    if (!viewTimer) return Promise.resolve(null);
    return save();
  }

  /** 다른 탭·창의 storage 이벤트를 받아 안내한다. 저장 시에는 저장소가 덮어쓰기를 막는다. */
  function handleStorageEvent(event) {
    if (!store.isExternalChange(event)) return false;
    state.notice = '다른 탭 또는 창에서 이 프로젝트가 저장되었습니다. 이 탭에서 저장하면 덮어쓰지 않고 중단합니다. 다른 탭의 내용을 보려면 이 탭의 작업을 JSON으로 보관한 뒤 새로고침하세요.';
    emit();
    return true;
  }

  return {
    init,
    save,
    edit,
    apply,
    replaceProject,
    recoveryText,
    undo: () => step('undo'),
    redo: () => step('redo'),
    handleStorageEvent,
    setView,
    flushView,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    get state() {
      return view();
    },
    /** 새 객체 ID 생성기(명령 전에 ID가 필요할 때). */
    get nextId() {
      return ids;
    },
    get historyBytes() {
      return history.bytes;
    },
  };
}
