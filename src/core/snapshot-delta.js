// D-094: 기준일 스냅샷 차분 저장. DOM 없음.
// 배치 스냅샷(layoutSnapshots)·Excel 스냅샷(excelSnapshots)은 기준일마다 전체를 복사해 이력 수에 비례해 커진다(D-093).
// 메모리 프로젝트는 그대로 두고 저장할 때만, 같은 배치(BEFORE/AFTER)·같은 종류의 직전 기준일 스냅샷과 다른 부분만 쓴다.
//   { id, date, scenario, ...그 밖 정보, "$delta": { base: "<직전 스냅샷 ID>", patch } }   (layout / data 필드 없음)
// 읽을 때(validateProject 맨 앞) 기준일 순서로 되돌린다. 10개마다 전체 스냅샷(기준점)을 두어 한 곳이 손상돼도 영향이 이어지지 않게 한다.
// 안전장치: 저장 직전에 되돌린 결과가 원래와 JSON 문자열까지 같은지 확인하고, 다르면 그 스냅샷은 전체로 쓴다.
// 되돌림: 기준본·이전 시험판은 차분 스냅샷(layout/data 없음)을 검증에서 거부해 파일을 열지 않는다(데이터를 잘못 보여주지 않음).
//         이전 앱에서 열 파일은 '기준본 호환 JSON'(차분·참조를 모두 펼침)으로 저장한다.

import { deepSame } from './json-equal.js';

export { deepSame };
export const DELTA_KEY = '$delta';
export const KEYFRAME_EVERY = 10;
const BODY = { layoutSnapshots: 'layout', excelSnapshots: 'data' };
const KINDS = Object.keys(BODY);

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const keyed = (arr) => {
  if (!Array.isArray(arr)) return null;
  const m = new Map();
  for (const v of arr) {
    if (!isObj(v) || typeof v.id !== 'string' || m.has(v.id)) return null;
    m.set(v.id, v);
  }
  return m;
};

const sameKeys = (x, y) => x.length === y.length && x.every((v, i) => v === y[i]);

/** a → b 패치. 같으면 undefined. 결과는 JSON으로 저장할 수 있는 값. */
export function diff(a, b) {
  if (a === b) return undefined;
  if (isObj(a) && isObj(b)) {
    const set = {}, del = [];
    let changed = false;
    for (const k of Object.keys(a)) if (a[k] !== undefined && (!(k in b) || b[k] === undefined)) { del.push(k); changed = true; }
    for (const k of Object.keys(b)) {
      if (b[k] === undefined) continue;
      if (!(k in a) || a[k] === undefined) { set[k] = { $v: b[k] }; changed = true; }
      else { const d = diff(a[k], b[k]); if (d !== undefined) { set[k] = d; changed = true; } }
    }
    const actual = Object.keys(b).filter((k) => b[k] !== undefined);
    const expect = [...Object.keys(a).filter((k) => a[k] !== undefined && !del.includes(k)), ...actual.filter((k) => !(k in a) || a[k] === undefined)];
    const reorder = !sameKeys(expect, actual);
    if (!changed && !reorder) return undefined;
    const out = { $o: set };
    if (del.length) out.$del = del;
    if (reorder) out.$keys = actual;
    return out;
  }
  const ka = keyed(a), kb = keyed(b);
  if (ka && kb) {
    const set = {};
    let changed = false;
    for (const [id, v] of kb) {
      if (!ka.has(id)) { set[id] = { $v: v }; changed = true; }
      else { const d = diff(ka.get(id), v); if (d !== undefined) { set[id] = d; changed = true; } }
    }
    const order = [...kb.keys()];
    const reorder = !sameKeys([...ka.keys()], order);
    if (!changed && !reorder) return undefined;
    const out = { $k: set };
    if (reorder) out.$order = order;
    return out;
  }
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    const set = {};
    let changed = false;
    for (let i = 0; i < b.length; i++) { const d = diff(a[i], b[i]); if (d !== undefined) { set[i] = d; changed = true; } }
    return changed ? { $a: set } : undefined;
  }
  if (deepSame(a, b)) return undefined;
  return { $v: b };
}

/** 패치 적용(입력 a는 바꾸지 않는다). share=true면 바뀌지 않은 부분을 복사하지 않고 공유한다(검증용). */
export function patch(a, p, share = false) {
  const keep = share ? (v) => v : (v) => (v === undefined ? v : structuredClone(v));
  if (p === undefined) return keep(a);
  if (!isObj(p)) throw new Error('차분 형식 오류');
  if ('$v' in p) return share ? p.$v : structuredClone(p.$v);
  if (p.$o) {
    if (!isObj(a)) throw new Error('차분 기준 형식 오류(객체)');
    const del = new Set(p.$del ?? []);
    const out = {};
    const keys = p.$keys ?? [...Object.keys(a).filter((k) => !del.has(k) && a[k] !== undefined), ...Object.keys(p.$o).filter((k) => !(k in a) || a[k] === undefined)];
    for (const k of keys) out[k] = k in p.$o ? patch(a[k], p.$o[k], share) : keep(a[k]);
    return out;
  }
  if (p.$k) {
    const ka = keyed(a);
    if (!ka) throw new Error('차분 기준 형식 오류(ID 배열)');
    const order = p.$order ?? [...ka.keys()];
    return order.map((id) => {
      if (id in p.$k) return patch(ka.get(id), p.$k[id], share);
      if (!ka.has(id)) throw new Error('차분 기준 형식 오류(ID 없음)');
      return keep(ka.get(id));
    });
  }
  if (p.$a) {
    if (!Array.isArray(a)) throw new Error('차분 기준 형식 오류(배열)');
    return a.map((v, i) => (i in p.$a ? patch(v, p.$a[i], share) : keep(v)));
  }
  throw new Error('차분 형식 오류');
}

