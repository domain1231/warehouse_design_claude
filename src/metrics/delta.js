// C3: 랙별 용적률 Δ 지도 계산(순수 함수). BEFORE↔AFTER 랙은 rackDiff의 Excel 키로 짝짓는다.
import { scenarioSpace } from './space.js';
import { rackDiff } from '../warehouse/scenarios.js';

/** 밝기(명도)로 개선 정도를 읽도록 초록 3단계를 명도 순으로 둔다. text는 채움색 위 글자색. */
export const DELTA_BINS = [
  { id: 'up40', label: '+40%p 이상', color: '#8ff0b5', text: '#0b1118' },
  { id: 'up20', label: '+20~40%p', color: '#2fb36c', text: '#0b1118' },
  { id: 'up1', label: '+1~20%p', color: '#1d5e40', text: '#ffffff' },
  { id: 'same', label: '변화 없음', color: '#3a4552', text: '#ffffff' },
  { id: 'emptied', label: '비움(이전 완료)', color: '#a7b0ba', text: '#0b1118', icon: '∅' },
  { id: 'worse', label: '악화', color: '#ff6b6b', text: '#ffffff', halo: '#7a1010', pattern: 'hatch' },
  { id: 'unknown', label: '미확인', color: '#6b7480', text: '#ffffff', dash: true },
  { id: 'new', label: '신규', color: '#5aa9ff', text: '#0b1118' },
];

// C10(D-073): BEFORE에 자재가 있던 랙이 AFTER에서 비면 악화가 아니라 '비움(이전 완료)'으로 따로 칠한다.
const binOf = (d) => (d >= 40 ? 'up40' : d >= 20 ? 'up20' : d >= 1 ? 'up1' : d > -1 ? 'same' : 'worse');

export function rackDeltaMap(project) {
  const { before, after } = project.scenarios, d = rackDiff(before, after);
  const per = (key, l) => new Map(scenarioSpace(project, key, l).perRack.map((x) => [x.id, x]));
  const pb = per('before', before), pa = per('after', after);
  // 로케이션 행은 있는데 자재높이가 모두 0인 경우만 '비움'. 연결 로케이션이 아예 없으면(R 없음) 지금처럼 미확인.
  const emptied = (b, a) => { const x = pb.get(b.id), y = pa.get(a.id); return !!x && !!y && !x.empty && y.empty && y.rows.length > 0; };
  const rb = new Map([...pb].map(([k, x]) => [k, x.r])), ra = new Map([...pa].map(([k, x]) => [k, x.r]));
  const racks = [];
  const row = (o, rB, rA, delta, bin, types, locB, locA) => racks.push({ id: o.id, code: o.code, rB, rA, delta, bin, types, locB, locA });
  for (const m of d.matched) {
    const rB = rb.get(m.before.id) ?? null, rA = ra.get(m.after.id) ?? null;
    const delta = rB === null || rA === null ? null : Math.round((rA - rB) * 1000) / 10;
    row(m.after, rB, rA, delta, emptied(m.before, m.after) ? 'emptied' : delta === null ? 'unknown' : binOf(delta), m.types.filter((t) => t !== 'unchanged'), pb.get(m.before.id)?.rows.length ?? 0, pa.get(m.after.id)?.rows.length ?? 0);
  }
  for (const o of d.added) row(o, null, ra.get(o.id) ?? null, null, 'new', [], null, pa.get(o.id)?.rows.length ?? 0);
  const counts = Object.fromEntries(DELTA_BINS.map((b) => [b.id, racks.filter((r) => r.bin === b.id).length]));
  return { racks, removed: d.removed.map((o) => ({ id: o.id, code: o.code })), counts, ready: before.objects.some((o) => o.kind === 'rack') };
}

export const CHANGE_TYPE_NAMES = { moved: '이동', rotated: '회전', resized: '규격', added: '신규', removed: '제거' };
const GROUP = { up40: 'better', up20: 'better', up1: 'better', worse: 'worse', same: 'same', emptied: 'emptied' };
const GROUP_NAMES = { better: '개선', worse: '악화', same: '변화 없음', emptied: '비움', other: '기타' };

