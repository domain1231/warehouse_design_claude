// E5(D-089): 배치 백업(layoutBackups) 안 Excel·배치 스냅샷 중복 제거. DOM 없음.
// 백업은 만들 때 대상의 스냅샷 전체를 복사한다(기준본 R.capture). 이력이 늘수록 백업마다 같은 스냅샷이 다시 들어가 파일이 누적해 커진다(F6).
// 메모리의 프로젝트는 그대로 두고(복원·검증 동작 변화 없음) 저장할 때만 바꾼다:
//   백업 안 스냅샷이 같은 ID·같은 내용(JSON 문자열 일치)의 최상위 스냅샷과 같으면 {"$ref": "<ID>"}로 쓴다.
// 읽을 때(validateProject 맨 앞) 참조를 최상위 스냅샷의 복사본으로 되돌린다. 참조 대상이 없거나 ID가 겹치면 오류(참조가 끊긴 스냅샷 0건).
// 되돌림: 기준본·이전 앱은 백업 안 배열 형식만 검사하므로 파일은 열리고, 참조가 든 백업 복원만 검증 실패로 전체 취소된다.
//         완전 호환 파일은 JSON 저장 형식 '기준본 호환 JSON'(참조를 펼친 들여쓰기 JSON)으로 저장한다.

import { packSnapshotDeltas, expandSnapshotDeltas, deepSame } from './snapshot-delta.js';

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
  // 성능(D-096): 최상위 전체를 문자열로 바꾸지 않고, 같은 ID 짝만 구조 비교(deepSame — JSON 문자열 일치와 같은 판정)한다.
  const top = Object.fromEntries(REF_KINDS.map((k) => [k, idMap(project[k])]));
  let changed = false;
  const layoutBackups = project.layoutBackups.map((b) => {
    if (!b || typeof b !== 'object') return b;
    let out = b;
    for (const k of REF_KINDS) {
      if (!Array.isArray(b[k])) continue;
      const list = b[k].map((s) => {
        if (isBackupRef(s) || typeof s?.id !== 'string') return s;
        const t = top[k].get(s.id);
        return t && (t === s || deepSame(t, s)) ? { [REF_KEY]: s.id } : s;
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

// ── E6(D-090): 자동 배치 확인 이력(autoPlacement.history)의 배치 ──
// 이력 항목의 layout은 적용 직후 대상 배치 전체 복사본이고, 같은 가져오기의 배치 스냅샷(layoutSnapshots[].layout)과 같다(apply.js).
// 기준본·이전 앱 검증기는 이력마다 layout을 요구하고 validateLayout으로 검사하므로, 참조는 '객체를 비운 유효한 배치 + 표시'로 쓴다:
//   layout: { ...원래 배치(객체 제외), objects: [], "$layoutSnapshot": "<스냅샷 ID>" }
// 기준본은 이 항목을 객체 없는 배치로 읽는다(이력 화면이 없어 영향 없음). 읽을 때 같은 ID 스냅샷 배치로 되돌린다.
// 스냅샷이 없어졌으면(이전 앱에서 지우고 저장한 경우) 객체 없는 배치로 남긴다 — 이력은 기록용이고 화면·계산에 쓰이지 않음.
export const LAYOUT_REF_KEY = '$layoutSnapshot';
const isLayoutRef = (l) => !!l && typeof l === 'object' && typeof l[LAYOUT_REF_KEY] === 'string';

/** 저장용 사본: 이력 배치가 같은 ID·같은 내용의 배치 스냅샷과 같으면 객체를 비운 참조 배치로. 입력은 바꾸지 않는다. */
export function packHistoryRefs(project) {
  const history = project?.autoPlacement?.history;
  if (!Array.isArray(history) || !history.length) return project;
  const unique = new Map();
  for (const s of Array.isArray(project.layoutSnapshots) ? project.layoutSnapshots : []) if (typeof s?.id === 'string') unique.set(s.id, unique.has(s.id) ? null : s);
  // 성능(D-096): 배치 문자열 대신 객체 수로 후보를 좁힌 뒤 구조 비교. 같은 배치가 여럿이면 배열 순서상 첫 스냅샷(이전과 같음).
  const byCount = new Map();
  for (const [id, s] of unique) {
    if (!s?.layout || !Array.isArray(s.layout.objects)) continue;
    const n = s.layout.objects.length;
    if (!byCount.has(n)) byCount.set(n, []);
    byCount.get(n).push([id, s.layout]);
  }
  let changed = false;
  const next = history.map((h) => {
    if (!h?.layout || isLayoutRef(h.layout) || !Array.isArray(h.layout.objects)) return h;
    const hit = (byCount.get(h.layout.objects.length) ?? []).find(([, l]) => l === h.layout || deepSame(l, h.layout));
    if (!hit) return h;
    changed = true;
    return { ...h, layout: { ...h.layout, objects: [], [LAYOUT_REF_KEY]: hit[0] } };
  });
  return changed ? { ...project, autoPlacement: { ...project.autoPlacement, history: next } } : project;
}

/** 읽기: 참조 배치를 같은 ID 스냅샷 배치 복사본으로 되돌린다(입력 객체를 고친다). 스냅샷이 없으면 그대로 둔다. */
export function expandHistoryRefs(p) {
  const history = p?.autoPlacement?.history;
  if (!Array.isArray(history) || !history.some((h) => isLayoutRef(h?.layout))) return p;
  const snaps = new Map();
  for (const s of Array.isArray(p.layoutSnapshots) ? p.layoutSnapshots : []) if (typeof s?.id === 'string') snaps.set(s.id, snaps.has(s.id) ? null : s);
  for (const h of history) {
    if (!isLayoutRef(h?.layout)) continue;
    const s = snaps.get(h.layout[LAYOUT_REF_KEY]);
    if (s?.layout) h.layout = structuredClone(s.layout);
  }
  return p;
}

/**
 * 저장할 때 쓰는 줄임 전체: 백업 안 스냅샷 참조 → 자동 배치 이력 배치 참조 → 기준일 스냅샷 차분(D-094).
 * 참조는 펼친 최상위 스냅샷과 비교해 만들므로 차분은 마지막에 한다.
 */
export const packProjectRefs = (project) => packSnapshotDeltas(packHistoryRefs(packBackupRefs(project)));
/** 읽을 때 펼침: 차분 → 자동 배치 이력 배치 → 백업 안 스냅샷(저장의 역순). */
export const expandProjectRefs = (p) => expandBackupRefs(expandHistoryRefs(expandSnapshotDeltas(p)));
/** 펼치지 못하고 남은 이력 참조 개수(스냅샷이 사라진 경우). */
export const countHistoryRefs = (p) => (p?.autoPlacement?.history ?? []).filter((h) => isLayoutRef(h?.layout)).length;

/** 프로젝트 안 참조 개수(진단·검사용). */
export const countBackupRefs = (p) => (p?.layoutBackups ?? []).reduce((n, b) => n + REF_KINDS.reduce((m, k) => m + (Array.isArray(b?.[k]) ? b[k].filter(isBackupRef).length : 0), 0), 0);
