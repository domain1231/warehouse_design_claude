// 2-슬롯 원자적 프로젝트 저장소.
//
// 키 구조 (prefix 기본값 'warehouse-layout-v2'):
//   <prefix>:slot-a, <prefix>:slot-b  프로젝트 저장 원문(기준본과 같은 warehouse-backup-zip-v1 형식)
//   <prefix>:pointer                  {"format":"warehouse-layout-pointer-v1","active":"a"|"b","revision":n,...}
//
// 저장 순서: 검증 → 동시 저장 확인 → 무변경 생략 → 직렬화·압축·복원 확인 → 비활성 슬롯 쓰기 →
//            읽기 확인 → 포인터 직전 동시 저장 재확인 → 포인터 교체(단일 setItem) → 포인터 읽기 확인.
// 포인터를 바꾸기 전 어느 단계에서 실패해도 활성 슬롯과 포인터는 그대로이므로 기존 저장본이 보존된다.
// 포인터 교체 후 비활성 슬롯은 직전 저장본(last-good)이 된다.
//
// 기준본 키(warehouse-studio-v1)는 읽기만 하고 수정하지 않는다(D-006).
import { packProject, unpackStored } from './zip.js';

export const POINTER_FORMAT = 'warehouse-layout-pointer-v1';
export const DEFAULT_PREFIX = 'warehouse-layout-v2';
export const LEGACY_KEY = 'warehouse-studio-v1';