/** C4: 랙 변화 목록(AFTER 랙 전부 + 제거된 BEFORE 랙). filter: all|better|worse|same|emptied|other, sort: delta-desc|delta-asc|code. */
export function rackChangeList(project, { filter = 'all', sort = 'delta-desc' } = {}) {
  const m = rackDeltaMap(project), { before } = project.scenarios;
  const rows = m.racks.map((r) => ({ ...r, group: GROUP[r.bin] ?? 'other', types: r.bin === 'new' ? ['added'] : r.types }));
  const per = new Map(scenarioSpace(project, 'before', before).perRack.map((x) => [x.id, x]));
  for (const o of m.removed) rows.push({ id: o.id, code: o.code, group: 'other', locB: per.get(o.id)?.rows.length ?? 0, locA: null, rB: per.get(o.id)?.r ?? null, rA: null, delta: null, bin: 'removed', types: ['removed'] });
  const byCode = (a, b) => String(a.code).localeCompare(String(b.code), undefined, { numeric: true });
  const dir = sort === 'delta-asc' ? 1 : -1;
  const cmp = sort === 'code' ? byCode : (a, b) => (a.delta === null) - (b.delta === null) || (a.delta === null ? 0 : dir * (a.delta - b.delta)) || byCode(a, b);
  return rows.filter((r) => filter === 'all' || r.group === filter).sort(cmp);
}

const pct1 = (v) => (v === null ? '' : (v * 100).toFixed(1));
export function changeListCsvRows(rows) {
  return [['랙', '로케이션 수 BEFORE', '로케이션 수 AFTER', 'BEFORE R %', 'AFTER R %', 'Δ %p', '구분', '배치 변경'],
    ...rows.map((r) => [r.code, r.locB ?? '', r.locA ?? '', pct1(r.rB), pct1(r.rA), r.delta === null ? '' : (r.delta < 0 ? '−' : r.delta > 0 ? '+' : '') + Math.abs(r.delta).toFixed(1), GROUP_NAMES[r.group], r.types.length ? r.types.map((t) => CHANGE_TYPE_NAMES[t]).join('·') : '—'])];
}

/** D2(D-079): 랙의 '열' 키 = Excel 랙 키(건물-열-랙번호)에서 마지막 랙 번호를 뺀 값. Excel 미연결이면 null. */
export const columnKeyOf = (o) => { const k = o?.excel?.key; if (typeof k !== 'string') return null; const i = k.lastIndexOf('-'); return i > 0 ? k.slice(0, i) : null; };

/**
 * D2(D-079): Δ 지도 '열 단위 요약'. 열마다 BEFORE·AFTER 랙 용적률 R의 평균(두 값이 모두 있는 랙만)과 Δ(%p, 0.1 반올림).
 * 열의 모든 랙이 '비움'이면 비움, R을 알 수 없으면 미확인. label은 열 이름(건물이 달라 겹치면 전체 키).
 */
export function columnDeltaMap(project, map = rackDeltaMap(project)) {
  const after = new Map(project.scenarios.after.objects.filter((o) => o.kind === 'rack').map((o) => [o.id, o]));
  const groups = new Map();
  for (const r of map.racks) {
    const key = columnKeyOf(after.get(r.id));
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const short = (k) => k.slice(k.lastIndexOf('-') + 1);
  const dup = new Set([...groups.keys()].map(short).filter((x, i, a) => a.indexOf(x) !== i));
  return [...groups].map(([key, rs]) => {
    const both = rs.filter((r) => r.rB !== null && r.rA !== null);
    const mean = (f) => (both.length ? both.reduce((a, r) => a + f(r), 0) / both.length : null);
    const rB = mean((r) => r.rB), rA = mean((r) => r.rA);
    const delta = rB === null ? null : Math.round((rA - rB) * 1000) / 10;
    const bin = rs.every((r) => r.bin === 'emptied') ? 'emptied' : delta === null ? 'unknown' : binOf(delta);
    return { key, label: dup.has(short(key)) ? key : short(key), rackIds: rs.map((r) => r.id), rB, rA, delta, bin };
  }).sort((a, b) => a.key.localeCompare(b.key, 'ko', { numeric: true }));
}
