// BEFORE/AFTER 시나리오 화면(기준본 70 openClone·drawCompare·renderHistory·R.restore). 계산은 warehouse/scenarios.js.
import { buildScene, esc } from '../cad/scene.js';
import { polygon } from '../geometry/polygons.js';
import { csvEncode } from '../warehouse/rackinfo.js';
import { purposeCompare, scenarioSpace, compareBasis, compareBasisText, compareSummary, metricRackIds } from '../metrics/space.js';
import { presentationLayout, renderPresentation, jpegToPdf } from './compare-export.js';
import { rackDeltaMap, rackChangeList, changeListCsvRows, CHANGE_TYPE_NAMES, DELTA_BINS, columnDeltaMap } from '../metrics/delta.js';
import { legend } from '../warehouse/racklist.js';
import { formatTime, timeHtml } from '../core/format.js';
import { rackDiff, diffRows, compareRows, layoutChangeSummary, setReferenceArea, DIFF_CSV_HEADER } from '../warehouse/scenarios.js';

const racksOf = (l) => l.objects.filter((o) => o.kind === 'rack');
const outline = (o, color, dash = '', w = 2) => `<polygon points="${polygon(o).map((q) => q.join(',')).join(' ')}" fill="none" stroke="${color}" stroke-dasharray="${dash}" vector-effect="non-scaling-stroke" style="stroke-width:${w}px"/>`;
/** 기준본 R.diffOverlay. */
export function diffOverlay(d, side) {
  let s = '';
  for (const o of side === 'before' ? d.removed : d.added) s += outline(o, side === 'before' ? '#ff7180' : '#69e2a2', side === 'before' ? '6 4' : '');
  for (const r of d.matched) {
    const o = r[side];
    if (r.types.includes('moved')) s += outline(o, '#70b8ff');
    if (r.types.includes('resized')) s += outline(o, '#ffb65b', '', 4);
    if (r.types.includes('rotated')) s += `<text x="${o.x}" y="${o.y}" fill="#d4a1ff" font-size=".23">R</text>`;
    if (side === 'after' && r.types.includes('moved')) {
      const b = r.before, a = r.after, x = b.x + b.width / 2, y = b.y + b.depth / 2, X = a.x + a.width / 2, Y = a.y + a.depth / 2, ang = Math.atan2(Y - y, X - x), l = 0.18;
      s += `<path d="M${x},${y} L${X},${Y} M${X - l * Math.cos(ang - 0.5)},${Y - l * Math.sin(ang - 0.5)} L${X},${Y} L${X - l * Math.cos(ang + 0.5)},${Y - l * Math.sin(ang + 0.5)}" fill="none" stroke="#70b8ff" stroke-width=".04"/>`;
    }
  }
  return s;
}
const common = (p) => { const b = p.scenarios.before.warehouse, a = p.scenarios.after.warehouse; return `-1.2 -1.2 ${Math.max(a.width, b.width) + 2.4} ${Math.max(a.height, b.height) + 2.4}`; };
const sourceText = (p, k) => { const s = p.scenarioMeta[k].sourceInfo; return s ? `${s.file} / ${s.sheet} · 데이터 기준일 ${s.asOf} · 가져오기 ${s.importedAt} · ${s.source}` : '출처·기준일 미등록' + (p.scenarios[k].referenceSample ? ' · 참고 샘플' : ''); };
const table = (rows, head = true) => '<table>' + rows.map((r, i) => '<tr>' + r.map((v) => `<${head && !i ? 'th' : 'td'}>${esc(v)}</${head && !i ? 'th' : 'td'}>`).join('') + '</tr>').join('') + '</table>';
/** 기준본 70 M.compareSvg: 같은 미터 좌표·배율의 BEFORE/AFTER 좌우 비교. */
export function compareSvg(p) {
  const d = rackDiff(p.scenarios.before, p.scenarios.after), vb = common(p), mode = legend(p.settings).title;
  const sc = (k) => buildScene(p.scenarios[k], p, { report: true }).svg;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="900" viewBox="0 0 1800 900"><rect width="1800" height="900" fill="#111821"/><g font-family="Malgun Gothic,Segoe UI,sans-serif" fill="#e5edf6"><text x="25" y="35" font-size="22">BEFORE / AFTER · 동일 미터 좌표·배율</text><text x="25" y="65" font-size="12">BEFORE ${esc(sourceText(p, 'before'))}</text><text x="25" y="85" font-size="12">AFTER ${esc(sourceText(p, 'after'))}</text><svg x="25" y="110" width="850" height="650" viewBox="${vb}">${sc('before')}${diffOverlay(d, 'before')}</svg><svg x="925" y="110" width="850" height="650" viewBox="${vb}">${sc('after')}${diffOverlay(d, 'after')}</svg><text x="25" y="800" font-size="16">녹색 신규 ${d.added.length} / 빨강 점선 제거 ${d.removed.length} / 파랑 화살표 이동 / R 회전 / 주황 설계 규격</text><text x="25" y="835" font-size="14">${racksOf(p.scenarios.before).length ? '내부 채움: ' + esc(mode) : 'BEFORE 기준 없음 · 개선 효과 비교 불가'} · 최대 보관 수량은 확인된 수량만 별도 집계</text><text x="25" y="865" font-size="13">기준일·출처 차이는 개선 효과를 증명하지 않습니다. 경로·하중·안전 적합성은 별도 검증</text></g></svg>`;
}
const dlg = (cls, testid, html, id) => {
  const d = document.createElement('dialog');
  if (id) d.id = id;
  d.className = cls;
  d.dataset.testid = testid;
  d.innerHTML = html;
  document.body.append(d);
  d.querySelector('[data-close]').addEventListener('click', () => d.close());
  return d;
};

/** @param {{ getProject: () => object, toast: (t: string) => void, apply: (label: string, compute: Function) => Promise<any>, download: Function, cloneBeforeToAfter: Function, restoreBackup: Function, cloneCommand: string, restoreCommand: string }} deps */
export function createScenarioDialogs({ getProject, toast, apply, download, pngBlob, jsonName, openHistoryPanel, cloneBeforeToAfter, restoreBackup, cloneCommand, restoreCommand, setCompareView = () => {} }) {
  const failed = (r) => r && !r.ok && toast('ROLLED_BACK · 전체 취소: ' + r.reason);

  // ── 복제 ──
  const cd = dlg('compare-dialog scenario-dialog r-dialog', 'clone-dialog', '<button type="button" id="rCloneClose" class="close" data-close data-testid="clone-close">취소 ×</button><h2>BEFORE → AFTER 복제 미리보기</h2><p id="rCloneSummary" class="r-notice" data-summary style="white-space:pre-line"></p><svg id="rClonePreview" data-preview role="img" aria-label="BEFORE 미리보기"></svg><label>기존 AFTER 처리<select id="rCloneChoice" data-choice data-testid="clone-choice"><option value="replace">기존 AFTER 자동 백업 후 교체</option><option value="version">독립 ID·생성일의 새 개선안 버전 생성 (기존 AFTER 백업)</option><option value="cancel">기존 AFTER 유지 · 취소</option></select></label><button type="button" id="rCloneApply" data-apply data-testid="clone-apply">확인 후 독립 복제</button>', 'rCloneDialog');
  const q = (d, s) => d.querySelector(s);
  q(cd, '[data-apply]').addEventListener('click', async () => {
    const choice = q(cd, '[data-choice]').value;
    if (choice === 'cancel') return cd.close();
    if (!confirm('기존 AFTER를 백업한 뒤 BEFORE의 독립 복사본으로 교체합니까? localStorage의 실제 남은 용량은 알 수 없으므로 먼저 JSON 백업을 권장합니다. 저장 성공을 보장하지 않습니다.')) return;
    const r = await apply(cloneCommand, (p, o) => cloneBeforeToAfter(p, { version: choice === 'version', ...o }));
    if (r?.ok) cd.close(); else failed(r);
  });
  const openClone = () => {
    const p = getProject(), l = p.scenarios.before;
    if (!racksOf(l).length) return toast('BEFORE 기준 도면이 없습니다. 먼저 BEFORE를 준비하세요.');
    q(cd, '[data-summary]').textContent = `BEFORE ${racksOf(l).length}랙 / AFTER ${racksOf(p.scenarios.after).length}랙\n랙·자재·구조·창고 치수를 깊은 복사합니다. BEFORE는 유지되고 기존 AFTER는 백업됩니다.`;
    q(cd, '[data-preview]').setAttribute('viewBox', `-1.2 -1.2 ${l.warehouse.width + 2.4} ${l.warehouse.height + 2.4}`);
    q(cd, '[data-preview]').innerHTML = buildScene(l, p, { scope: 'before', tool: 'none', mini: true }).svg;
    if (!cd.open) cd.showModal();
  };

  // ── 비교 ──
  const md = dlg('compare-dialog scenario-dialog', 'compare-dialog', '<button type="button" class="close" data-close data-testid="compare-close">닫기 ×</button><h2>Before / After 배치 비교</h2><div class="r-compare-tools"><select id="rCompareMode" data-mode data-testid="compare-mode" aria-label="배치 비교 모드"><option value="delta">Δ 용적률 지도</option><option value="sides">BEFORE/AFTER 좌우 차이</option><option value="before">BEFORE 단독</option><option value="after">AFTER 단독</option><option value="overlay">반투명 중첩 차이</option></select><button type="button" id="rCompareSave" data-save data-testid="compare-json">비교 중 JSON 저장</button><button type="button" id="rDiffCsv" data-csv data-testid="compare-csv">랙 변경 CSV</button><button type="button" data-change-csv data-testid="compare-change-csv">랙 변화 목록 CSV</button><button type="button" data-present-png data-testid="compare-present-png">발표용 PNG</button><button type="button" data-present-pdf data-testid="compare-present-pdf">발표용 PDF</button></div><div class="r-headline" data-headline data-testid="compare-headline" aria-live="polite"></div><div class="r-kpis" data-kpis data-testid="compare-kpis"></div><div class="r-cmp-grid"><div class="r-cmp-left"><div id="rCompareSources" data-sources></div><div id="rComparePurpose" data-purpose data-testid="compare-purpose"></div><p class="muted">현재 편집 중인 두 배치를 비교합니다. 날짜 조회 화면과 별개입니다. 수량은 동일 단위별로 계산합니다.</p><div id="compareTable" class="records-table" data-metrics data-testid="compare-metrics"></div><div id="rCompareRows" class="r-scroll records-table" data-testid="compare-rows" data-rows></div><button type="button" id="mCompareSvg" data-compare-svg data-testid="compare-svg">전후 비교 SVG</button> <button type="button" id="mComparePng" data-compare-png data-testid="compare-png">전후 비교 PNG</button> <button type="button" id="compareCsv" data-compare-csv data-testid="export-compare-csv" style="margin-top:14px">비교 요약 CSV</button></div><div class="r-cmp-right" data-testid="compare-right"><div class="r-delta-head" data-delta-head hidden><div class="r-delta-tools"><button type="button" data-max data-testid="compare-max" aria-label="Δ 지도 크게 보기" aria-pressed="false">⤢ 크게 보기</button><button type="button" data-full data-testid="compare-full" aria-label="Δ 지도 전체 화면(F)" hidden>⛶ 전체 화면</button><label><input type="checkbox" data-present data-testid="compare-present"> 발표 모드</label><select data-unit data-testid="compare-unit" aria-label="Δ 지도 단위"><option value="rack">랙 단위</option><option value="column">열 단위 요약</option></select></div><div class="r-legend" data-delta-legend data-testid="compare-delta-legend"></div><p class="r-focus-note" data-focus-note data-testid="compare-focus-note" hidden></p></div><svg id="rDeltaPlan" class="group-preview" data-delta data-testid="compare-delta" hidden role="img" aria-label="Δ 용적률 지도"></svg><svg id="rOverlayPlan" class="group-preview" data-overlay hidden role="img" aria-label="중첩"></svg><div class="compare-plans" data-plans><div data-box="before"><h3>BEFORE · 현재안</h3><svg id="beforePlan" class="mini-plan" data-before role="img" aria-label="BEFORE"></svg></div><div data-box="after"><h3>AFTER · 개선안</h3><svg id="afterPlan" class="mini-plan" data-after role="img" aria-label="AFTER"></svg></div></div></div></div>', 'compareDialog');
  const DROP = ['신규 랙', '제거 랙', '이동 랙', '회전 랙', '설계 규격 변경 랙', '데이터 기준일'];
  const detailRows = (p) => compareRows(p).filter((r, i) => !i || (!DROP.includes(r[0]) && !(String(r[0]).startsWith('최대 보관 수량') && r[1] === '미확인' && r[2] === '미확인')));
  const SEG = [['rack', 'seg-rack', '랙'], ['emptyRack', 'seg-rack seg-empty', '빈 랙'], ['unavailable', 'seg-blocked', '보관 불가'], ['aisle', 'seg-aisle', '통로'], ['remaining', 'seg-remain', '잔여']];
  // D5(D-082): 구간 비율이 4% 이상이면 막대 안에 숫자, 두 막대 사이에 구간별 Δ(%p), AFTER에서 바뀐 구간만 노란 외곽선(바뀌지 않은 Δ는 흐림).
  const ppText = (d) => (d > 0 ? '+' : d < 0 ? '−' : '±') + Math.abs(d).toFixed(1) + '%p';
  const compHtml = (p) => {
    const comp = (k) => (p.scenarios[k].objects.length ? scenarioSpace(p, k).composition : null);
    const cb = comp('before'), ca = comp('after');
    const dpp = (n) => (cb && ca ? Math.round((ca[n].share - cb[n].share) * 1000) / 10 : null);
    const bar = (k, c) => (!c ? `<div class="r-comp-row" data-bar="${k}"><span>${k.toUpperCase()}</span><div class="r-comp-bar">배치 없음</div></div>`
      : `<div class="r-comp-row" data-bar="${k}"><span>${k.toUpperCase()}</span><div class="r-comp-bar">${SEG.map(([n, cls, t]) => { const sh = c[n].share, ch = k === 'after' && dpp(n) !== null && dpp(n) !== 0; return `<i class="seg ${cls}${ch ? ' changed' : ''}" data-seg="${n}" style="width:${(sh * 100).toFixed(2)}%" title="${t} ${(sh * 100).toFixed(1)}% · ${c[n].area.toFixed(2)}㎡">${sh >= 0.04 ? `<b>${(sh * 100).toFixed(1)}%</b>` : ''}</i>`; }).join('')}</div></div>`);
    const delta = cb && ca ? `<div class="r-comp-delta" data-testid="compare-composition-delta"><span class="r-comp-dl">Δ</span>${SEG.map(([n, , t]) => { const d = dpp(n); return `<span data-seg="${n}" class="${d === 0 ? 'zero' : 'changed'}">${t} ${ppText(d)}</span>`; }).join('')}</div>` : '';
    return bar('before', cb) + delta + bar('after', ca);
  };
  // D1(D-078): 좋아지는 방향에 따라 개선 ▲(초록)·악화 ▼(빨강)·변화 없음 —(회색). 색만 쓰지 않고 화살표·문구를 함께 둔다.
  const TREND = { better: ['▲', '개선'], worse: ['▼', '악화'], same: ['—', '변화 없음'] };
  const trendHtml = (r) => { const t = TREND[r.trend]; return t ? `<span class="r-trend ${r.trend}" title="${t[1]}"><span class="r-arrow" aria-hidden="true">${t[0]}</span> ${esc(r.delta)}</span>` : esc(r.delta); };
  const kpiHtml = (r) => { const t = TREND[r.trend]; return `<div class="r-kpi" data-kpi="${r.id}" title="${esc(r.tip)}"><b>${esc(r.label)}</b><span class="r-kpi-v">${esc(r.before)} → ${esc(r.after)}</span><span class="r-trend ${r.trend}">${t ? `<span class="r-arrow" aria-hidden="true">${t[0]}</span> ` : ''}${esc(r.delta)}${t ? ` <small>${t[1]}</small>` : ''}</span></div>`; };
  const purposeHtml = (p, d, rows) => {
    const sum = layoutChangeSummary(d);
    // D4(D-081): BEFORE → AFTER를 한 칸에 붙여 쓰고 차이를 바로 옆에. 변화 0 행은 흐리게. 긴 원문은 툴팁.
    return '<table class="r-purpose"><tr>' + ['목적 지표', 'BEFORE → AFTER', '차이'].map((h) => `<th>${h}</th>`).join('') + '</tr>' + rows.map((r) => `<tr data-metric="${r.id}" data-trend="${r.trend}"${r.num === 0 ? ' class="r-zero"' : ''}${LINKABLE.has(r.id) ? ' tabindex="0" role="button" aria-pressed="false" data-link' : ''} title="${esc(`${r.label}: BEFORE ${r.before} → AFTER ${r.after}\n${r.tip}`)}"><td>${esc(r.label)}</td><td class="r-ba">${esc(r.short.before)} <span class="r-to">→</span> ${esc(r.short.after)}</td><td>${trendHtml(r)}</td></tr>`).join('') + '</table>'
      + `<div class="r-comp" data-testid="compare-composition">${compHtml(p)}<div class="r-legend">${SEG.map(([, cls, t]) => `<span><i class="seg ${cls}"></i>${t === '잔여' ? '보관 가능 잔여' : t}</span>`).join('')}</div></div>`
      + (sum ? `<p class="r-changes" data-testid="compare-changes">배치 변경: ${esc(sum)}</p>` : '');
  };
  const BIN = Object.fromEntries(DELTA_BINS.map((b) => [b.id, b]));
  // D7(D-084): 표·지도 연동 — 지표 행(랙으로 나타낼 수 있는 지표)·랙 변화 목록 행을 누르면 Δ 지도에서 그 랙만 강조. 다시 누르거나 Esc로 해제.
  const LINKABLE = new Set(['M3', 'M4', 'M8', 'M9', 'M12']);
  let focus = null; // { kind: 'metric'|'rack', key, label, ids }
  const applyFocus = () => {
    const svg = q(md, '[data-delta]'), ids = focus ? new Set(focus.ids) : null;
    svg.classList.toggle('focus', !!ids);
    for (const g of svg.querySelectorAll('g[data-rack]')) g.classList.toggle('on', !!ids && ids.has(g.dataset.rack));
    for (const tr of md.querySelectorAll('tr[data-link]')) { const on = !!focus && (focus.kind === 'metric' ? tr.dataset.metric === focus.key : tr.dataset.rackId === focus.key); tr.classList.toggle('r-active', on); tr.setAttribute('aria-pressed', String(on)); }
    const note = q(md, '[data-focus-note]');
    note.textContent = focus ? `지도 강조: ${focus.label} ${focus.ids.length}대 · 다시 누르거나 Esc로 해제` : '';
    note.hidden = !focus;
  };
  const toggleFocus = (tr) => {
    const p = getProject(), metric = tr.dataset.metric, rackId = tr.dataset.rackId;
    const key = metric ?? rackId, kind = metric ? 'metric' : 'rack';
    if (focus && focus.kind === kind && focus.key === key) focus = null;
    else focus = { kind, key, label: metric ? tr.cells[0].textContent : `랙 ${tr.cells[0].textContent}`, ids: metric ? metricRackIds(p, metric) : [rackId] };
    if (q(md, '[data-mode]').value !== 'delta') { q(md, '[data-mode]').value = 'delta'; drawCompare(); } else applyFocus();
  };
  const ALWAYS = ['up40', 'up20', 'up1', 'same', 'worse', 'emptied', 'unknown'];
  // D2(D-079): 발표 모드 — 바탕 도면의 글자(통로 이름·치수·구조물 이름·랙 태그)를 숨기고 Δ 값을 랙 칸에 맞춰 크게.
  const cview = (p) => ({ presentation: false, unit: 'rack', ...(p.settings.compareView ?? {}) });
  const textW = (t) => [...t].reduce((a, c) => a + (c.charCodeAt(0) < 128 ? 0.6 : 1), 0);
  const bbox = (pts) => { const xs = pts.map((x) => x[0]), ys = pts.map((x) => x[1]); return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }; };
  const fitFs = (b, label, cap) => Math.min((b.y1 - b.y0) * 0.7, ((b.x1 - b.x0) * 0.9) / Math.max(textW(label), 1), cap);
  const deltaText = (d) => (d > 0 ? '+' : d < 0 ? '−' : '±') + Math.abs(d).toFixed(1);
  // 발표 모드 랙 라벨은 정수 %p(1%p 미만만 소수 1자리)로 줄여 칸 안에서 크게 쓴다. 정확한 값은 툴팁.
  const presentText = (d) => (d > 0 ? '+' : d < 0 ? '−' : '±') + (Math.abs(d) < 1 ? Math.abs(d).toFixed(1) : String(Math.round(Math.abs(d))));
  const deltaParts = (p, d, sc, cv) => {
    const m = rackDeltaMap(p), after = new Map(racksOf(p.scenarios.after).map((o) => [o.id, o]));
    const pct = (v) => (v === null ? '미확인' : (v * 100).toFixed(1) + '%');
    const present = cv.presentation, cols = cv.unit === 'column' ? columnDeltaMap(p, m) : [];
    const colOf = new Map(cols.flatMap((c) => c.rackIds.map((id) => [id, c])));
    const base = present ? sc('after').replace(/<text\b[\s\S]*?<\/text>/g, '') : sc('after');
    let s = '<defs><pattern id="rDeltaHatch" width=".12" height=".12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0,0 L0,.12" stroke="#111821" stroke-width=".05"/></pattern></defs>' + `<g opacity="${present ? '.22' : '.3'}">${base}</g>`;
    for (const r0 of m.racks) {
      const col = colOf.get(r0.id), r = col ? { ...r0, bin: col.bin, delta: col.delta } : r0;
      const o = after.get(r.id), b = BIN[r.bin], pts = polygon(o), pp = pts.map((x) => x.join(',')).join(' ');
      const cx = pts.reduce((a, x) => a + x[0], 0) / pts.length, cy = pts.reduce((a, x) => a + x[1], 0) / pts.length;
      const label = col ? '' : r.bin === 'new' ? 'NEW' : r.bin === 'unknown' ? '?' : r.bin === 'emptied' ? (present ? '비움' : `${b.icon} 비움`) : r.bin === 'same' ? '' : present ? presentText(r.delta) : deltaText(r.delta);
      const fs = present ? fitFs(bbox(pts), label, 0.9) : Math.min(Math.min(o.width, o.depth) * 0.35, 0.3), op = r.bin === 'same' ? ' opacity=".35"' : '';
      const bx = bbox(pts), bw = bx.x1 - bx.x0, bh = bx.y1 - bx.y0;
      // D8(D-085): 크게 보기에서 칸이 충분히 크면 Δ 아래에 랙 코드를 함께 보인다(기본은 숨김, 다시 그리지 않고 클래스·위치만 바꿈).
      const code = col ? '' : String(r.code ?? ''), cfs = code ? Math.min(bh * 0.26, (bw * 0.9) / Math.max(textW(code), 1)) : 0;
      s += `<g data-bin="${r.bin}" data-rack="${esc(r.id)}" data-box="${cx.toFixed(3)},${cy.toFixed(3)},${bw.toFixed(3)},${bh.toFixed(3)}"><polygon points="${pp}" fill="${b.color}"${op} stroke="${b.dash ? '#c9d1da' : 'none'}"${b.dash ? ' stroke-dasharray=".08 .06" vector-effect="non-scaling-stroke" style="stroke-width:1px"' : ''}><title>${esc(`${r.code} · BEFORE ${pct(r.rB)} → AFTER ${pct(r.rA)} (${r.bin === 'emptied' ? '비움 · 이전 완료' : r.delta === null ? '—' : (r.delta > 0 ? '+' : r.delta < 0 ? '−' : '') + Math.abs(r.delta).toFixed(1) + '%p'})`)}</title></polygon>`
        + (b.pattern ? `<polygon points="${pp}" fill="url(#rDeltaHatch)" pointer-events="none"/>` : '')
        + (r.types.length ? `<polygon points="${pp}" fill="none" stroke="#ffd54f" stroke-dasharray=".1 .06" vector-effect="non-scaling-stroke" style="stroke-width:2px" data-changed pointer-events="none"/>` : '')
        + (label ? `<text class="r-dl" data-fs="${fs}" x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="${fs}" fill="${b.text}" stroke="${b.halo || b.color}" stroke-width="${(fs * 0.3).toFixed(3)}" paint-order="stroke" pointer-events="none">${label}</text>` : '')
        + (code ? `<text class="r-code" x="${cx}" y="${(cy + bh * 0.26).toFixed(3)}" text-anchor="middle" dominant-baseline="central" font-size="${cfs.toFixed(3)}" fill="${b.text}" stroke="${b.halo || b.color}" stroke-width="${(cfs * 0.25).toFixed(3)}" paint-order="stroke" pointer-events="none">${esc(code)}</text>` : '') + '</g>';
    }
    for (const c of cols) { // 열 단위 요약: 열마다 라벨 하나(열 이름 + 열 평균 Δ)
      const bs = c.rackIds.map((id) => bbox(polygon(after.get(id)))), b = { x0: Math.min(...bs.map((x) => x.x0)), y0: Math.min(...bs.map((x) => x.y0)), x1: Math.max(...bs.map((x) => x.x1)), y1: Math.max(...bs.map((x) => x.y1)) };
      const bin = BIN[c.bin], label = `${c.label} ${c.bin === 'emptied' ? '비움' : c.delta === null ? '?' : deltaText(c.delta)}`, fs = fitFs(b, label, present ? 0.9 : 0.45);
      s += `<text data-col="${esc(c.key)}" x="${(b.x0 + b.x1) / 2}" y="${(b.y0 + b.y1) / 2}" text-anchor="middle" dominant-baseline="central" font-size="${fs.toFixed(3)}" font-weight="700" fill="${bin.text}" stroke="${bin.halo || bin.color}" stroke-width="${(fs * 0.3).toFixed(3)}" paint-order="stroke" pointer-events="none"><title>${esc(`${c.key} 열 · BEFORE ${pct(c.rB)} → AFTER ${pct(c.rA)} · 랙 ${c.rackIds.length}대 평균`)}</title>${esc(label)}</text>`;
    }
    for (const o of d.removed) s += outline(o, '#ff7180', '.08 .06', 1).replace('<polygon', '<polygon data-removed');
    const legend = m.ready && !p.scenarios.after.objects.some((o) => o.kind === 'rack') ? 'AFTER 배치가 없어 Δ를 계산할 수 없습니다.' : m.ready ? DELTA_BINS.filter((b) => m.counts[b.id] || ALWAYS.includes(b.id)).map((b) => `<span data-bin="${b.id}"><i class="seg" style="background:${b.color}${b.dash ? ';outline:1px dashed #c9d1da' : ''}"></i>${b.id === 'unknown' ? '? Excel 미연결' : b.label} ${m.counts[b.id]}</span>`).join('') + (cols.length ? '<span>열 단위: 열 안 랙 용적률 R의 평균으로 색칠</span>' : '') + '<span>노랑 점선: 이동·회전·규격 변경 / 빨강 점선: 제거</span>' : '개선 전 기준 도면이 없어 Δ를 계산할 수 없습니다.';
    const legendItems = m.ready ? DELTA_BINS.filter((b) => m.counts[b.id] || ALWAYS.includes(b.id)).map((b) => ({ label: b.id === 'unknown' ? '? Excel 미연결' : b.label, color: b.color, count: m.counts[b.id] })) : [];
    return { inner: s, legend, legendItems, m };
  };
  const drawDelta = (p, d, vb, sc) => {
    const cv = cview(p), r = deltaParts(p, d, sc, cv), svg = q(md, '[data-delta]');
    svg.classList.toggle('present', cv.presentation);
    svg.setAttribute('viewBox', vb);
    svg.innerHTML = r.inner;
    q(md, '[data-delta-legend]').innerHTML = r.legend;
    applyFocus();
    if (zoom) applyZoom();
  };
  // D8(D-085): Δ 지도 크게 보기(대화상자 안 최대화) → 전체 화면. 임시 상태(저장 안 함). Esc는 전체 화면 → 최대화 → 강조 → 닫기 순.
  let zoom = false;
  const BIG_PX = 46; // 랙 칸의 짧은 변이 화면에서 이 픽셀 이상이면 랙 코드 표시
  const applyZoom = () => {
    const svg = q(md, '[data-delta]'), p = getProject();
    const W = Math.max(p.scenarios.before.warehouse.width, p.scenarios.after.warehouse.width), H = Math.max(p.scenarios.before.warehouse.height, p.scenarios.after.warehouse.height);
    svg.setAttribute('viewBox', `-0.1 -0.1 ${W + 0.2} ${H + 0.2}`); // 창고에 맞춤(여백 0.1m)
    fitHead();
    applyBig();
  };
  const fitHead = () => md.style.setProperty('--r-head', `${q(md, '[data-delta-head]').offsetHeight + 4}px`);
  const applyBig = () => {
    const svg = q(md, '[data-delta]'), k = zoom ? svg.getScreenCTM()?.a ?? 0 : 0;
    for (const g of svg.querySelectorAll('g[data-rack]')) {
      const [cx, cy, w, h] = g.dataset.box.split(',').map(Number), big = zoom && Math.min(w, h) * k >= BIG_PX && !!g.querySelector('.r-code');
      g.classList.toggle('big', big);
      const dl = g.querySelector('.r-dl');
      // 크게 보기에서는 Δ 라벨을 칸에 맞춰 키운다(칸 밖으로 나가지 않아 겹침 없음). 코드와 함께면 위쪽 절반만 쓴다.
      if (dl) { // 위 칸: 중심 −0.2h, 글자 ≤ 0.36h / 아래 칸(랙 코드): 중심 +0.26h, 글자 ≤ 0.26h → 두 줄 사이 여유
        const f0 = Number(dl.dataset.fs), cap = big ? 0.36 : 0.7, fit = Math.min(h * cap, (w * 0.9) / Math.max(textW(dl.textContent), 1), 0.9), f = zoom ? Math.max(Math.min(f0, h * cap), fit) : f0;
        dl.setAttribute('y', big ? cy - h * 0.2 : cy); dl.setAttribute('font-size', f); dl.setAttribute('stroke-width', (f * 0.3).toFixed(3));
      }
    }
  };
  const setZoom = (on) => {
    if (on && q(md, '[data-mode]').value !== 'delta') { q(md, '[data-mode]').value = 'delta'; zoom = true; md.classList.add('r-max'); drawCompare(); }
    zoom = on;
    md.classList.toggle('r-max', on);
    const b = q(md, '[data-max]');
    b.textContent = on ? '⤡ 작게 보기' : '⤢ 크게 보기';
    b.setAttribute('aria-label', on ? 'Δ 지도 크게 보기 끝내기(2단 화면으로)' : 'Δ 지도 크게 보기');
    b.setAttribute('aria-pressed', String(on));
    q(md, '[data-full]').hidden = !on;
    if (on) applyZoom(); else { q(md, '[data-delta]').setAttribute('viewBox', common(getProject())); applyBig(); }
  };
  // <dialog>는 직접 전체 화면이 될 수 없어 문서를 전체 화면으로 바꾸고, 최대화된 대화상자(최상위 레이어)가 화면을 채운다.
  const enterFull = () => { const el = document.documentElement; if (zoom && !document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch((e) => toast('전체 화면을 열 수 없습니다: ' + e.message)); };
  document.addEventListener('fullscreenchange', () => { if (md.open && zoom) requestAnimationFrame(() => { fitHead(); applyBig(); }); });
  window.addEventListener('resize', () => { if (md.open && zoom) { fitHead(); applyBig(); } });
  const chg = { filter: 'all', sort: 'delta-desc' };
  const signed = (v) => (v === null ? '—' : (v < 0 ? '−' : v > 0 ? '+' : '') + Math.abs(v).toFixed(1));
  const drawChangeTable = () => {
    const p = getProject(), all = rackChangeList(p), rows = rackChangeList(p, chg), pc = (v) => (v === null ? '미확인' : (v * 100).toFixed(1) + '%');
    q(md, '[data-change-count]').textContent = `${rows.length} / ${all.length}랙`;
    q(md, '[data-change-table]').innerHTML = '<table><tr>' + ['랙', '로케이션 수 (BE → AF)', 'BEFORE R', 'AFTER R', 'Δ %p', '배치 변경'].map((h) => `<th>${h}</th>`).join('') + '</tr>'
      + rows.map((r) => { const b = BIN[r.bin] ?? BIN.worse; return `<tr data-group="${r.group}" data-bin="${r.bin}"${r.bin !== 'removed' ? ` data-rack-id="${esc(r.id)}" data-link tabindex="0" role="button" aria-pressed="false"` : ''}><td>${esc(r.code)}</td><td>${r.locB ?? '—'} → ${r.locA ?? '—'}</td><td>${pc(r.rB)}</td><td>${pc(r.rA)}</td><td><i class="r-swatch" style="background:${r.bin === 'removed' ? 'transparent' : b.color};border-color:${b.color}"></i>${r.bin === 'emptied' ? '비움' : signed(r.delta)}</td><td>${r.types.length ? r.types.map((t) => CHANGE_TYPE_NAMES[t]).join('·') : '—'}</td></tr>`; }).join('') + '</table>';
  };
  const drawCompare = () => {
    const p = getProject(), d = rackDiff(p.scenarios.before, p.scenarios.after), vb = common(p), mode = q(md, '[data-mode]').value;
    const sc = (k) => buildScene(p.scenarios[k], p, { scope: k, tool: 'none', mini: true }).svg;
    for (const k of ['before', 'after']) {
      const s = q(md, `[data-${k}]`);
      s.setAttribute('viewBox', vb);
      s.innerHTML = sc(k) + diffOverlay(d, k);
      q(md, `[data-box=${k}]`).hidden = mode !== 'sides' && mode !== k;
    }
    q(md, '[data-plans]').hidden = mode === 'overlay';
    const o = q(md, '[data-overlay]');
    o.hidden = mode !== 'overlay';
    o.setAttribute('viewBox', vb);
    o.innerHTML = `<g opacity=".25">${sc('before')}</g>${sc('after')}${diffOverlay(d, 'before')}${diffOverlay(d, 'after')}`;
    if (mode === 'delta') { q(md, '[data-plans]').hidden = true; drawDelta(p, d, vb, sc); }
    q(md, '[data-delta]').toggleAttribute('hidden', mode !== 'delta');
    q(md, '[data-delta-head]').hidden = mode !== 'delta';
    const cv = cview(p);
    q(md, '[data-present]').checked = cv.presentation;
    q(md, '[data-unit]').value = cv.unit;
    // C9(D-075): 두 시나리오의 총면적 기준을 맞춘다. 한쪽에만 Excel 총면적이 있으면 다른 쪽에 적용하는 버튼.
    const cb = compareBasis(p), to = cb.from === 'before' ? 'after' : 'before', toLocked = to === 'before' && p.scenarioMeta.before.locked;
    // D6(D-083): 출처 두 줄 → 칩 3개(BEFORE 시트·기준일 / AFTER 시트·기준일 / 면적 기준) 한 줄. 파일명·가져온 시각은 칩 툴팁.
    const chip = (k) => { const si = p.scenarioMeta[k].sourceInfo, K = k.toUpperCase(); return `<span class="r-chip" data-chip="${k}" data-testid="compare-source-${k}" title="${esc(`${K} · ${sourceText(p, k)}`)}"><b>${K}</b> ${esc(si ? `${si.sheet} · ${si.asOf}` : '출처 미등록' + (p.scenarios[k].referenceSample ? ' · 참고 샘플' : ''))}</span>`; };
    const basisCls = cb.basis === 'excel' ? 'basis-excel' : cb.from ? 'basis-partial' : 'basis-drawing';
    q(md, '[data-sources]').innerHTML = `<div class="r-chips">${chip('before')}${chip('after')}<span class="r-chip r-basis ${basisCls}" data-testid="compare-basis" title="${esc(compareBasisText(cb) + (cb.basis === 'drawing' ? ' — 한쪽이라도 Excel 총면적이 없으면 양쪽 모두 도면 전체로 맞춥니다.' : ''))}">${esc(compareBasisText(cb))}</span>`
      + (cb.from ? `<button type="button" class="r-chip-btn" data-basis-apply data-testid="compare-basis-apply" title="${toLocked ? 'BEFORE 잠금을 해제한 후 적용하세요.' : `${cb.from.toUpperCase()} Excel 총면적 ${Math.round(cb.fromArea * 100) / 100}㎡를 ${to.toUpperCase()}에도 적용`}"${toLocked ? ' disabled' : ''}>${cb.from.toUpperCase()} 면적 ${Math.round(cb.fromArea * 100) / 100}㎡ 적용</button>` : '') + '</div>';
    const rows = purposeCompare(p), sm = compareSummary(p, rows);
    q(md, '[data-headline]').innerHTML = `<p data-testid="compare-conclusion">${esc(sm.headline)}</p>` + (sm.warning ? `<p class="warn" data-testid="compare-warning">⚠ ${esc(sm.warning)}</p>` : '');
    q(md, '[data-kpis]').innerHTML = sm.kpis.map(kpiHtml).join('');
    q(md, '[data-purpose]').innerHTML = purposeHtml(p, d, rows);
    q(md, '[data-metrics]').innerHTML = '<h3>세부 지표</h3>' + table(detailRows(p));
    const noBefore = !racksOf(p.scenarios.before).length;
    q(md, '[data-rows]').innerHTML = `<p class="info">${noBefore ? '개선 전 기준 도면이 없어 배치 개선 효과를 비교할 수 없습니다.' : p.scenarios.before.referenceSample ? 'BEFORE는 참고 샘플입니다. 실제 기준 도면으로 확정하지 마세요.' : '공통 원점·동일 배율 비교입니다. 위치·치수 근거와 창고/층의 동일성을 확인하세요.'}</p><p class="muted">녹색: 신규 / 빨강 점선: 제거 / 파랑·화살표: 이동 / R: 회전 / 주황: 설계 규격 · 내부 채움은 기존 재고 색상</p>` + `<div class="r-change-tools"><select data-change-filter data-testid="change-filter" aria-label="랙 변화 필터">${[['all', '전체'], ['better', '개선'], ['worse', '악화'], ['same', '변화 없음'], ['emptied', '비움'], ['other', '기타(미확인·신규·제거)']].map(([v, t]) => `<option value="${v}"${v === chg.filter ? ' selected' : ''}>${t}</option>`).join('')}</select><select data-change-sort data-testid="change-sort" aria-label="랙 변화 정렬">${[['delta-desc', 'Δ 큰 순'], ['delta-asc', '악화 큰 순'], ['code', '랙 코드 순']].map(([v, t]) => `<option value="${v}"${v === chg.sort ? ' selected' : ''}>${t}</option>`).join('')}</select><span data-change-count></span></div><div data-change-table></div>`;
    drawChangeTable(); applyFocus();
  };
  q(md, '[data-mode]').addEventListener('change', drawCompare);
  md.addEventListener('click', (e) => { const tr = e.target.closest('tr[data-link]'); if (tr && md.contains(tr)) toggleFocus(tr); });
  md.addEventListener('keydown', (e) => {
    const tr = e.target.closest?.('tr[data-link]');
    if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleFocus(tr); }
  });
  // Esc 한 단계씩: 전체 화면 → 최대화 → D7 강조 → 닫기
  md.addEventListener('cancel', (e) => {
    if (document.fullscreenElement) { e.preventDefault(); document.exitFullscreen().catch(() => {}); }
    else if (zoom) { e.preventDefault(); setZoom(false); }
    else if (focus) { e.preventDefault(); focus = null; applyFocus(); }
  });
  q(md, '[data-max]').addEventListener('click', () => setZoom(!zoom));
  q(md, '[data-full]').addEventListener('click', enterFull);
  // 더블클릭은 지도에서만(D7 행 클릭과 분리 — 지도 클릭은 강조를 바꾸지 않음)
  q(md, '[data-delta]').addEventListener('dblclick', (e) => { e.preventDefault(); setZoom(!zoom); });
  md.addEventListener('keydown', (e) => {
    if ((e.key === 'f' || e.key === 'F') && zoom && !e.ctrlKey && !e.metaKey && !e.altKey && !/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) { e.preventDefault(); enterFull(); }
  });
  q(md, '[data-delta-head]').addEventListener('change', (e) => {
    if (!e.target.closest('[data-present],[data-unit]')) return;
    setCompareView({ presentation: q(md, '[data-present]').checked, unit: q(md, '[data-unit]').value });
    drawCompare();
  });
  q(md, '[data-sources]').addEventListener('click', async (e) => {
    if (!e.target.closest('[data-basis-apply]')) return;
    const cb = compareBasis(getProject());
    if (!cb.from) return;
    const r = await apply('비교 총면적 기준 적용', (p) => setReferenceArea(p, cb.from === 'before' ? 'after' : 'before', cb.fromArea));
    if (r?.ok) drawCompare(); else failed(r);
  });
  q(md, '[data-rows]').addEventListener('change', (e) => {
    const f = e.target.closest('[data-change-filter]'), o = e.target.closest('[data-change-sort]');
    if (f) chg.filter = f.value; else if (o) chg.sort = o.value; else return;
    drawChangeTable(); applyFocus();
  });
  q(md, '[data-change-csv]').addEventListener('click', () => download('warehouse_rack_delta.csv', csvEncode(changeListCsvRows(rackChangeList(getProject(), chg))), 'text/csv;charset=utf-8'));
  q(md, '[data-save]').addEventListener('click', () => download(jsonName(), JSON.stringify(getProject(), null, 2), 'application/json'));
  q(md, '[data-csv]').addEventListener('click', () => { const p = getProject(); download('warehouse_rack_changes.csv', csvEncode([DIFF_CSV_HEADER, ...diffRows(rackDiff(p.scenarios.before, p.scenarios.after))]), 'text/csv;charset=utf-8'); });
  q(md, '[data-compare-csv]').addEventListener('click', () => download('warehouse_comparison.csv', csvEncode((() => { const p = getProject(), c = compareRows(p); return [c[0], ...purposeCompare(p).map((r) => [r.label, r.before, r.after, r.delta]), ...c.slice(1)]; })()), 'text/csv;charset=utf-8'));
  q(md, '[data-compare-svg]').addEventListener('click', () => download('warehouse_before_after.svg', compareSvg(getProject()), 'image/svg+xml;charset=utf-8'));
  q(md, '[data-compare-png]').addEventListener('click', async () => {
    try { download('warehouse_before_after.png', await pngBlob(compareSvg(getProject()))); } catch (e) { toast('비교 PNG 생성 실패: ' + e.message); }
  });
  // D3(D-080): 발표용 1장 내보내기(A4 가로 PNG/PDF). Δ 지도는 항상 발표 모드, 단위는 현재 설정.
  const SEG_COLOR = { rack: '#4a90d9', emptyRack: '#4a90d9', unavailable: '#c0504d', aisle: '#8a96a3', remaining: '#5fae5f' };
  const presentExport = async (kind) => {
    try {
      const p = getProject(), d = rackDiff(p.scenarios.before, p.scenarios.after), vb = common(p), cv = { ...cview(p), presentation: true };
      const parts = deltaParts(p, d, (k) => buildScene(p.scenarios[k], p, { report: true }).svg, cv);
      const [, , vw, vh] = vb.split(' ').map(Number), k = 1600 / Math.max(vw, vh);
      const mapSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${Math.round(vw * k)}" height="${Math.round(vh * k)}" font-family="Malgun Gothic,Segoe UI,sans-serif">${parts.inner}</svg>`;
      const rows = purposeCompare(p), sm = compareSummary(p, rows), cb = compareBasis(p);
      const bars = ['before', 'after'].map((key) => ({ name: key.toUpperCase(), segs: p.scenarios[key].objects.length ? SEG.map(([n, , t]) => ({ label: t === '잔여' ? '보관 가능 잔여' : t, share: scenarioSpace(p, key).composition[n].share, color: SEG_COLOR[n], hatch: n === 'emptyRack' })) : [] }));
      const plan = presentationLayout({ title: 'BEFORE / AFTER 개선 효과', headline: sm.headline, warning: sm.warning, kpis: sm.kpis, rows: rows.filter((r) => r.id !== 'M7').map((r) => ({ ...r, before: r.short.before, after: r.short.after })), bars, legendItems: parts.legendItems,
        footnotes: [`BEFORE · ${sourceText(p, 'before')}`, `AFTER · ${sourceText(p, 'after')}`, `${compareBasisText(cb)} · Δ 지도 ${cv.unit === 'column' ? '열 단위 요약' : '랙 단위'}(정수 %p) · 지표 산식은 앱 도움말 참고 · 경로·하중·안전 적합성은 별도 검증`] });
      const canvas = await renderPresentation(plan, mapSvg);
      const blob = (type, qy) => new Promise((ok, bad) => canvas.toBlob((b) => (b ? ok(b) : bad(new Error('이미지 생성 실패'))), type, qy));
      if (kind === 'png') download('warehouse_compare_presentation.png', await blob('image/png'));
      else download('warehouse_compare_presentation.pdf', new Blob([jpegToPdf(new Uint8Array(await (await blob('image/jpeg', 0.92)).arrayBuffer()), canvas.width, canvas.height)], { type: 'application/pdf' }));
    } catch (e) { toast('발표용 내보내기 실패: ' + e.message); }
  };
  q(md, '[data-present-png]').addEventListener('click', () => presentExport('png'));
  q(md, '[data-present-pdf]').addEventListener('click', () => presentExport('pdf'));
  md.addEventListener('close', () => { if (zoom) setZoom(false); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); });
  const openCompare = () => { chg.filter = 'all'; chg.sort = 'delta-desc'; focus = null; if (zoom) setZoom(false); q(md, '[data-mode]').value = 'delta'; drawCompare(); if (!md.open) md.showModal(); };

  // ── 가져오기 이력·백업(기준본 70 #rImportHistory: 배치이력 구역 안의 details) ──
  const hd = document.createElement('details');
  hd.id = 'rImportHistory';
  hd.className = 'r-history-tabs';
  hd.dataset.testid = 'history-dialog';
  hd.innerHTML = '<summary>Excel 가져오기·자동 백업 이력</summary><p class="r-restore-note">대상별 백업은 최신 최대 6개 / JSON 합계 3.2MB로 순환 보관합니다. 정상 저장·검증 성공 시에만 오래된 백업부터 교체하며, 만료된 백업의 복원 연결은 사용할 수 없습니다. 단일 백업도 한도를 넘거나 저장·검증에 실패하면 적용을 취소하고 기존 백업과 저장 바이트를 보존합니다. 날짜별 적용 스냅샷·재고 이력에는 이 순환 한도를 적용하지 않습니다. JSON 백업으로 복구 자료를 보관하세요. 복원도 현재 대상 상태를 먼저 백업합니다.</p><div id="rHistoryRows" class="r-scroll" data-hrows data-testid="history-rows"></div><h4>보관 중인 대상별 백업</h4><div id="rBackupRows" class="r-scroll" data-brows data-testid="backup-rows"></div>';
  document.querySelector('#bContent-layout .b-body').append(hd);
  const drawHistory = () => {
    if (!hd.open) return;
    const p = getProject();
    q(hd, '[data-hrows]').innerHTML = '<table><tr><th>가져오기 시각 / 기준일</th><th>파일 / 시트</th><th>대상 / 방식</th><th>추가·수정·삭제 / 오류·경고</th><th>이전 상태</th></tr>' + p.importHistory.slice(-50).reverse().map((h) => `<tr><td>${timeHtml(h.importedAt, '시각 미기록', esc)}<br>${esc(h.date)}</td><td>${esc(h.file)} / ${esc(h.sheet)}</td><td>${esc(h.scenario)} / ${esc(h.mode)}</td><td>${h.changes?.added ?? '—'} / ${h.changes?.updated ?? '—'} / ${h.changes?.deleted ?? '미기록'} · ${h.errorCount ?? '미기록'} / ${h.warningCount ?? '미기록'}</td><td><button type="button" data-restore="${esc(h.backupId || '')}" ${p.layoutBackups.some((b) => b.id === h.backupId) ? '' : 'disabled'}>이전 상태 복원</button></td></tr>`).join('') + '</table>';
    q(hd, '[data-brows]').innerHTML = '<table>' + p.layoutBackups.slice().reverse().map((b) => `<tr><td>${timeHtml(b.time, '시각 미기록', esc)}</td><td>${b.target.toUpperCase()}</td><td>${esc(b.reason)} / ${esc(b.meta.versionId)}</td><td><button type="button" data-restore="${esc(b.id)}">이 상태로 복원</button></td></tr>`).join('') + '</table>';
  };
  hd.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-restore]');
    if (!b) return;
    const p = getProject(), backup = p.layoutBackups.find((x) => x.id === b.dataset.restore);
    if (!backup) return toast('백업이 만료되었거나 없습니다.');
    if (backup.target === 'before' && p.scenarioMeta.before.locked && !confirm('잠긴 BEFORE를 백업으로 복원합니까? AFTER는 유지됩니다.')) return;
    if (!confirm(`${backup.target.toUpperCase()}의 ${formatTime(backup.time, '시각 미기록')} 이전 상태를 복원합니까? 현재 대상 상태도 다시 백업합니다.`)) return;
    const r = await apply(restoreCommand, (pr, o) => restoreBackup(pr, backup.id, o));
    if (r?.ok) drawHistory(); else failed(r);
  });
  hd.addEventListener('toggle', drawHistory);
  const openHistory = () => { openHistoryPanel(); hd.open = true; drawHistory(); hd.scrollIntoView({ block: 'center' }); };

  return { openClone, openCompare, openHistory, renderHistory: drawHistory };
}
