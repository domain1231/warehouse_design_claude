// BEFORE/AFTER 시나리오 작업(기준본 70 R.install·openClone 적용부·R.restore·R.diff·compareRows·R.diffRows·R.desc + 75·80·90 install 래퍼). DOM 없음.
// 대상 변경은 모두 runTransaction(자동 백업·수정 이력·실패 시 전체 취소)으로 한다. 확인 창은 화면이 맡는다.
import { runTransaction, captureTarget } from '../excel/apply.js';
import { rackKey } from '../excel/proposal.js';
import { metrics } from './metrics.js';
import { aisleClearance } from '../geometry/clearance.js';
import { GEOMETRY_EPS_M as EPS } from '../geometry/tolerance.js';
import { formatNumber as fmt } from '../core/format.js';

export const CLONE_COMMAND = 'BEFORE→AFTER 복제';
export const RESTORE_COMMAND = '가져오기 백업 복원';
export const TYPE_NAMES = { moved: '이동', rotated: '회전', resized: '설계 규격 변경', unchanged: '변경 없음' };
const clone = (v) => (v === undefined ? undefined : structuredClone(v));
const racksOf = (l) => l.objects.filter((o) => o.kind === 'rack');
const sameSpec = (a, b) => ['width', 'depth', 'height'].every((k) => a[k] === b[k] || (Number.isFinite(a[k]) && Number.isFinite(b[k]) && Math.abs(a[k] - b[k]) < 1e-8));

/**
 * 기준본 R.install(+75 객체 색, 80 ZONE 이름, 90 자동 배치 설정·검토 메모). 복사본 b를 대상에 설치한다.
 * 다른 대상에서 온 스냅숏은 새 ID를 받고, 재고 기록은 ID를 유지한 채 대상 범위로 옮긴다(기준본 동작).
 */
export function installTarget(p, target, b, nextId) {
  p.scenarios[target] = clone(b.layout);
  p.scenarioMeta[target] = clone(b.meta);
  for (const key of ['excelSnapshots', 'layoutSnapshots', 'inventoryHistory']) {
    p[key] = p[key].filter((r) => r.scenario !== target).concat(clone(b[key] || []).map((r) => ({ ...r, ...(b.target === target || key === 'inventoryHistory' ? {} : { id: nextId() }), scenario: target })));
  }
  if (b.objectColors) p.theme.objectColors[target] = clone(b.objectColors);
  if (b.zoneNames) p.rackLabels.zoneNames[target] = clone(b.zoneNames);
  if (b.autoPlacement) {
    p.autoPlacement.settings[target] = clone(b.autoPlacement.settings);
    p.autoPlacement.reviewNotes[target] = clone(b.autoPlacement.reviewNotes);
  }
}

/**
 * 기준본 rCloneApply: BEFORE의 독립 복사본으로 AFTER를 교체(기존 AFTER는 자동 백업).
 * version=true면 AFTER 버전 ID·생성일을 새로 만든다. 잠금은 풀린 상태로 복제한다.
 */
export function cloneBeforeToAfter(project, { version = false, nextId, now }) {
  return runTransaction(project, 'after', CLONE_COMMAND, (P) => {
    const source = captureTarget(P, 'before');
    source.meta.locked = false;
    source.meta.versionId = P.scenarioMeta.after.versionId;
    if (version) {
      source.meta.versionId = nextId();
      source.meta.createdAt = now();
    }
    installTarget(P, 'after', source, nextId);
    P.scenarioMeta.after.locked = false;
  }, { nextId, now });
}

/** 기준본 R.restore 적용부: 백업을 대상에 설치(현재 대상 상태도 다시 백업). 백업이 없으면 오류. */
export function restoreBackup(project, id, { nextId, now }) {
  const backup = project.layoutBackups.find((b) => b.id === id);
  if (!backup) return { ok: false, project, reason: '백업이 만료되었거나 없습니다.' };
  const copy = clone(backup);
  return runTransaction(project, copy.target, RESTORE_COMMAND, (P) => installTarget(P, copy.target, copy, nextId), { nextId, now });
}

/** 기준본 R.diff: Excel 키(없으면 계보 ID)로 BEFORE·AFTER 랙을 짝지어 이동·회전·설계 규격 변경을 구분한다. */
export function rackDiff(before, after) {
  const b = new Map(racksOf(before).map((o) => [rackKey(o), o])), a = new Map(racksOf(after).map((o) => [rackKey(o), o])), matched = [], added = [], removed = [];
  const norm = (x) => ((x % 360) + 360) % 360;
  for (const [k, o] of b) {
    const n = a.get(k);
    if (!n) {
      removed.push(o);
      continue;
    }
    const types = [];
    if (Math.abs(o.x - n.x) + Math.abs(o.y - n.y) > 1e-6) types.push('moved');
    if (Math.abs(norm(o.rotation) - norm(n.rotation)) > 1e-6) types.push('rotated');
    if (!sameSpec(o, n)) types.push('resized');
    if (!types.length) types.push('unchanged');
    matched.push({ before: o, after: n, types });
  }
  for (const [k, o] of a) if (!b.has(k)) added.push(o);
  return { matched, added, removed };
}

