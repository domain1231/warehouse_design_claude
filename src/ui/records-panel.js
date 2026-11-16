// 재고 기록·배치 이력 화면(기준본 65 하단 패널 bInventory·bLayout, 70 기록 범위). 정보 패널 안의 두 구역으로 둔다.
import { esc, buildScene } from '../cad/scene.js';
import { dateOK } from '../core/project.js';
import { inventorySnapshotExists } from '../warehouse/inventory-csv.js';
import { inventoryRows, snapshotRows, PAGE_SIZE_INVENTORY, PAGE_SIZE_LAYOUT } from '../warehouse/records.js';

const $ = (id) => document.getElementById(id);
const VIEW_FIELDS = { bInventoryQuery: 'inventoryQuery', bInventoryDate: 'inventoryDate', bLayoutScope: 'layoutScope' };

/**
 * 하단 패널의 재고기록·배치이력(마크업은 ui/bottom-markup.js, 기준본 65·70 B.renderInventory/renderLayouts/saveSnapshot/csvIn).
 * @param {{ getProject, today: () => string, isHistory: () => boolean, saveSnapshot: (date, name) => void, saveInventory: (o) => void, importCsv: (text, replace) => Promise<void>, restoreSnapshot: (id) => void, onView: (snapshot) => void, onViewState: (v) => void, openCompare: () => void, toast }} deps
 */
