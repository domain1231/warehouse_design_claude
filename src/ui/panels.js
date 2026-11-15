// 통계·경고 목록·랙 목록·범례 화면(기준본 20 renderStats/renderList/renderLegend, 40·80 범례, 65 목록 정렬).
// 계산은 warehouse/metrics·racklist. 이 파일은 그리기와 이벤트 연결만 한다.
import { esc } from '../cad/scene.js';
import { formatNumber as fmt } from '../core/format.js';
import { metrics } from '../warehouse/metrics.js';
import { rackRows, legend, LOAD_FILTERS, RACK_SORTS } from '../warehouse/racklist.js';
import { loadState } from '../cad/scene.js';

const RACK_TYPES = ['경량랙', '중량랙', '팔레트랙', '일반 선반', '사용자 지정 랙'];
const opts = (list) => list.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('');

/**
 * @param {{ stats: HTMLElement, warnings: HTMLElement, list: HTMLElement, legend: HTMLElement }} roots
 * @param {{ onFocus: (ids: string[]) => void, onView: (view: object) => void }} handlers
 */
export function createPanels(roots, { onFocus, onView }) {
  roots.list.innerHTML = `<div class="list-filters">
<input type="search" data-view="rackSearch" placeholder="랙·블록·로케이션·자재 검색" data-testid="rack-search" aria-label="랙 검색">
<select data-view="type" data-testid="rack-type" aria-label="랙 종류">${opts([['', '모든 종류'], ...RACK_TYPES.map((t) => [t, t])])}</select>
<select data-view="load" data-testid="rack-load-filter" aria-label="적재 상태">${opts(LOAD_FILTERS)}</select>
<select data-view="rackSort" data-testid="rack-sort" aria-label="정렬">${opts(RACK_SORTS)}</select>
</div><p class="muted list-count" data-testid="rack-count"></p><div class="rack-list" data-testid="rack-list" role="list"></div>`;
  const listBox = roots.list.querySelector('.rack-list');
  const count = roots.list.querySelector('.list-count');
  for (const el of roots.list.querySelectorAll('[data-view]')) {
    el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', () => onView({ [el.dataset.view]: el.value }));
  }
  let lastWarnings = [];
  roots.warnings.addEventListener('click', (e) => {
    const li = e.target.closest('[data-warning]');
    if (li) onFocus(lastWarnings[Number(li.dataset.warning)].ids);
  });
  const pick = (e) => {
    const row = e.target.closest('[data-rack]');
    if (row) onFocus([row.dataset.rack]);
  };
  listBox.addEventListener('click', pick);
  listBox.addEventListener('keydown', (e) => { if (e.key === 'Enter') pick(e); });

  return {
    /** @param {{ layout, project, selected: Set<string>, warnings: object[] }} s */
    render({ layout, project, selected, warnings }) {
      const m = metrics(layout, project, { warnings });
      lastWarnings = m.warnings;
      const units = Object.entries(m.units).map(([u, t]) => `${esc(u)} ${t.known ? fmt((t.validQuantity / t.validCapacity) * 100, 1) + '%' : '미확인'} <small>${t.known}/${t.total}랙 확인</small>`).join('<br>') || '랙 없음';
      // 기준본 renderStats: 상단 KPI 5칸(kArea·kRacks·kFootprint·kLoad·kWarnings)과 오른쪽 공간 지표(spaceMetrics).
      const k = roots.kpi;
      k.area.textContent = fmt(m.area);
      k.racks.textContent = String(m.racks);
      k.footprint.textContent = fmt(m.footprint, 1);
      k.load.innerHTML = units;
      k.warnings.textContent = String(m.warnings.length);
      roots.metrics.innerHTML = `${[['랙 면적 합계', fmt(m.rackArea) + '㎡'], ['보관 불가 / 문 안전 구역', fmt(m.unavailable) + '㎡'], ['통로 / 작업 구역', fmt(m.aisles) + '㎡'], ['중복 제외 잔여 면적', fmt(m.remaining) + '㎡']].map(([t, v]) => `<div class="metricline"><span>${t}</span><strong>${v}</strong></div>`).join('')}<p class="note">각 구역 지표는 서로 겹칠 수 있습니다. 잔여 면적만 전체 합집합을 차감합니다.</p>`;
      roots.warnings.innerHTML = m.warnings.length
        ? `<ol class="warning-list">${m.warnings.map((w, i) => `<li data-warning="${i}" tabindex="0">${esc(w.text)}</li>`).join('')}</ol>`
        : '<p class="info">설정된 기준에 따른 경고 없음</p>';

      const view = project.panels.view;
      for (const el of roots.list.querySelectorAll('[data-view]')) if (document.activeElement !== el) el.value = view[el.dataset.view] ?? '';
      const rows = rackRows(layout, view);
      const total = layout.objects.filter((o) => o.kind === 'rack').length;
      count.textContent = rows.length === total ? `랙 ${total}개` : `랙 ${total}개 중 ${rows.length}개 표시`;
      listBox.innerHTML = rows.length
        ? rows.map((r) => `<div class="rack-row" data-rack="${esc(r.id)}" role="listitem" tabindex="0" aria-selected="${selected.has(r.id)}"><span><i class="dot" style="background:${project.settings.colors[loadState(r.object, project.settings)]}"></i>${esc(r.code)} <small class="muted">${esc(r.block)}</small></span><span>${esc(r.ratioText)} · ${esc(r.unit)}</span></div>`).join('')
        : '<p class="muted">해당 랙 없음</p>';

      const lg = legend(project.settings);
      roots.legend.innerHTML = `<strong>${esc(lg.title)}</strong>${lg.items.map((i) => `<span><i class="dot" style="background:${i.color}"></i>${esc(i.text)}</span>`).join('')}${lg.note ? `<span>${esc(lg.note)}</span>` : ''}`;
    },
  };
}
