// 하단 패널 기록 조회·배치 이력(기준본 65 B.codeMap·B.snapshots·B.restoreSnapshot·bSaveLayout, 70 B.renderInventory). DOM 없음.
// 재고 기록은 읽기 전용 조회다. 배치 이력 저장·복원은 편집 명령(applyCommand)으로 적용한다.
import { formatNumber as fmt } from '../core/format.js';

const sameDims = (a, b) => ['width', 'depth', 'height'].every((k) => a[k] === b[k] || (Number.isFinite(a[k]) && Number.isFinite(b[k]) && Math.abs(a[k] - b[k]) < 1e-8));

/** 랙 ID → 표시 코드(BEFORE·AFTER 모두). */
export const rackCodeMap = (p) => new Map([...p.scenarios.before.objects, ...p.scenarios.after.objects].filter((o) => o.kind === 'rack').map((o) => [o.id, o.code]));

export const INVENTORY_SCOPES = Object.freeze([['current', '현재 편집안'], ['all', '전체 배치 기록'], ['legacy', '배치 미지정 이전 기록']]);
export const PAGE_SIZE_INVENTORY = 100;
export const PAGE_SIZE_LAYOUT = 50;

/**
 * 재고 기록 행(기준본 70 B.renderInventory). filter = { query, date, scope }.
 * 수량·최대 수량이 없으면 '미확인'(0으로 보지 않음). 날짜 내림차순.
 */
export function inventoryRows(p, { query = '', date = '', scope = 'current' } = {}) {
  const q = query.toLowerCase(), map = rackCodeMap(p);
  return p.inventoryHistory
    .filter((r) => (scope === 'all' || scope === 'legacy' ? scope === 'all' || r.scenario === 'legacy' : r.scenario === p.settings.scenario)
      && (!date || date === r.date)
      && (!q || [r.date, r.source, map.get(r.rackId) || r.rackId].join(' ').toLowerCase().includes(q)))
    .slice().sort((a, b) => b.date.localeCompare(a.date))
    .map((r) => ({
      scenario: r.scenario === 'legacy' ? '배치 미확인' : String(r.scenario).toUpperCase(),
      date: r.date,
      rack: map.get(r.rackId) || r.rackId,
      amount: `${r.quantity === null ? '미확인' : r.quantity} / ${r.capacity === null ? '미확인' : r.capacity} ${r.unit}`,
      ratio: r.quantity === null || !r.capacity ? '미확인' : `${fmt((r.quantity / r.capacity) * 100, 1)}%`,
      source: r.source,
    }));
}

/** 배치 이력(현재 편집안 또는 전체), 날짜·기록 시각 내림차순. */
export function snapshotRows(p, scope = 'current') {
  return p.layoutSnapshots.filter((s) => scope === 'all' || s.scenario === p.settings.scenario).slice()
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.recordedAt || '').localeCompare(String(a.recordedAt || '')));
}

export const SAVE_SNAPSHOT_COMMAND = '현재 배치만 기록';
export const RESTORE_SNAPSHOT_COMMAND = '저장된 배치 복원';

/** 현재 편집안 배치를 날짜·이름으로 기록(같은 날짜·편집안은 교체). */
export const saveSnapshot = ({ id, date, name, recordedAt }) => (draft) => {
  const k = draft.settings.scenario;
  draft.layoutSnapshots = draft.layoutSnapshots.filter((s) => !(s.date === date && s.scenario === k));
  draft.layoutSnapshots.push({ id, name, date, scenario: k, recordedAt, source: '사용자 직접 기록', layout: structuredClone(draft.scenarios[k]) });
};

/**
 * 저장된 배치를 현재 편집안에 복원. 같은 ID 랙의 현재 수량·단위·자재 연결·원본 규격은 유지하고,
 * 현재에 없는 과거 랙은 수량·자재 연결 미확인으로 추가한다. 실제 설비 확인은 치수가 같을 때만 유지.
 */
