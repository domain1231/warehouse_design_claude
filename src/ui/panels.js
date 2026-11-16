// 통계·경고 목록·랙 목록·범례 화면(기준본 20 renderStats/renderList/renderLegend, 40·80 범례, 65 목록 정렬).
// 계산은 warehouse/metrics·racklist. 이 파일은 그리기와 이벤트 연결만 한다.
import { esc } from '../cad/scene.js';
import { formatNumber as fmt } from '../core/format.js';
import { metrics } from '../warehouse/metrics.js';
import { rackRows, legend } from '../warehouse/racklist.js';
import { loadState } from '../cad/scene.js';

const VIEW_FIELDS = { search: 'rackSearch', typeFilter: 'type', loadFilter: 'load', bRackSort: 'rackSort' };
const $ = (id) => document.getElementById(id);

/**
 * 하단 패널의 랙 목록·공간 검토(마크업은 ui/bottom-markup.js, 기준본 #search·#typeFilter·#loadFilter·#bRackSort·#rackList·#warnings·#warningCount).
 * @param {{ kpi: object, metrics: HTMLElement, legend: HTMLElement }} roots
 * @param {{ onFocus: (ids: string[]) => void, onView: (view: object) => void }} handlers
 */
export function createPanels(roots, { onFocus, onView }) {
  roots = { ...roots, warnings: $('warnings'), list: $('rackList') };
  const listBox = roots.list;
  const fields = Object.keys(VIEW_FIELDS).map($);
  for (const el of fields) el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', () => onView({ [VIEW_FIELDS[el.id]]: el.value }));
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
      $('warningCount').textContent = m.warnings.length + '건';
      roots.warnings.innerHTML = m.warnings.length
        ? m.warnings.map((w, i) => `<li data-warning="${i}" style="cursor:pointer;padding:4px 0">${esc(w.text)}</li>`).join('')
        : '<li style="color:#75d9b1">설정된 기준에 따른 경고 없음</li>';

      const view = project.panels.view;
      for (const el of fields) if (document.activeElement !== el) el.value = view[VIEW_FIELDS[el.id]] ?? (el.id === 'loadFilter' ? 'all' : el.id === 'bRackSort' ? 'original' : '');
      const rows = rackRows(layout, view);
      listBox.innerHTML = rows.length
        ? rows.map((r) => `<div class="rack-row" data-rack="${esc(r.id)}" role="button" tabindex="0" aria-selected="${selected.has(r.id)}"><span><i class="dot" style="background:${project.settings.colors[loadState(r.object, project.settings)]}"></i>${esc(r.code)} <small class="muted">${esc(r.block)}</small></span><span>${esc(r.ratioText)} · ${esc(r.unit)}</span></div>`).join('')
        : '<div class="empty">해당 랙 없음</div>';

      const lg = legend(project.settings);
      roots.legend.innerHTML = `<strong>${esc(lg.title)}</strong>${lg.items.map((i) => `<span><i class="dot" style="background:${i.color}"></i>${esc(i.text)}</span>`).join('')}${lg.note ? `<span>${esc(lg.note)}</span>` : ''}`;
    },
  };
}