const isDelta = (s) => isObj(s) && isObj(s[DELTA_KEY]);

/** 스냅샷 1개를 차분으로(본문 필드 자리에 $delta를 두어 키 순서를 보존). */
function encodeOne(cur, body, baseId, d) {
  const enc = {};
  for (const k of Object.keys(cur)) {
    if (k === body) enc[DELTA_KEY] = { base: baseId, patch: d ?? null };
    else enc[k] = cur[k];
  }
  return enc;
}
/** 차분 1개를 전체로(같은 자리에 본문 필드). */
function decodeOne(s, body, base, share = false) {
  const out = {};
  for (const k of Object.keys(s)) {
    if (k === DELTA_KEY) out[body] = patch(base[body], s[DELTA_KEY].patch ?? undefined, share);
    else out[k] = s[k];
  }
  return out;
}

/** 같은 종류·같은 배치의 스냅샷을 기준일 순서로(같은 날짜는 원래 순서). */
function chains(list) {
  const by = new Map();
  list.forEach((s, i) => {
    if (!isObj(s) || typeof s.scenario !== 'string' || typeof s.date !== 'string') return;
    if (!by.has(s.scenario)) by.set(s.scenario, []);
    by.get(s.scenario).push(i);
  });
  for (const idx of by.values()) idx.sort((x, y) => (list[x].date < list[y].date ? -1 : list[x].date > list[y].date ? 1 : x - y));
  return [...by.values()];
}

/** 저장용 사본: 기준일 스냅샷을 직전 스냅샷 차분으로. 입력은 바꾸지 않는다. 줄일 것이 없으면 입력 그대로. */
export function packSnapshotDeltas(project) {
  let out = project;
  for (const kind of KINDS) {
    const list = project?.[kind];
    if (!Array.isArray(list) || list.length < 2) continue;
    const ids = new Map();
    for (const s of list) if (isObj(s)) ids.set(s.id, (ids.get(s.id) ?? 0) + 1);
    const body = BODY[kind];
    let next = null;
    for (const chain of chains(list)) {
      for (let n = 1; n < chain.length; n++) {
        if (n % KEYFRAME_EVERY === 0) continue; // 기준점(전체)
        const base = list[chain[n - 1]], cur = list[chain[n]];
        if (isDelta(cur) || isDelta(base) || typeof base.id !== 'string' || ids.get(base.id) !== 1 || !(body in cur) || !(body in base)) continue;
        const d = diff(base[body], cur[body]);
        let enc;
        try {
          enc = encodeOne(cur, body, base.id, d);
          if (!deepSame(decodeOne(enc, body, base, true), cur)) continue; // 안전장치: 되돌린 결과가 키 순서까지 같을 때만
        } catch { continue; }
        // 줄어드는 양이 작으면(패치가 본문의 절반 초과) 전체로. 성능(D-096): 객체가 많은 큰 본문은 패치가 64KB를 넘을 때만 본문 길이를 잰다.
        if (d !== undefined) {
          const dl = JSON.stringify(d).length, items = cur[body]?.objects ?? cur[body];
          const big = Array.isArray(items) && items.length > 50;
          if ((!big || dl > 65536) && dl * 2 > JSON.stringify(cur[body]).length) continue;
        }
        next ??= list.slice();
        next[chain[n]] = enc;
      }
    }
    if (next) out = { ...(out === project ? project : out), [kind]: next };
  }
  return out;
}

/** 읽기: 차분 스냅샷을 전체로 되돌린다(입력 객체를 고친다). 기준이 없거나 형식이 틀리면 오류. */
export function expandSnapshotDeltas(p) {
  for (const kind of KINDS) {
    const list = p?.[kind];
    if (!Array.isArray(list) || !list.some(isDelta)) continue;
    const body = BODY[kind];
    const byId = new Map();
    for (const s of list) if (isObj(s) && typeof s.id === 'string') byId.set(s.id, byId.has(s.id) ? null : s);
    for (const chain of chains(list)) {
      for (const i of chain) {
        const s = list[i];
        if (!isDelta(s)) continue;
        const baseId = s[DELTA_KEY].base;
        const base = byId.get(baseId);
        if (base === undefined) throw new Error(`스냅샷 차분 오류: ${kind} 기준 ${baseId} 없음`);
        if (base === null) throw new Error(`스냅샷 차분 오류: ${kind} 기준 ${baseId} ID 중복`);
        if (isDelta(base) || !(body in base)) throw new Error(`스냅샷 차분 오류: ${kind} 기준 ${baseId} 순서 오류`);
        const full = decodeOne(s, body, base);
        list[i] = full;
        if (typeof s.id === 'string' && byId.get(s.id) === s) byId.set(s.id, full);
      }
    }
  }
  return p;
}

export const countSnapshotDeltas = (p) => KINDS.reduce((n, k) => n + (Array.isArray(p?.[k]) ? p[k].filter(isDelta).length : 0), 0);