export const restoreSnapshot = (snapshotId) => (draft) => {
  const s = draft.layoutSnapshots.find((x) => x.id === snapshotId);
  if (!s) throw new Error('저장된 배치를 찾을 수 없습니다.');
  const k = draft.settings.scenario;
  const current = new Map(draft.scenarios[k].objects.map((o) => [o.id, o]));
  const layout = structuredClone(s.layout);
  for (const o of layout.objects) {
    if (o.kind !== 'rack') continue;
    const live = current.get(o.id);
    if (live) {
      for (const key of ['capacity', 'quantity', 'unit', 'excel', 'originalSpec']) {
        if (live[key] === undefined) delete o[key];
        else o[key] = structuredClone(live[key]);
      }
      o.physicalConfirmation = sameDims(live, o) ? structuredClone(live.physicalConfirmation || null) : null;
    } else {
      o.capacity = null;
      o.quantity = null;
      o.excel = null;
      o.physicalConfirmation = null;
      o.provenance = '배치 이력 복원 · 현재 자재 연결 미확인';
    }
  }
  draft.scenarios[k] = layout;
};

/**
 * 과거 날짜 조회 화면용 배치(기준본 00 display + 40 Excel 스냅숏 + 60 원본 규격 래퍼). 읽기 전용 표시에만 쓴다.
 * mode 'recorded': 그날 저장한 배치가 있으면 그 배치(layoutRecorded=true), 없으면 현재 배치. 'current': 현재 배치 + 과거 재고.
 * 그날 재고 기록이 없는 랙은 용량·수량 null(hasRecord=false). Excel 정보는 그날 Excel 스냅숏으로 바꾸고 없으면 null.
 * date가 비면 현재 대상 배치를 그대로 돌려준다.
 */
export function historyLayout(p, date, mode = 'recorded') {
  const k = p.settings.scenario;
  if (!date) return p.scenarios[k];
  const s = mode === 'recorded' ? p.layoutSnapshots.find((x) => x.date === date && x.scenario === k) : null;
  const base = s ? s.layout : p.scenarios[k];
  const records = new Map(p.inventoryHistory.filter((x) => x.date === date && x.scenario === k).map((x) => [x.rackId, x]));
  const snapshot = p.excelSnapshots.find((x) => x.date === date && x.scenario === k), excel = new Map((snapshot?.data || []).map((x) => [x.id, x.excel]));
  const same = (a, b) => ['width', 'depth', 'height'].every((n) => a[n] === b[n] || (Number.isFinite(a[n]) && Number.isFinite(b[n]) && Math.abs(a[n] - b[n]) < 1e-8));
  return {
    ...base,
    objects: base.objects.map((o) => {
      let v = o;
      if (o.kind === 'rack') {
        const r = records.get(o.id);
        v = { ...o, ...(r ? { capacity: r.capacity, quantity: r.quantity, unit: r.unit, source: r.source, hasRecord: true } : { capacity: null, quantity: null, hasRecord: false }) };
      }
      v = { ...v, excel: excel.get(o.id) || null };
      if (!v.excel?.originalRackSpecification) return v;
      const originalSpec = structuredClone(v.excel.originalRackSpecification);
      return { ...v, originalSpec, designSpec: { width: v.width, depth: v.depth, height: v.height ?? null }, specificationChanged: !same(originalSpec, v) };
    }),
    layoutRecorded: !!s,
  };
}

/** 이력 날짜 목록(기준본 dateSlider·historyStatus): 재고·Excel 스냅숏 전체 + 현재 대상의 배치 기록 날짜. */
export const historyDates = (p) => [...new Set([...p.inventoryHistory.map((s) => s.date), ...p.excelSnapshots.map((s) => s.date), ...p.layoutSnapshots.filter((s) => s.scenario === p.settings.scenario).map((s) => s.date)])].sort();

/** 기준본 historyStatus 문구. */
export function historyStatusText(p, date, layout) {
  if (!date) return '현재 편집 · 이력 ' + historyDates(p).length + '개 날짜';
  const n = layout.objects.filter((o) => o.hasRecord).length;
  return date + ' · 읽기 전용 · ' + (n ? n + '개 랙 기록' : '기록 없음') + ' · ' + (layout.layoutRecorded ? '해당 날짜 저장 배치' : '배치 이력 미적용: 현재 배치 + 과거 재고');
}
