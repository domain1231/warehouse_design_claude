// 통계·경고 목록·랙 목록·범례 화면(기준본 20 renderStats/renderList/renderLegend, 40·80 범례, 65 목록 정렬).
// 계산은 warehouse/metrics·racklist. 이 파일은 그리기와 이벤트 연결만 한다.
import { esc } from '../cad/scene.js';
import { formatNumber as fmt } from '../core/format.js';
import { metrics } from '../warehouse/metrics.js';
import { scenarioSpace, scenarioDelta, shelfWeightedVolume } from '../metrics/space.js';
import { aisleSettingIssues } from '../warehouse/aisles.js';
import { rackRows, legend } from '../warehouse/racklist.js';
import { loadState } from '../cad/scene.js';

const VIEW_FIELDS = { search: 'rackSearch', typeFilter: 'type', loadFilter: 'load', bRackSort: 'rackSort' };
const $ = (id) => document.getElementById(id);
// 선택만 바뀐 렌더(프로젝트 도면 불변)에서 공간 지표를 다시 계산하지 않도록 직전 결과를 기억한다.
// 도면 확정은 항상 새 layout 객체(structuredClone 편집·undo·가져오기)이므로 객체 동일성 + 입력 참조가 같을 때만 재사용한다.
export const spaceMemoStats = { computed: 0 };
if (typeof window !== 'undefined') window.__spaceMemoStats = spaceMemoStats; // E2E 검사용 읽기 진입점
const slots = {};
const memo = (name, deps, fn) => {
  const s = slots[name];
  if (s && s.deps.length === deps.length && s.deps.every((d, i) => d === deps[i])) return s.value;
  spaceMemoStats.computed++;
  const value = fn();
  slots[name] = { deps, value };
  return value;
};

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
      m.warnings = [...m.warnings, ...memo('issues', [layout, project.aisleRules], () => aisleSettingIssues(layout, project.aisleRules))]; // C5: 설정 경고(비공간·비차단)
      lastWarnings = m.warnings;
        // 기준본 renderStats: 상단 KPI(kArea·kRacks·kFootprint·kWarnings)와 오른쪽 공간 지표(spaceMetrics).
      // D-058: '수량 기준 적재율 · 단위별'(kLoad) 대신 통로 비중·보관 불가 구역 비중(겹침 제외·창고 안쪽 면적 ÷ 전체 면적).
      const k = roots.kpi;
      k.area.textContent = fmt(m.area);
      k.racks.textContent = String(m.racks);
      // D-061(Track C C1 2단계): 공간 지표는 src/metrics/space.js 하나에서 계산한다. 면적 사용률·통로 비중은 ① Excel 방식(총면적 = Excel 입력값, 없으면 도면 전체).
      const key = project.settings.scenario, sc = project.scenarios, meta = project.scenarioMeta, rules = project.aisleRules;
      const x = memo('space', [layout, meta?.[key]?.sourceInfo?.referenceArea, rules], () => scenarioSpace(project, key, layout));
      const pct = (v, d = 1) => (v === null || v === undefined ? '—' : (v * 100).toFixed(d));
      const signed = (v, d = 1) => (v === null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v * 100).toFixed(d));
      const basisText = x.areaBasis === 'excel' ? `÷ ${fmt(x.totalArea)}㎡(Excel 총면적)` : `÷ ${fmt(x.totalArea)}㎡(도면 전체 · Excel 총면적 없음)`;
      k.areaSub.textContent = x.areaBasis === 'excel' ? `Excel 총면적 ${fmt(x.totalArea)}㎡` : '';
      k.footprint.textContent = pct(x.areaUse);
      k.footprintSub.textContent = basisText;
      k.footprint.closest('.stat').title = `면적 사용률 = 랙 바닥면적 합 ${fmt(x.usedArea)}㎡ ${basisText}. Excel 연결 랙만: ${pct(x.areaUseLinked)}% · 도면 전체 기준: ${pct(x.usedArea / x.drawingArea)}%`;
      k.aisleShare.textContent = pct(x.aisleShare.excel);
      k.aisleArea.textContent = `1 − 면적 사용률 · 도면 통로 ${pct(x.aisleShare.drawing)}%`;
      k.aisleShare.closest('.stat').title = `통로 비중 ① Excel 방식 = 1 − 면적 사용률. ② 도면 방식(등록 통로·작업 구역 ÷ 도면 면적) = ${pct(x.aisleShare.drawing)}% (${fmt(m.aisles)}㎡)`;
      const comp = x.composition;
      k.blockedShare.textContent = pct(comp.unavailable.share);
      k.blockedArea.textContent = fmt(comp.unavailable.area) + '㎡ · 도면 기준';
      k.remainShare.textContent = pct(comp.remaining.share);
      k.remainArea.textContent = fmt(comp.remaining.area) + '㎡ · 도면 기준';
      const minA = x.minAisle, below = minA && minA.width < minA.target - 1e-9;
      const aisleText = minA ? fmt(minA.width, 3) : '—';
      const aisleWarn = x.aisleBelowStandard > 0 || x.aisleSettingIssues > 0;
      const aisleSub = x.aisleBelowStandard > 0 ? `⚠ 기준 미달 ${x.aisleBelowStandard}개 · ${minA.code} 기준 ${fmt(minA.standard, 3)}m(${minA.standardLabel})`
        : x.aisleSettingIssues > 0 ? `⚠ 주통로 기준 설정 확인 ${x.aisleSettingIssues}개`
        : minA ? `${minA.code} · ${below ? '⚠ 목표 ' + fmt(minA.target, 3) + 'm 미달' : '목표 ' + fmt(minA.target, 3) + 'm'}` : '통로 객체 없음';
      k.minAisle.textContent = aisleText;
      k.minAisleSub.textContent = aisleSub;
      const aisleStat = k.minAisle.closest('.stat');
      aisleStat.classList.toggle('warn', aisleWarn);
      aisleStat.title = '통로 단면 최소 폭. 기준 = max(통로 최소 확보 폭, 통로 종류 기준(왼쪽 통로 종류 기준에서 변경)). 참고 권장: 주통로 1.2m · 접근 통로 1.0m. 주통로 기준이 1.0m 미만이면 설정 경고';
      const dl = memo('delta', [sc.before, sc.after, key, x, meta?.before?.sourceInfo?.referenceArea, meta?.after?.sourceInfo?.referenceArea, rules], () => scenarioDelta(project, { key, m: x }));
      const deltaText = !dl ? '—' : dl.empty ? `${dl.empty} 배치 비어 있음` : `랙 ${dl.racks > 0 ? '+' : dl.racks < 0 ? '−' : '±'}${Math.abs(dl.racks)} · 평균 용적률 ${signed(dl.avgVolume)}%p · 면적 사용률 ${signed(dl.areaUse)}%p`;
      const policy = project.settings.heightPolicy ?? 'weightedMax';
      const shelf = memo('shelf', [layout, policy], () => shelfWeightedVolume(layout, policy));
      const mutedS = (t) => `<small class="muted">${esc(t)}</small>`;
      const extra = [
        ['평균 용적률', x.avgVolume === null ? `미확인 ${mutedS(`0/${x.racks}랙`)}` : `${pct(x.avgVolume)}% ${mutedS(`${x.volumeRacks}/${x.racks}랙 · 선반 가중 ${shelf === null ? '—' : pct(shelf) + '%'}`)}`],
        ['80% 미만 로케이션', x.locations ? `${x.lowLocations} ${mutedS(`/ ${x.locations}`)}` : '—'],
        ['빈 랙 · 저활용 랙', `${x.emptyRacks} · ${x.lowRacks} ${mutedS(`R<${Math.round(x.lowRackThreshold * 100)}% · 미확인 ${x.unknownRacks}`)}`],
        ['유휴 공간 랙', x.idleRacks === null ? `— ${mutedS('천장 높이 미입력')}` : `${x.idleRacks} ${mutedS('천장−랙−500mm > 500mm')}`],
        ['공간 구성', `랙 ${pct(comp.rack.share)} · 불가 ${pct(comp.unavailable.share)} · 통로 ${pct(comp.aisle.share)} · 잔여 ${pct(comp.remaining.share)}`],
        ['통로 : 랙 면적비', m.rackArea > 0 ? (m.aisles / m.rackArea).toFixed(2) : '—'],
        ['최소 통로 폭', minA ? `${aisleText}m ${mutedS(aisleSub)}` : '통로 객체 없음'],
        ['BEFORE→AFTER 증감', deltaText],
      ];
      k.warnings.textContent = String(m.warnings.length);
      if (k.summary) k.summary.textContent = `${m.racks}랙 · 면적 사용률 ${pct(x.areaUse)}% · 평균 용적률 ${pct(x.avgVolume)}% · 공간 경고 ${m.warnings.length}건`;
      roots.metrics.innerHTML = `${[['랙 면적 합계', fmt(m.rackArea) + '㎡'], ['보관 불가 / 문 안전 구역', fmt(m.unavailable) + '㎡'], ['통로 / 작업 구역', fmt(m.aisles) + '㎡'], ['중복 제외 잔여 면적', fmt(m.remaining) + '㎡'], ...extra].map(([t, v]) => `<div class="metricline"><span>${t}</span><strong>${v}</strong></div>`).join('')}<p class="note">각 구역 지표는 서로 겹칠 수 있습니다. 잔여 면적만 전체 합집합을 차감합니다. 평균 용적률은 Excel 방식(로케이션 자재높이 ÷ 단 높이 → 랙 평균 → 랙 평균의 평균)이며 현재고가 아닙니다. 평균 용적률은 빈 랙, 80% 미만은 빈 로케이션(품목코드 없음)을 뺍니다. 공간 구성은 랙 > 보관 불가 > 통로 > 잔여 순서로 겹침을 지운 도면 기준입니다.</p>`;
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
