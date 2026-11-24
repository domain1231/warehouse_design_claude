// C3: 랙별 용적률 Δ 지도 계산(순수 함수). BEFORE↔AFTER 랙은 rackDiff의 Excel 키로 짝짓는다.
import { scenarioSpace } from './space.js';
import { rackDiff } from '../warehouse/scenarios.js';

/** 밝기(명도)로 개선 정도를 읽도록 초록 3단계를 명도 순으로 둔다. text는 채움색 위 글자색. */
export const DELTA_BINS = [
  { id: 'up40', label: '+40%p 이상', color: '#8ff0b5', text: '#0b1118' },
  { id: 'up20', label: '+20~40%p', color: '#2fb36c', text: '#0b1118' },
  { id: 'up1', label: '+1~20%p', color: '#1d5e40', text: '#ffffff' },
  { id: 'same', label: '변화 없음', color: '#3a4552', text: '#ffffff' },
  { id: 'worse', label: '악화', color: '#ff6b6b', text: '#ffffff', halo: '#7a1010', pattern: 'hatch' },
  { id: 'unknown', label: '미확인', color: '#6b7480', text: '#ffffff', dash: true },
  { id: 'new', label: '신규', color: '#5aa9ff', text: '#0b1118' },
];

const binOf = (d) => (d >= 40 ? 'up40' : d >= 20 ? 'up20' : d >= 1 ? 'up1' : d > -1 ? 'same' : 'worse');

export function rackDeltaMap(project) {
  const { before, after } = project.scenarios, d = rackDiff(before, after);
  const rOf = (key, l) => new Map(scenarioSpace(project, key, l).perRack.map((x) => [x.id, x.r]));
  const rb = rOf('before', before), ra = rOf('after', after);
  const racks = [];
  const row = (o, rB, rA, delta, bin, types) => racks.push({ id: o.id, code: o.code, rB, rA, delta, bin, types });
  for (const m of d.matched) {
    const rB = rb.get(m.before.id) ?? null, rA = ra.get(m.after.id) ?? null;
    const delta = rB === null || rA === null ? null : Math.round((rA - rB) * 1000) / 10;
    row(m.after, rB, rA, delta, delta === null ? 'unknown' : binOf(delta), m.types.filter((t) => t !== 'unchanged'));
  }
  for (const o of d.added) row(o, null, ra.get(o.id) ?? null, null, 'new', []);
  const counts = Object.fromEntries(DELTA_BINS.map((b) => [b.id, racks.filter((r) => r.bin === b.id).length]));
  return { racks, removed: d.removed.map((o) => ({ id: o.id, code: o.code })), counts, ready: before.objects.some((o) => o.kind === 'rack') };
}