export function createRecordsPanel({ getProject, today, saveSnapshot, saveInventory, importCsv, restoreSnapshot, toast, isHistory = () => false, onView = () => {}, onViewState = () => {}, openCompare = () => {} }) {
  let invPage = 0, layPage = 0;
  $('bLayoutDate').value = $('snapshotDate').value = today();
  let nameSet = false; // 기준본: 배치 이름 칸은 처음 한 번만 프로젝트 이름으로 채운다.

  const compare = document.createElement('dialog');
  compare.id = 'bSnapshotCompare';
  compare.className = 'compare-dialog';
  compare.dataset.testid = 'snap-compare';
  compare.style.width = 'min(1400px,96vw)';
  compare.innerHTML = '<div class="dialog-head row" style="justify-content:space-between"><h2 id="bSnapshotCompareTitle" data-ctitle></h2><button type="button" id="bSnapshotCompareClose" data-cclose>닫기 ×</button></div><div id="bSnapshotCompareBody" class="compare-plans" data-cbody></div><p id="bSnapshotCompareStats" class="muted" data-cstats></p>';
  document.body.append(compare);
  $('bSnapshotCompareClose').addEventListener('click', () => compare.close());

  function renderInventory() {
    const p = getProject();
    const rows = inventoryRows(p, { query: $('bInventoryQuery').value, date: $('bInventoryDate').value, scope: $('rInventoryScope').value });
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE_INVENTORY));
    invPage = Math.min(invPage, pages - 1);
    $('bInventoryRows').innerHTML = rows.length
      ? `<table><tr><th>배치</th><th>날짜</th><th>랙</th><th>수량 / 최대</th><th>적재율</th><th>출처</th></tr>${rows.slice(invPage * PAGE_SIZE_INVENTORY, (invPage + 1) * PAGE_SIZE_INVENTORY).map((r) => `<tr><td>${esc(r.scenario)}</td><td>${esc(r.date)}</td><td>${esc(r.rack)}</td><td>${esc(r.amount)}</td><td>${esc(r.ratio)}</td><td>${esc(r.source)}</td></tr>`).join('')}</table>`
      : '<div class="b-empty">기록 없음</div>';
    $('bInventoryPage').textContent = `${rows.length}건 · ${invPage + 1}/${pages}쪽`;
    $('bInventoryPrev').disabled = !invPage;
    $('bInventoryNext').disabled = invPage >= pages - 1;
  }

  function renderLayouts() {
    const p = getProject();
    const rows = snapshotRows(p, $('bLayoutScope').value);
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE_LAYOUT));
    layPage = Math.min(layPage, pages - 1);
    const locked = p.settings.scenario === 'before' && p.scenarioMeta.before.locked;
    $('bSaveLayout').disabled = locked || isHistory();
    $('saveSnapshot').disabled = isHistory();
    $('bLayoutName').placeholder = p.metadata.name;
    $('bLayoutRows').innerHTML = rows.length
      ? `<table><thead><tr><th>날짜 · 기록 시각</th><th>이름 / 편집안</th><th>객체</th><th>작업</th></tr></thead><tbody>${rows.slice(layPage * PAGE_SIZE_LAYOUT, (layPage + 1) * PAGE_SIZE_LAYOUT).map((s) => `<tr><td>${esc(s.date)}<br><span class="b-hint">${esc(s.recordedAt ? new Date(s.recordedAt).toLocaleString('ko-KR') : '시각 미기록')}</span></td><td class="b-name">${esc(s.name || '이름 미기록')}<br>${esc(s.scenario)}</td><td>${s.layout.objects.length}</td><td><button type="button" data-layout-view="${esc(s.id)}">조회</button> <button type="button" data-layout-restore="${esc(s.id)}" ${locked || s.scenario !== p.settings.scenario ? 'disabled' : ''}>복원</button> <button type="button" data-layout-compare="${esc(s.id)}">비교</button></td></tr>`).join('')}</tbody></table>`
      : '<div class="b-empty">기록 없음</div>';
    $('bLayoutPage').textContent = `${rows.length}건 · ${layPage + 1}/${pages}쪽`;
    $('bLayoutPrev').disabled = !layPage;
    $('bLayoutNext').disabled = layPage >= pages - 1;
  }

  for (const id of ['bInventoryQuery', 'bInventoryDate']) $(id).addEventListener('input', () => { invPage = 0; onViewState({ [VIEW_FIELDS[id]]: $(id).value }); renderInventory(); });
  $('bInventoryClearDate').addEventListener('click', () => { $('bInventoryDate').value = ''; invPage = 0; onViewState({ inventoryDate: '' }); renderInventory(); });
  $('rInventoryScope').addEventListener('change', () => { invPage = 0; renderInventory(); });
  $('bInventoryPrev').addEventListener('click', () => { invPage--; renderInventory(); });
  $('bInventoryNext').addEventListener('click', () => { invPage++; renderInventory(); });
  $('bLayoutScope').addEventListener('change', () => { layPage = 0; onViewState({ layoutScope: $('bLayoutScope').value }); renderLayouts(); });
  $('bLayoutPrev').addEventListener('click', () => { layPage--; renderLayouts(); });
  $('bLayoutNext').addEventListener('click', () => { layPage++; renderLayouts(); });
  $('bLayoutCompare').addEventListener('click', () => openCompare());

  $('saveSnapshot').addEventListener('click', () => {
    const date = $('snapshotDate').value, source = $('snapshotSource').value.trim(), includeLayout = $('includeLayout').checked;
    if (!dateOK(date) || !source) return toast('유효한 날짜와 데이터 출처를 입력하세요.');
    if (inventorySnapshotExists(getProject(), date, includeLayout) && !confirm(`${date}의 해당 랙 기록/배치가 있습니다. 현재 값으로 교체할까요? 다른 날짜 기록은 유지됩니다.`)) return;
    saveInventory({ date, source, includeLayout });
  });
  $('csvIn').addEventListener('change', async () => {
    const input = $('csvIn'), f = input.files[0];
    if (!f) return;
    input.value = '';
    input.disabled = true;
    try {
      if (f.size > 12e6) throw new Error('12MB 이하 파일만 지원합니다.');
      if (isHistory()) throw new Error('현재 편집으로 돌아온 후 가져오세요.');
      await importCsv(await f.text(), $('replaceCsv').checked);
    } catch (e) {
      toast('파일 처리 실패: ' + e.message);
    } finally {
      input.disabled = false;
    }
  });
  $('bSaveLayout').addEventListener('click', () => {
    const p = getProject();
    if (isHistory()) return toast('현재 편집으로 돌아온 후 기록하세요.');
    const date = $('bLayoutDate').value, name = $('bLayoutName').value.trim();
    if (!dateOK(date) || !name) return toast('유효한 날짜와 배치 이름을 입력하세요.');
    if (p.layoutSnapshots.some((s) => s.date === date && s.scenario === p.settings.scenario) && !confirm('같은 날짜·편집안 배치이력을 현재 배치로 교체합니까?')) return;
    saveSnapshot(date, name);
  });
  $('bLayoutRows').addEventListener('click', (e) => {
    const p = getProject();
    const find = (a) => { const b = e.target.closest(`[data-layout-${a}]`); return b && p.layoutSnapshots.find((x) => x.id === b.dataset[`layout${a[0].toUpperCase()}${a.slice(1)}`]); };
    const r = find('restore');
    if (r) {
      if (isHistory()) return toast('과거 조회는 읽기 전용입니다.'); // 확인 창을 띄운 뒤 거부하지 않도록 먼저 확인
      if (confirm(`${r.date} / ${r.name}의 객체 구성·좌표·설계 치수를 현재 ${p.settings.scenario} 편집안에 복원합니까? 같은 ID 랙의 현재 수량·자재 연결, 날짜별 이력과 다른 편집안은 유지됩니다. 현재에 없는 과거 랙은 수량·자재 연결 미확인으로 추가됩니다. 실행 취소할 수 있습니다.`)) restoreSnapshot(r.id);
      return;
    }
    const v = find('view');
    if (v) return onView(v);
    const s = find('compare');
    if (s) {
      const a = p.scenarios[p.settings.scenario], b = s.layout;
      const panel = (l) => `<svg viewBox="-1.2 -1.2 ${l.warehouse.width + 2.4} ${l.warehouse.height + 2.4}" role="img">${buildScene(l, p, { tool: 'none' }).svg}</svg>`;
      $('bSnapshotCompareTitle').textContent = `${s.date} · ${s.name} / 현재 ${p.settings.scenario}`;
      $('bSnapshotCompareBody').innerHTML = `<div><h3>선택한 저장 배치</h3>${panel(b)}</div><div><h3>현재 편집 배치</h3>${panel(a)}</div>`;
      $('bSnapshotCompareStats').textContent = `저장 배치 ${b.objects.filter((o) => o.kind === 'rack').length}랙 / 현재 ${a.objects.filter((o) => o.kind === 'rack').length}랙 · 조회 비교이며 Before/After 설계안과 저장 이력을 변경하지 않습니다.`;
      compare.showModal();
    }
  });

  return {
    render() {
      const view = getProject().panels.view;
      if (!nameSet) { nameSet = true; $('bLayoutName').value = getProject().metadata.name; }
      for (const [id, k] of Object.entries(VIEW_FIELDS)) if (document.activeElement !== $(id)) $(id).value = view[k] ?? (id === 'bLayoutScope' ? 'current' : '');
      renderInventory();
      renderLayouts();
    },
  };
}