/** 기준본 R.desc. */
export const rackDesc = (o) => (o ? `${fmt(o.x, 3)}/${fmt(o.y, 3)}/${fmt(o.rotation)}° · ${fmt(o.width, 3)}×${fmt(o.depth, 3)}×${o.height === null ? '미확인' : fmt(o.height, 3)}` : '—');

/** 기준본 R.diffRows(랙 변경 CSV 본문). */
export function diffRows(d) {
  const orig = (o) => (o.originalSpec ? rackDesc({ ...o, ...o.originalSpec }) : '미확인');
  return [
    ...d.added.map((o) => [o.code, '추가', '—', rackDesc(o), orig(o)]),
    ...d.removed.map((o) => [o.code, '제거', rackDesc(o), '—', orig(o)]),
    ...d.matched.map((r) => [r.after.code, r.types.map((k) => TYPE_NAMES[k]).join(' / '), rackDesc(r.before), rackDesc(r.after), r.after.originalSpec ? `${r.after.originalSpec.width}×${r.after.originalSpec.depth}×${r.after.originalSpec.height ?? '미확인'}` : '미확인']),
  ];
}
export const DIFF_CSV_HEADER = ['랙', '변경 유형', 'BEFORE 설계', 'AFTER 설계', '원본 규격'];

/** 기준본 compareRows(70:49 + 70:62 확장): 지표 비교표. 첫 행은 머리글. */
export function compareRows(project) {
  const B = project.scenarios.before, A = project.scenarios.after;
  const d = rackDiff(B, A), b = metrics(B, project), a = metrics(A, project), ready = racksOf(B).length > 0;
  const narrow = (l) => l.objects.filter((o) => o.kind === 'aisle').map((o) => aisleClearance(o, l)).filter((r) => r.enabled && r.width < r.min - EPS).length;
  const rows = [
    ['지표', 'BEFORE', 'AFTER', '차이 / 해석'],
    ['전체 랙 수', b.racks, a.racks, ready ? a.racks - b.racks : '기준 없음'],
    ['신규 랙', 0, d.added.length, ready ? d.added.length : '기준 없음'],
    ['제거 랙', d.removed.length, 0, ready ? -d.removed.length : '기준 없음'],
    ...['moved', 'rotated', 'resized'].map((t) => [TYPE_NAMES[t] + ' 랙', 0, d.matched.filter((r) => r.types.includes(t)).length, ready ? '복수 유형 집계' : '기준 없음']),
    ['랙 면적 합계 ㎡', fmt(b.rackArea, 4), fmt(a.rackArea, 4), ready ? fmt(a.rackArea - b.rackArea, 4) : '기준 없음'],
    ['랙 면적 점유율 %', fmt(b.footprint, 2), fmt(a.footprint, 2), ready ? fmt(a.footprint - b.footprint, 2) + '%p' : '기준 없음'],
    ['통로 최소 폭 위반', narrow(B), narrow(A), '사용자 단면 기준'],
    ['공간 경고', b.warnings.filter((r) => r.spatial).length, a.warnings.filter((r) => r.spatial).length, '경계·충돌·통로 포함 / 물리 경로 별도'],
    ['데이터 기준일', project.scenarioMeta.before.sourceInfo?.asOf || '미확인', project.scenarioMeta.after.sourceInfo?.asOf || '미확인', '시간 차이를 개선 효과로 해석하지 않음'],
  ];
  for (const unit of new Set([...Object.keys(b.units), ...Object.keys(a.units)])) {
    const u = b.units[unit], v = a.units[unit], f = (x) => (x?.capacityKnown ? `${fmt(x.capacity)} (${x.capacityKnown}/${x.total}랙 확인)` : '미확인');
    rows.push(['최대 보관 수량 ' + unit, f(u), f(v), u?.capacityKnown && v?.capacityKnown && ready ? fmt(v.capacity - u.capacity) : '확인된 수량만 집계 / 비교 미확인']);
  }
  rows.push(['전체 면적 ㎡', fmt(b.area), fmt(a.area), fmt(a.area - b.area)], ['잔여 면적 ㎡', fmt(b.remaining), fmt(a.remaining), fmt(a.remaining - b.remaining)], ['신규 랙 추가 가능 여부', '미판정', '미판정', '잔여 면적만으로 실제 배치 가능성을 확정하지 않음']);
  return rows;
}

/** C2: 배치 변경 한 줄 요약(rackDiff 결과). 변경이 없으면 ''. */
export function layoutChangeSummary(d) {
  const n = (t) => d.matched.filter((r) => r.types.includes(t)).length;
  const [m, r, s, a, x] = [n('moved'), n('rotated'), n('resized'), d.added.length, d.removed.length];
  return m + r + s + a + x ? `이동 ${m} · 회전 ${r} · 신규 ${a} · 제거 ${x} · 규격 ${s}` : '';
}
