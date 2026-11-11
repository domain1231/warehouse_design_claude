// Golden Master 비교 도우미.
// 기준 데이터(fixtures/golden)는 기준본 tools/golden-master.cjs가 정규화한 결과다.
// 재구축본 결과도 같은 규칙으로 정규화한 뒤 경로 단위로 비교한다.
//   - 숫자: 1e-9 반올림, -0은 0
//   - 객체: 키 정렬, 값이 undefined인 키 제거
// 허용오차는 반올림 단계에서만 적용한다. 비교 자체는 완전 일치다.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');

export function loadScenario(id) {
  const file = path.join(root, 'fixtures/golden', `${id}.json`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function round9(x) {
  const r = Math.round(x * 1e9) / 1e9;
  return Object.is(r, -0) ? 0 : r;
}

export function normalize(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? round9(value) : value;
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) out[key] = normalize(value[key]);
    }
    return out;
  }
  return value;
}

/** 정규화된 두 값의 차이를 [{path, expected, actual}]로 반환한다(최대 limit개). */
export function diff(expected, actual, limit = 20, at = '$', out = []) {
  if (out.length >= limit) return out;
  if (Object.is(expected, actual)) return out;
  const te = Array.isArray(expected) ? 'array' : typeof expected;
  const ta = Array.isArray(actual) ? 'array' : typeof actual;
  if (te !== ta || expected === null || actual === null || te !== 'object' && te !== 'array') {
    out.push({ path: at, expected, actual });
    return out;
  }
  if (te === 'array') {
    if (expected.length !== actual.length) out.push({ path: `${at}.length`, expected: expected.length, actual: actual.length });
    for (let i = 0; i < Math.min(expected.length, actual.length); i++) diff(expected[i], actual[i], limit, `${at}[${i}]`, out);
    return out;
  }
  for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
    diff(expected[key], actual[key], limit, `${at}.${key}`, out);
  }
  return out;
}

export function formatDiff(rows) {
  return rows.map((r) => `${r.path}: 기준 ${JSON.stringify(r.expected)} / 재구축 ${JSON.stringify(r.actual)}`).join('\n');
}

/**
 * 기준본 하네스(tools/golden-master.cjs)와 같은 정규화: 키 정렬, drop 키 제거, 숫자 1e-9 반올림,
 * ID 패턴 문자열을 순회 순서대로 ID#n 토큰으로 치환. 재구축본 ID 형식에 맞는 idPattern을 넘긴다.
 */
export const HARNESS_DROP = ['checkedAt', 'lastSavedAt', 'time', 'recordedAt', 'importedAt', 'createdAt', 'snapshotTime', 'versionId', 'elapsedMs', 'columnElapsedMs', 'columnCheckedMs', 'searchMs', 'renderMs', 'renderCount', 'started', 'deadline', 'heapBeforeBytes', 'heapAfterBytes', 'date', 'created', 'asOfDate', 'asOf', 'editedAt'];
export function normalizeLikeHarness(value, { idPattern, extraDrop = [] } = {}) {
  const ids = new Map();
  const drop = new Set([...HARNESS_DROP, ...extraDrop]);
  const re = idPattern ? new RegExp(idPattern.source, 'g') : null;
  const token = (m) => {
    if (!ids.has(m)) ids.set(m, 'ID#' + (ids.size + 1));
    return ids.get(m);
  };
  const walk = (v) => {
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) return String(v);
      const r = Math.round(v * 1e9) / 1e9;
      return r === 0 ? 0 : r;
    }
    if (typeof v === 'string') return re ? v.replace(re, token) : v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const o = {};
      for (const k of Object.keys(v).sort()) {
        if (drop.has(k) || v[k] === undefined) continue;
        o[k] = walk(v[k]);
      }
      return o;
    }
    return v;
  };
  return walk(value);
}
