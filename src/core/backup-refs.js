// E5(D-089): 배치 백업(layoutBackups) 안 Excel·배치 스냅샷 중복 제거. DOM 없음.
// 백업은 만들 때 대상의 스냅샷 전체를 복사한다(기준본 R.capture). 이력이 늘수록 백업마다 같은 스냅샷이 다시 들어가 파일이 누적해 커진다(F6).
// 메모리의 프로젝트는 그대로 두고(복원·검증 동작 변화 없음) 저장할 때만 바꾼다:
//   백업 안 스냅샷이 같은 ID·같은 내용(JSON 문자열 일치)의 최상위 스냅샷과 같으면 {"$ref": "<ID>"}로 쓴다.
// 읽을 때(validateProject 맨 앞) 참조를 최상위 스냅샷의 복사본으로 되돌린다. 참조 대상이 없거나 ID가 겹치면 오류(참조가 끊긴 스냅샷 0건).
// 되돌림: 기준본·이전 앱은 백업 안 배열 형식만 검사하므로 파일은 열리고, 참조가 든 백업 복원만 검증 실패로 전체 취소된다.
//         완전 호환 파일은 JSON 저장 형식 '기준본 호환 JSON'(참조를 펼친 들여쓰기 JSON)으로 저장한다.

export const REF_KEY = '$ref';
export const REF_KINDS = Object.freeze(['excelSnapshots', 'layoutSnapshots']);

export const isBackupRef = (s) => !!s && typeof s === 'object' && !Array.isArray(s) && typeof s[REF_KEY] === 'string' && Object.keys(s).length === 1;

/** 최상위 스냅샷 ID → 스냅샷(ID가 한 번만 나오는 것만). 겹치는 ID는 null. */
function idMap(list) {
  const m = new Map();
  for (const s of Array.isArray(list) ? list : []) {
    if (typeof s?.id !== 'string') continue;
    m.set(s.id, m.has(s.id) ? null : s);
  }
  return m;
}

/**
 * 저장용 사본. 입력은 바꾸지 않는다(바뀐 백업만 얕게 복사). 줄일 것이 없으면 입력을 그대로 돌려준다.
 * 이미 참조인 항목은 그대로 둔다(여러 번 적용해도 같음).
 */
export function packBackupRefs(project) {
  if (!Array.isArray(project?.layoutBackups) || !project.layoutBackups.length) return project;
  const text = {};
  for (const k of REF_KINDS) {
    text[k] = new Map();
    for (const [id, s] of idMap(project[k])) if (s) text[k].set(id, JSON.stringify(s));
  }
  let changed = false;
  const layoutBackups = project.layoutBackups.map((b) => {
    if (!b || typeof b !== 'object') return b;
    let out = b;
    for (const k of REF_KINDS) {
      if (!Array.isArray(b[k])) continue;
      const list = b[k].map((s) => {
        if (isBackupRef(s) || typeof s?.id !== 'string') return s;
        const t = text[k].get(s.id);
        return t !== undefined && t === JSON.stringify(s) ? { [REF_KEY]: s.id } : s;
      });
      if (list.some((s, i) => s !== b[k][i])) {
        if (out === b) out = { ...b };
        out[k] = list;
        changed = true;
      }
    }
    return out;
  });
  return changed ? { ...project, layoutBackups } : project;
}

/** 읽기: 참조를 최상위 스냅샷 복사본으로 되돌린다(입력 객체를 고친다). 참조가 없으면 아무것도 하지 않는다. */
export function expandBackupRefs(p) {
  if (!Array.isArray(p?.layoutBackups)) return p;
  let maps = null;
  for (const b of p.layoutBackups) {
    for (const k of REF_KINDS) {
      if (!Array.isArray(b?.[k]) || !b[k].some(isBackupRef)) continue;
      maps ??= Object.fromEntries(REF_KINDS.map((key) => [key, idMap(p[key])]));
      b[k] = b[k].map((s) => {
        if (!isBackupRef(s)) return s;
        const hit = maps[k].get(s[REF_KEY]);
        if (hit === undefined) throw new Error(`백업 참조 오류: ${k} ${s[REF_KEY]} 없음`);
        if (hit === null) throw new Error(`백업 참조 오류: ${k} ${s[REF_KEY]} ID 중복`);
        return structuredClone(hit);
      });
    }
  }
  return p;
}

/** 프로젝트 안 참조 개수(진단·검사용). */
export const countBackupRefs = (p) => (p?.layoutBackups ?? []).reduce((n, b) => n + REF_KINDS.reduce((m, k) => m + (Array.isArray(b?.[k]) ? b[k].filter(isBackupRef).length : 0), 0), 0);
