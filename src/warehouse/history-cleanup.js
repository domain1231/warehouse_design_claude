// E4(D-091): 이력 정리 — 항목별 저장 크기와 '최근 N개만 보존' 정리. DOM 없음.
// 지우지 않는 것: BEFORE·AFTER 배치와 배치 정보, 각 배치의 최신 Excel 기준일(sourceInfo.asOf) 스냅샷, 재고 이력(실제 입력), 가져오기 기록.
// 배치 백업 안 스냅샷도 같은 규칙으로 줄인다(남기면 저장 시 참조가 끊겨 펼친 채 저장되어 오히려 커짐, D-089). 실행 취소·정리 전 백업은 호출하는 쪽이 맡는다.
import { packProjectRefs } from '../core/backup-refs.js';

export const CLEANUP_COMMAND = '이력 정리';
export const DEFAULT_KEEP = 10; // 사용자 확정(2026-11-25, 로드맵 8.4)
const SCENARIOS = ['before', 'after'];
const SNAP_KINDS = ['layoutSnapshots', 'excelSnapshots'];

const bytesOf = (v) => (v === undefined ? 0 : new TextEncoder().encode(JSON.stringify(v)).length);

/** 항목별 저장 크기(저장할 때와 같이 참조로 줄인 상태). */
export function historySizes(project) {
  const p = packProjectRefs(project);
  const bg = typeof p.settings?.background?.data === 'string' ? p.settings.background.data : '';
  const rows = [
    ['layoutSnapshots', '배치 스냅샷', p.layoutSnapshots],
    ['excelSnapshots', 'Excel 스냅샷', p.excelSnapshots],
    ['autoPlacementHistory', '자동 배치 이력', p.autoPlacement?.history],
    ['layoutBackups', '배치 백업', p.layoutBackups],
    ['commandHistory', '명령 이력', p.commandHistory],
    ['inventoryHistory', '재고 이력(정리 안 함)', p.inventoryHistory],
  ].map(([key, label, v]) => ({ key, label, count: Array.isArray(v) ? v.length : 0, bytes: bytesOf(v) }));
  rows.push({ key: 'background', label: '참고 도면 이미지(정리 안 함)', count: bg ? 1 : 0, bytes: new TextEncoder().encode(bg).length });
  return { rows, total: bytesOf(p) };
}

/** 배치별로 보존할 기준일 집합: 최근 keep개 기준일 ∪ 최신 Excel 기준일. */
function keptDates(list, scenario, keep, asOf) {
  const dates = [...new Set(list.filter((s) => s?.scenario === scenario && typeof s.date === 'string').map((s) => s.date))].sort().reverse();
  const set = new Set(dates.slice(0, keep));
  if (typeof asOf === 'string') set.add(asOf);
  return set;
}

/**
 * 정리 계획(입력은 바꾸지 않는다). keep: 배치별 최근 보존 개수(1 이상 정수), clearCommands: 명령 이력 비우기.
 * @returns { project, removed: { layoutSnapshots, excelSnapshots, autoPlacementHistory, backupSnapshots, commandHistory }, changed }
 */
export function planCleanup(project, { keep = DEFAULT_KEEP, clearCommands = false } = {}) {
  if (!Number.isInteger(keep) || keep < 1) throw new Error('보존 개수는 1 이상의 정수여야 합니다.');
  const p = structuredClone(project);
  const removed = { layoutSnapshots: 0, excelSnapshots: 0, autoPlacementHistory: 0, backupSnapshots: 0, commandHistory: 0 };
  const kept = {};
  for (const kind of SNAP_KINDS) {
    kept[kind] = {};
    for (const k of SCENARIOS) kept[kind][k] = keptDates(p[kind] ?? [], k, keep, p.scenarioMeta?.[k]?.sourceInfo?.asOf);
    const next = (p[kind] ?? []).filter((s) => !SCENARIOS.includes(s?.scenario) || kept[kind][s.scenario].has(s.date));
    removed[kind] = (p[kind] ?? []).length - next.length;
    p[kind] = next;
  }
  // 배치 백업 안 스냅샷: 그 백업 대상 배치의 보존 기준일만 남긴다.
  for (const b of p.layoutBackups ?? []) {
    for (const kind of SNAP_KINDS) {
      if (!Array.isArray(b?.[kind]) || !SCENARIOS.includes(b.target)) continue;
      const next = b[kind].filter((s) => kept[kind][b.target].has(s?.date));
      removed.backupSnapshots += b[kind].length - next.length;
      b[kind] = next;
    }
  }
  // 자동 배치 확인 이력: 배치별 최근 keep건(시각 순).
  const hist = p.autoPlacement?.history;
  if (Array.isArray(hist)) {
    const keepIds = new Set();
    for (const k of SCENARIOS) hist.filter((h) => h?.scenario === k).slice(-keep).forEach((h) => keepIds.add(h));
    const next = hist.filter((h) => !SCENARIOS.includes(h?.scenario) || keepIds.has(h));
    removed.autoPlacementHistory = hist.length - next.length;
    p.autoPlacement.history = next;
  }
  if (clearCommands && Array.isArray(p.commandHistory)) {
    removed.commandHistory = p.commandHistory.length;
    p.commandHistory = [];
  }
  const changed = Object.values(removed).some((n) => n > 0);
  return { project: changed ? p : project, removed, changed };
}
