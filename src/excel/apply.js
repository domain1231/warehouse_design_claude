// Excel 배치안 적용 트랜잭션(기준본 70 R.capture·R.backup·R.transaction·EX.apply + 75·80·90 래퍼). DOM 없음.
// 대상 배치만 바꾸고 다른 편집안은 그대로 둔다. 적용 직전 대상 상태를 layoutBackups에 자동 백업한다.
// 어느 단계에서든 실패하면 입력 프로젝트를 그대로 돌려준다(전체 취소). 저장·실행취소 기록은 세션이 맡는다.
import { validateProject, assertIndependent } from '../core/project.js';
import { scanLayout } from '../warehouse/constraints.js';

export const EXCEL_APPLY_COMMAND = 'Excel 가져오기';
const clone = (v) => (v === undefined ? undefined : structuredClone(v));
const bytes = (text) => new TextEncoder().encode(String(text)).length;
const BACKUP_LIMIT = 6, BACKUP_BYTES = 3200000;

/** 대상 배치와 그에 딸린 기록의 복사본(기준본 R.capture, 75·80·90 확장 포함). */
export function captureTarget(p, k) {
  return {
    layout: clone(p.scenarios[k]),
    meta: clone(p.scenarioMeta[k]),
    excelSnapshots: clone(p.excelSnapshots.filter((s) => s.scenario === k)),
    layoutSnapshots: clone(p.layoutSnapshots.filter((s) => s.scenario === k)),
    inventoryHistory: clone(p.inventoryHistory.filter((s) => s.scenario === k)),
    objectColors: clone(p.theme.objectColors[k]),
    zoneNames: clone(p.rackLabels.zoneNames[k]),
    autoPlacement: { settings: clone(p.autoPlacement.settings[k]), reviewNotes: clone(p.autoPlacement.reviewNotes[k]) },
  };
}

/**
 * 대상 배치 자동 백업(기준본 R.backup). 직전 같은 사유의 백업과 내용이 같으면 새로 만들지 않는다.
 * 최대 6개·합계 3.2MB를 넘으면 오래된 것부터 지운다. 하나도 남길 수 없으면 오류.
 * @returns 백업 ID. p.layoutBackups를 바꾼다.
 */
export function backupTarget(p, target, reason, { nextId, now }) {
  assertIndependent(p);
  const capture = captureTarget(p, target);
  const latest = p.layoutBackups.filter((b) => b.target === target).at(-1);
  if (latest && latest.reason === reason) {
    const { id, target: _t, time, reason: _r, ...previous } = latest;
    if (JSON.stringify(previous) === JSON.stringify(capture)) return latest.id;
  }
  const b = { id: nextId(), target, time: now(), reason, ...capture };
  const rows = p.layoutBackups.concat(b);
  while (rows.length > BACKUP_LIMIT || bytes(JSON.stringify(rows)) > BACKUP_BYTES) {
    if (rows.length === 1) throw new Error('백업 용량 한도 초과: 배치 백업 6개(BEFORE·AFTER 합계) / 합계 3.2MB');
    rows.shift();
  }
  p.layoutBackups = rows;
  return b.id;
}

/**
 * 원자적 배치 변경(기준본 R.transaction). fn(draft, backupId)은 복사본만 고친다.
 * 다른 편집안이 바뀌거나 검증에 실패하면 { ok: false, project: 입력 그대로, reason }.
 */
export function runTransaction(project, target, label, fn, { nextId, now }) {
  const other = target === 'before' ? 'after' : 'before';
  const otherText = JSON.stringify(project.scenarios[other]);
  try {
    const p = structuredClone(project);
    const backupId = backupTarget(p, target, label, { nextId, now });
    p.settings.scenario = target;
    fn(p, backupId);
    if (JSON.stringify(p.scenarios[other]) !== otherText) throw new Error('다른 편집안 변경을 감지하여 취소했습니다.');
    p.version = '2.3.6';
    p.editing.selectedRackIds = [];
    p.editing.selectionScenario = target;
    p.layoutRevisions.push({ id: nextId(), target, type: label, time: now(), backupId, versionId: p.scenarioMeta[target].versionId });
    p.layoutRevisions = p.layoutRevisions.slice(-100);
    assertIndependent(p);
    validateProject(p);
    return { ok: true, project: p, backupId };
  } catch (e) {
    return { ok: false, project, reason: e.message };
  }
}

