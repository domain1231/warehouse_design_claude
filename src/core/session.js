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
import { createProject, validateProject, assertIndependent } from './project.js';
import { createHistory } from './history.js';

export function projectValidator(p) {
  const v = validateProject(p);
  assertIndependent(v);
  return v;
}

export function createSession({ store, nextId, today, historyLimit = 60, autosave = true }) {
  const history = createHistory({ limit: historyLimit });
  const listeners = new Set();
  const state = {
    project: null,
    status: 'loading',
    source: null, // 'slot-a' | 'slot-b' | 'legacy' | 'new' | 'corrupt'
    error: null, // { code, stage, message }
    notice: '',
    corrupt: false,
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
    canUndo: history.canUndo,
    canRedo: history.canRedo,
  });

  async function init() {
    const r = await store.load();
    if (r.status === 'loaded') {
      state.project = r.project;
      state.source = r.source;
      state.status = r.source === 'legacy' ? 'unsaved' : 'saved';
      if (r.source === 'legacy') state.notice = '기준본(v2.4.1) 저장 데이터를 불러왔습니다. 저장하면 새 저장 영역에 기록하며 기준본 데이터는 그대로 둡니다.';
    } else if (r.status === 'empty') {
      state.project = projectValidator(createProject({ sample: true, nextId, today }));
      state.source = 'new';
      state.status = 'unsaved';
    } else {
      // 손상: 기존 저장본은 보호하고 빈 프로젝트로 시작한다. 저장은 명시적 교체 확인 후에만 가능하다.
      state.project = projectValidator(createProject({ sample: false, nextId, today }));
      state.source = 'corrupt';
      state.corrupt = true;
      state.status = 'error';
      state.error = { code: 'CORRUPT', stage: r.error?.stage, message: `기존 저장본을 읽을 수 없어 보호 중입니다. ${r.lastGoodAvailable ? '직전 저장본이 있습니다. ' : ''}JSON 백업 후 교체를 확인하세요.` };
    }
    emit();
    return view();
  }

  async function save({ force = false, replaceCorrupt = false } = {}) {
    if (!state.project) throw new Error('init() 전에는 저장할 수 없습니다.');
    state.status = 'saving';
    emit();
    try {
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
    if (!history.record(before, next, label)) return { changed: false };
    state.project = next;
    state.status = 'unsaved';
    emit();
    if (autosave) await save();
    return { changed: true };
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
    undo: () => step('undo'),
    redo: () => step('redo'),
    handleStorageEvent,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    get state() {
      return view();
    },
    get historyBytes() {
      return history.bytes;
    },
  };
}
