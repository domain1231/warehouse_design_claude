// 변경분(patch) 기반 실행취소·다시 실행.
//
// 기준본은 편집마다 프로젝트 전체 JSON 문자열을 최대 60개 쌓았다(이력·백업 포함, 편집 크기와 무관하게 비용 증가).
// 재구축본은 편집 전후의 구조 차이만 기록한다. 되돌리는 범위는 기준본과 같다(persistence를 뺀 프로젝트 전체 —
// 재고·배치 이력 기록도 실행취소 대상). persistence는 저장 계층이 관리하므로 기록하지 않는다.
//
// 패치 = [{ path: (string|number)[], before, after }], 값은 깊은 복사본이다(참조 공유 없음).
// 배열은 길이가 같으면 원소 단위로, 길이가 다르면 배열 전체를 한 번에 기록한다.

const IGNORED_ROOT_KEYS = new Set(['persistence']);
const MISSING = Symbol('missing');

const copy = (v) => (v === MISSING || v === undefined ? v : structuredClone(v));
const isObject = (v) => v !== null && typeof v === 'object';

function sameScalar(a, b) {
  return Object.is(a, b);
}

function diffInto(before, after, path, ops) {
  if (sameScalar(before, after)) return;
  const arrays = Array.isArray(before) && Array.isArray(after);
  const objects = isObject(before) && isObject(after) && !Array.isArray(before) && !Array.isArray(after);
  if (arrays && before.length === after.length) {
    for (let i = 0; i < before.length; i++) diffInto(before[i], after[i], [...path, i], ops);
    return;
  }
  if (objects) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const k of keys) {
      if (path.length === 0 && IGNORED_ROOT_KEYS.has(k)) continue;
      const b = Object.hasOwn(before, k) ? before[k] : MISSING;
      const a = Object.hasOwn(after, k) ? after[k] : MISSING;
      if (b === MISSING || a === MISSING) {
        if (b !== a) ops.push({ path: [...path, k], before: copy(b), after: copy(a) });
      } else {
        diffInto(b, a, [...path, k], ops);
      }
    }
    return;
  }
  ops.push({ path, before: copy(before), after: copy(after) });
}

/** 두 프로젝트 상태의 차이(패치). 같으면 빈 배열. */
export function diff(before, after) {
  const ops = [];
  diffInto(before, after, [], ops);
  return ops;
}

function setAt(root, path, value) {
  if (path.length === 0) throw new Error('루트 교체 패치는 지원하지 않습니다.');
  let node = root;
  for (let i = 0; i < path.length - 1; i++) {
    node = node[path[i]];
    if (!isObject(node)) throw new Error(`패치 경로가 현재 상태와 맞지 않습니다: ${path.join('.')}`);
  }
  const last = path[path.length - 1];
  if (value === MISSING) {
    if (Array.isArray(node)) throw new Error('배열 원소 삭제 패치는 지원하지 않습니다.');
    delete node[last];
  } else {
    node[last] = copy(value);
  }
}

/** 패치를 적용한다(direction: 'forward'는 after, 'backward'는 before). 대상 객체를 직접 수정한다. */
export function applyPatch(target, ops, direction) {
  const list = direction === 'backward' ? [...ops].reverse() : ops;
  for (const op of list) setAt(target, op.path, direction === 'backward' ? op.before : op.after);
  return target;
}

const approxBytes = (ops) => {
  let n = 0;
  for (const op of ops) n += JSON.stringify([op.path, op.before === MISSING ? null : op.before, op.after === MISSING ? null : op.after]).length;
  return n;
};

/** 실행취소 이력. limit는 기준본과 같은 60. */
export function createHistory({ limit = 60 } = {}) {
  let undoStack = [];
  let redoStack = [];

  return {
    /** 편집 전후 상태로 한 단계를 기록한다. 변화가 없으면 기록하지 않고 false. */
    record(before, after, label = '') {
      const ops = diff(before, after);
      if (ops.length === 0) return false;
      undoStack.push({ label, ops, bytes: approxBytes(ops) });
      if (undoStack.length > limit) undoStack = undoStack.slice(-limit);
      redoStack = [];
      return true;
    },
    /** 한 단계 되돌린다. 대상 상태를 직접 수정하고 단계 이름을 반환한다. 되돌릴 것이 없으면 null. */
    undo(target) {
      const step = undoStack.pop();
      if (!step) return null;
      applyPatch(target, step.ops, 'backward');
      redoStack.push(step);
      return step.label;
    },
    redo(target) {
      const step = redoStack.pop();
      if (!step) return null;
      applyPatch(target, step.ops, 'forward');
      undoStack.push(step);
      return step.label;
    },
    /** 적용에 실패한 undo/redo를 되돌릴 때 사용한다. */
    restore(snapshot) {
      undoStack = snapshot.undo;
      redoStack = snapshot.redo;
    },
    snapshot: () => ({ undo: [...undoStack], redo: [...redoStack] }),
    get canUndo() {
      return undoStack.length > 0;
    },
    get canRedo() {
      return redoStack.length > 0;
    },
    get size() {
      return { undo: undoStack.length, redo: redoStack.length };
    },
    /** 기록된 패치의 대략적인 크기(UTF-16 문자 수). 메모리 비교용. */
    get bytes() {
      return [...undoStack, ...redoStack].reduce((s, x) => s + x.bytes, 0);
    },
    clear() {
      undoStack = [];
      redoStack = [];
    },
  };
}