const LAYOUT_KEYS = ['originX', 'originY', 'columnDirection', 'firstRackPosition', 'columnGap', 'rackGap', 'northRotation', 'rotation', 'wallGap', 'aisleTarget', 'perColumnSettings'];

/**
 * 확인한 배치안을 대상 배치에 적용(기준본 70 EX.apply 본문 + 90 자동 배치 이력).
 * @param proposal buildProposal 결과 + warnings(공간 경고)
 * @param context { filename, sheet, analysis, candidate, acknowledged }
 */
export function applyExcelProposal(project, proposal, context, { nextId, now }) {
  const c = proposal.config;
  return runTransaction(project, c.target, EXCEL_APPLY_COMMAND, (P, backupId) => {
    P.scenarios[c.target] = clone(proposal.layout);
    const source = { file: context.filename, sheet: context.sheet, asOf: c.date, source: c.source, importedAt: now() };
    // D-061: Excel 총면적(Summary C4 '총 면적 m²')을 함께 보관한다. 면적 사용률·통로 비중 ①의 기준(없으면 도면 전체).
    if (Number.isFinite(context.analysis?.referenceArea) && context.analysis.referenceArea > 0) source.referenceArea = context.analysis.referenceArea;
    P.scenarioMeta[c.target].sourceInfo = source;
    const conf = {};
    for (const k of LAYOUT_KEYS) conf[k] = clone(c[k]);
    P.scenarioMeta[c.target].locationLayout = conf;
    P.locationLayout = clone(conf);
    P.metadata.sample = false;
    const a = context.analysis;
    P.importHistory.push({
      id: nextId(), date: c.date, importedAt: source.importedAt, file: context.filename, sheet: context.sheet, scenario: c.target, source: c.source, mode: c.mode,
      keys: proposal.generatedKeys, counts: { rows: a.rows.length, racks: proposal.layout.objects.filter((o) => o.kind === 'rack').length }, changes: clone(proposal.changes),
      issues: clone(a.issues), backupId, errorCount: a.issues.filter((i) => i.type === 'error').length, warningCount: proposal.warnings.length,
    });
    P.excelSnapshots = P.excelSnapshots.filter((s) => !(s.date === c.date && s.scenario === c.target));
    P.excelSnapshots.push({ id: nextId(), date: c.date, scenario: c.target, source: c.source, data: proposal.layout.objects.filter((o) => o.excel).map((o) => ({ id: o.id, excel: clone(o.excel) })) });
    if (c.recordLayout) {
      P.layoutSnapshots = P.layoutSnapshots.filter((s) => !(s.date === c.date && s.scenario === c.target));
      P.layoutSnapshots.push({ id: nextId(), date: c.date, scenario: c.target, name: context.filename + ' · ' + c.target, recordedAt: source.importedAt, layout: clone(proposal.layout) });
    }
    // 90: 승인한 후보의 자동 배치 설정·이력(최대 40개)
    P.autoPlacement.settings[c.target] = clone(c.autoPlacement);
    P.autoPlacement.history.push({ id: nextId(), scenario: c.target, time: now(), acknowledged: !!context.acknowledged, fingerprint: scanLayout(P.scenarios[c.target], P, { now }).fingerprint, candidate: context.candidate ?? '기존 배치 규칙', backupId, layout: clone(P.scenarios[c.target]) });
    if (P.autoPlacement.history.length > 40) P.autoPlacement.history.shift();
  }, { nextId, now });
}
