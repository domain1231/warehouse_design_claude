// 재고 기록·배치 이력 화면(기준본 65 하단 패널 bInventory·bLayout, 70 기록 범위). 정보 패널 안의 두 구역으로 둔다.
import { esc, buildScene } from '../cad/scene.js';
import { inventoryRows, snapshotRows, INVENTORY_SCOPES, PAGE_SIZE_INVENTORY, PAGE_SIZE_LAYOUT } from '../warehouse/records.js';

const opts = (list) => list.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');

/**
 * @param {{ inventory: HTMLElement, layouts: HTMLElement }} roots
 * @param {{ getProject, today: () => string, saveSnapshot: (date, name) => void, restoreSnapshot: (id) => void, toast }} deps
 */
export function createRecordsPanel(roots, { getProject, today, saveSnapshot, restoreSnapshot, toast }) {
  roots.inventory.innerHTML = `<div class="list-filters">
<input type="search" data-q placeholder="날짜·랙·출처 검색" data-testid="inv-query" aria-label="재고 기록 검색">
<input type="date" data-date data-testid="inv-date" aria-label="날짜">
<select data-scope data-testid="inv-scope" aria-label="기록 범위">${opts(INVENTORY_SCOPES)}</select></div>
<div class="records-table" data-rows data-testid="inv-rows"></div>
<div class="pager"><button type="button" data-prev>이전</button><span data-page class="muted" data-testid="inv-page"></span><button type="button" data-next>다음</button></div>
<p class="muted">재고 기록은 조회 전용입니다. 수량·최대 수량이 없으면 미확인으로 표시하며 0으로 계산하지 않습니다.</p>`;
  roots.layouts.innerHTML = `<div class="snapshot-form"><input type="date" data-sdate data-testid="snap-date" aria-label="기록 날짜"><input data-sname data-testid="snap-name" maxlength="200" placeholder="배치 이름" aria-label="배치 이름"><button type="button" data-save data-testid="snap-save">현재 배치 기록</button></div>
<select data-lscope data-testid="snap-scope" aria-label="이력 범위">${opts([['current', '현재 편집안'], ['all', '전체 편집안']])}</select>
<div class="records-table" data-lrows data-testid="snap-rows"></div>
<div class="pager"><button type="button" data-lprev>이전</button><span data-lpage class="muted"></span><button type="button" data-lnext>다음</button></div>`;
  const inv = (s) => roots.inventory.querySelector(s), lay = (s) => roots.layouts.querySelector(s);
  let invPage = 0, layPage = 0;
  lay('[data-sdate]').value = today();

  const compare = document.createElement('dialog');
  compare.className = 'compare-dialog';
  compare.dataset.testid = 'snap-compare';
  compare.innerHTML = '<div class="dialog-head"><h2 data-ctitle></h2><button type="button" data-cclose>닫기 ×</button></div><div class="compare-plans" data-cbody></div><p class="muted" data-cstats></p>';
  document.body.append(compare);
  compare.querySelector('[data-cclose]').addEventListener('click', () => compare.close());

  function renderInventory() {
    const p = getProject();
    const rows = inventoryRows(p, { query: inv('[data-q]').value, date: inv('[data-date]').value, scope: inv('[data-scope]').value });
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE_INVENTORY));
    invPage = Math.min(invPage, pages - 1);
    inv('[data-rows]').innerHTML = rows.length
      ? `<table><tr><th>배치</th><th>날짜</th><th>랙</th><th>수량 / 최대</th><th>적재율</th><th>출처</th></tr>${rows.slice(invPage * PAGE_SIZE_INVENTORY, (invPage + 1) * PAGE_SIZE_INVENTORY).map((r) => `<tr><td>${esc(r.scenario)}</td><td>${esc(r.date)}</td><td>${esc(r.rack)}</td><td>${esc(r.amount)}</td><td>${esc(r.ratio)}</td><td>${esc(r.source)}</td></tr>`).join('')}</table>`
      : '<p class="muted">기록 없음</p>';
    inv('[data-page]').textContent = `${rows.length}건 · ${invPage + 1}/${pages}쪽`;
    inv('[data-prev]').disabled = !invPage;
    inv('[data-next]').disabled = invPage >= pages - 1;
  }

  function renderLayouts() {
    const p = getProject();
    const rows = snapshotRows(p, lay('[data-lscope]').value);
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE_LAYOUT));
    layPage = Math.min(layPage, pages - 1);
    const locked = p.settings.scenario === 'before' && p.scenarioMeta.before.locked;
    lay('[data-save]').disabled = locked;
    if (!lay('[data-sname]').value) lay('[data-sname]').placeholder = p.metadata.name;
    lay('[data-lrows]').innerHTML = rows.length
      ? `<table><tr><th>날짜 · 기록 시각</th><th>이름 / 편집안</th><th>객체</th><th>작업</th></tr>${rows.slice(layPage * PAGE_SIZE_LAYOUT, (layPage + 1) * PAGE_SIZE_LAYOUT).map((s) => `<tr><td>${esc(s.date)}<br><span class="muted">${esc(s.recordedAt ? new Date(s.recordedAt).toLocaleString('ko-KR') : '시각 미기록')}</span></td><td>${esc(s.name || '이름 미기록')}<br>${esc(s.scenario)}</td><td>${s.layout.objects.length}</td><td><button type="button" data-restore="${esc(s.id)}" ${locked || s.scenario !== p.settings.scenario ? 'disabled' : ''}>복원</button> <button type="button" data-compare="${esc(s.id)}">비교</button></td></tr>`).join('')}</table>`
      : '<p class="muted">기록 없음</p>';
    lay('[data-lpage]').textContent = `${rows.length}건 · ${layPage + 1}/${pages}쪽`;
    lay('[data-lprev]').disabled = !layPage;
    lay('[data-lnext]').disabled = layPage >= pages - 1;
  }

  for (const sel of ['[data-q]', '[data-date]']) inv(sel).addEventListener('input', () => { invPage = 0; renderInventory(); });
  inv('[data-scope]').addEventListener('change', () => { invPage = 0; renderInventory(); });
  inv('[data-prev]').addEventListener('click', () => { invPage--; renderInventory(); });
  inv('[data-next]').addEventListener('click', () => { invPage++; renderInventory(); });
  lay('[data-lscope]').addEventListener('change', () => { layPage = 0; renderLayouts(); });
  lay('[data-lprev]').addEventListener('click', () => { layPage--; renderLayouts(); });
  lay('[data-lnext]').addEventListener('click', () => { layPage++; renderLayouts(); });
  lay('[data-save]').addEventListener('click', () => {
    const p = getProject();
    const date = lay('[data-sdate]').value, name = lay('[data-sname]').value.trim() || p.metadata.name;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !name) return toast('유효한 날짜와 배치 이름을 입력하세요.');
    if (p.layoutSnapshots.some((s) => s.date === date && s.scenario === p.settings.scenario) && !confirm('같은 날짜·편집안 배치이력을 현재 배치로 교체합니까?')) return;
    saveSnapshot(date, name);
  });
  lay('[data-lrows]').addEventListener('click', (e) => {
    const p = getProject();
    const r = e.target.closest('[data-restore]');
    if (r) {
      const s = p.layoutSnapshots.find((x) => x.id === r.dataset.restore);
      if (s && confirm(`${s.date} / ${s.name}의 객체 구성·좌표·설계 치수를 현재 ${p.settings.scenario} 편집안에 복원합니까? 같은 ID 랙의 현재 수량·자재 연결, 날짜별 이력과 다른 편집안은 유지됩니다. 현재에 없는 과거 랙은 수량·자재 연결 미확인으로 추가됩니다. 실행 취소할 수 있습니다.`)) restoreSnapshot(s.id);
      return;
    }
    const c = e.target.closest('[data-compare]');
    if (c) {
      const s = p.layoutSnapshots.find((x) => x.id === c.dataset.compare);
      if (!s) return;
      const a = p.scenarios[p.settings.scenario], b = s.layout;
      const panel = (l) => `<svg viewBox="-1.2 -1.2 ${l.warehouse.width + 2.4} ${l.warehouse.height + 2.4}" role="img">${buildScene(l, p, { tool: 'none' }).svg}</svg>`;
      compare.querySelector('[data-ctitle]').textContent = `${s.date} · ${s.name} / 현재 ${p.settings.scenario}`;
      compare.querySelector('[data-cbody]').innerHTML = `<div><h3>선택한 저장 배치</h3>${panel(b)}</div><div><h3>현재 편집 배치</h3>${panel(a)}</div>`;
      compare.querySelector('[data-cstats]').textContent = `저장 배치 ${b.objects.filter((o) => o.kind === 'rack').length}랙 / 현재 ${a.objects.filter((o) => o.kind === 'rack').length}랙 · 조회 비교이며 Before/After 설계안과 저장 이력을 변경하지 않습니다.`;
      compare.showModal();
    }
  });

  return {
    render() {
      renderInventory();
      renderLayouts();
    },
  };
}