export class StoreError extends Error {
  constructor(message, { code, stage, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'StoreError';
    this.code = code; // VALIDATION | CONFLICT | CORRUPT | QUOTA | VERIFY | STORAGE | STATE
    this.stage = stage;
  }
}

const isQuota = (e) => e?.name === 'QuotaExceededError' || e?.code === 22 || e?.code === 1014;

function canonical(project) {
  const { persistence, ...rest } = project;
  return JSON.stringify(rest);
}

function parsePointer(raw) {
  const p = JSON.parse(raw);
  if (!p || p.format !== POINTER_FORMAT || !['a', 'b'].includes(p.active) || !Number.isSafeInteger(p.revision) || p.revision < 1) {
    throw new Error('저장 포인터 형식 오류');
  }
  return p;
}

export function createProjectStore({ storage, prefix = DEFAULT_PREFIX, legacyKey = LEGACY_KEY, validate = (p) => p, now = () => new Date().toISOString() }) {
  if (!storage) throw new TypeError('storage가 필요합니다.');
  const keys = { pointer: `${prefix}:pointer`, a: `${prefix}:slot-a`, b: `${prefix}:slot-b` };
  let base; // 마지막으로 읽거나 쓴 포인터 원문(null = 포인터 없음). undefined면 아직 load 전.
  let corrupt = false;
  let cache = null; // { pointerRaw, canonical, persistence }
  let chain = Promise.resolve();

  const op = (stage, fn) => {
    try {
      return fn();
    } catch (e) {
      if (e instanceof StoreError) throw e;
      throw new StoreError(isQuota(e) ? '저장 공간이 부족해 저장하지 못했습니다.' : `저장소 작업 실패: ${e?.message || e}`, {
        code: isQuota(e) ? 'QUOTA' : 'STORAGE',
        stage,
        cause: e,
      });
    }
  };

  async function decode(raw, stage) {
    try {
      const text = await unpackStored(raw);
      return validate(JSON.parse(text));
    } catch (e) {
      throw new StoreError(`저장본을 읽을 수 없습니다: ${e?.message || e}`, { code: 'CORRUPT', stage, cause: e });
    }
  }

  async function load() {
    const pointerRaw = op('pointer-read', () => storage.getItem(keys.pointer));
    base = pointerRaw;
    corrupt = false;
    cache = null;
    if (pointerRaw !== null) {
      try {
        const ptr = parsePointer(pointerRaw);
        const raw = op('slot-read', () => storage.getItem(keys[ptr.active]));
        if (raw === null) throw new StoreError('활성 슬롯이 비어 있습니다.', { code: 'CORRUPT', stage: 'slot-read' });
        const project = await decode(raw, 'slot-decode');
        cache = { pointerRaw, canonical: canonical(project), persistence: project.persistence };
        return { status: 'loaded', source: `slot-${ptr.active}`, revision: ptr.revision, project };
      } catch (e) {
        corrupt = true;
        const error = e instanceof StoreError ? e : new StoreError(e.message, { code: 'CORRUPT', stage: 'pointer-decode', cause: e });
        return { status: 'corrupt', error, lastGoodAvailable: (await lastGood().catch(() => null)) !== null };
      }
    }
    const legacy = op('legacy-read', () => storage.getItem(legacyKey));
    if (legacy !== null) {
      try {
        return { status: 'loaded', source: 'legacy', revision: null, project: await decode(legacy, 'legacy-decode') };
      } catch (e) {
        corrupt = true;
        return { status: 'corrupt', error: e, lastGoodAvailable: false };
      }
    }
    return { status: 'empty', source: null, revision: null, project: null };
  }

  /** 비활성 슬롯의 직전 저장본. 없거나 읽을 수 없으면 null. */
  async function lastGood() {
    const pointerRaw = storage.getItem(keys.pointer);
    if (pointerRaw === null) return null;
    const ptr = parsePointer(pointerRaw);
    const raw = storage.getItem(keys[ptr.active === 'a' ? 'b' : 'a']);
    if (raw === null) return null;
    return decode(raw, 'last-good-decode');
  }

  async function doSave(project, { force = false, replaceCorrupt = false } = {}) {
    if (base === undefined) throw new StoreError('저장 전에 load()로 현재 저장본을 확인해야 합니다.', { code: 'STATE', stage: 'state' });
    let candidate;
    try {
      candidate = validate(structuredClone(project));
    } catch (e) {
      throw new StoreError(`프로젝트 검증 실패: ${e?.message || e}`, { code: 'VALIDATION', stage: 'validation', cause: e });
    }

    const current = op('pointer-read', () => storage.getItem(keys.pointer));
    if (current !== base && !force) {
      throw new StoreError('다른 탭 또는 창에서 이 프로젝트가 먼저 저장되었습니다. 덮어쓰지 않았습니다.', { code: 'CONFLICT', stage: 'concurrency' });
    }
    if (corrupt && current === base && !replaceCorrupt) {
      throw new StoreError('기존 저장본이 손상되어 있어 보호 중입니다. JSON으로 보관한 뒤 교체를 확인하세요.', { code: 'CORRUPT', stage: 'protected' });
    }
    const ptr = current === null ? null : (() => {
      try {
        return parsePointer(current);
      } catch {
        return null;
      }
    })();

    if (ptr && cache?.pointerRaw === current && cache.canonical === canonical(candidate)) {
      base = current;
      return { state: 'UNCHANGED', revision: ptr.revision, persistence: cache.persistence };
    }

    const revision = Math.max(ptr?.revision ?? 0, candidate.persistence?.revision ?? 0) + 1;
    candidate.persistence = { lastSavedAt: now(), revision };
    const text = JSON.stringify(candidate);
    let packed;
    try {
      packed = await packProject(text);
      if ((await unpackStored(packed)) !== text) throw new Error('압축 복원 불일치');
    } catch (e) {
      throw new StoreError(`저장 형식 변환 실패: ${e?.message || e}`, { code: isQuota(e) ? 'QUOTA' : 'VERIFY', stage: 'compress-verify', cause: e });
    }

    const target = ptr?.active === 'a' ? 'b' : 'a';
    op('slot-write', () => storage.setItem(keys[target], packed));
    const stored = op('slot-readback', () => storage.getItem(keys[target]));
    if (stored !== packed) throw new StoreError('저장 후 읽기 확인 불일치', { code: 'VERIFY', stage: 'slot-readback' });
    if ((await unpackStored(stored).catch(() => null)) !== text) throw new StoreError('저장 후 복원 확인 불일치', { code: 'VERIFY', stage: 'slot-verify' });

    // 압축은 비동기이므로 그 사이 다른 탭이 저장했을 수 있다. 포인터 교체 직전에 다시 확인한다.
    const latest = op('pointer-read', () => storage.getItem(keys.pointer));
    if (latest !== current) {
      throw new StoreError('저장 중 다른 탭 또는 창에서 먼저 저장되었습니다. 덮어쓰지 않았습니다.', { code: 'CONFLICT', stage: 'concurrency-final' });
    }
    const pointerRaw = JSON.stringify({ format: POINTER_FORMAT, active: target, revision, savedAt: candidate.persistence.lastSavedAt, bytes: packed.length });
    op('pointer-write', () => storage.setItem(keys.pointer, pointerRaw));
    const pointerBack = op('pointer-readback', () => storage.getItem(keys.pointer));
    if (pointerBack !== pointerRaw) {
      try {
        if (current === null) storage.removeItem(keys.pointer);
        else storage.setItem(keys.pointer, current);
      } catch {
        // 복구 실패는 아래 오류로 보고한다
      }
      throw new StoreError('포인터 읽기 확인 불일치. 이전 포인터로 되돌렸습니다.', { code: 'VERIFY', stage: 'pointer-readback' });
    }

    base = pointerRaw;
    corrupt = false;
    cache = { pointerRaw, canonical: canonical(candidate), persistence: candidate.persistence };
    return { state: 'SAVED', revision, persistence: candidate.persistence, slot: target };
  }

  /** 저장 요청은 같은 저장소 안에서 순서대로 처리한다(동시 호출 직렬화). */
  function save(project, options) {
    const run = chain.then(() => doSave(project, options));
    chain = run.catch(() => {});
    return run;
  }

  /** 다른 탭의 storage 이벤트가 이 저장소의 포인터 변경인지 판정한다. */
  function isExternalChange(event) {
    return event?.key === keys.pointer && event.newValue !== base;
  }

  return { keys, load, save, lastGood, isExternalChange };
}
