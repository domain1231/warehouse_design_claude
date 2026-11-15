// BEFORE/AFTER 시나리오 화면(기준본 70 openClone·drawCompare·renderHistory·R.restore). 계산은 warehouse/scenarios.js.
import { buildScene, esc } from '../cad/scene.js';
import { polygon } from '../geometry/polygons.js';
import { csvEncode } from '../warehouse/rackinfo.js';
import { legend } from '../warehouse/racklist.js';
import { rackDiff, diffRows, compareRows, DIFF_CSV_HEADER } from '../warehouse/scenarios.js';

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
export function createScenarioDialogs({ getProject, toast, apply, download, pngBlob, jsonName, openHistoryPanel, cloneBeforeToAfter, restoreBackup, cloneCommand, restoreCommand }) {
  const failed = (r) => r && !r.ok && toast('ROLLED_BACK · 전체 취소: ' + r.reason);

  // ── 복제 ──
  const cd = dlg('compare-dialog scenario-dialog', 'clone-dialog', '<div class="dialog-head"><h2>BEFORE → AFTER 복제 미리보기</h2><button type="button" data-close data-testid="clone-close">취소 ×</button></div><p class="info" data-summary style="white-space:pre-line"></p><svg class="group-preview" data-preview role="img" aria-label="BEFORE 미리보기"></svg><label class="field">기존 AFTER 처리<select data-choice data-testid="clone-choice"><option value="replace">기존 AFTER 자동 백업 후 교체</option><option value="version">독립 ID·생성일의 새 개선안 버전 생성 (기존 AFTER 백업)</option><option value="cancel">기존 AFTER 유지 · 취소</option></select></label><div class="dialog-foot"><button type="button" class="primary" data-apply data-testid="clone-apply">확인 후 독립 복제</button></div>');
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
  const md = dlg('compare-dialog scenario-dialog', 'compare-dialog', '<div class="dialog-head"><h2>Before / After 배치 비교</h2><button type="button" data-close data-testid="compare-close">닫기 ×</button></div><div class="detail-controls"><select data-mode data-testid="compare-mode" aria-label="배치 비교 모드"><option value="sides">BEFORE/AFTER 좌우 차이</option><option value="before">BEFORE 단독</option><option value="after">AFTER 단독</option><option value="overlay">반투명 중첩 차이</option></select><button type="button" data-save data-testid="compare-json">비교 중 JSON 저장</button><button type="button" data-csv data-testid="compare-csv">랙 변경 CSV</button></div><div data-sources></div><p class="muted">현재 편집 중인 두 배치를 비교합니다. 날짜 조회 화면과 별개입니다. 수량은 동일 단위별로 계산합니다.</p><div class="compare-plans" data-plans><svg data-before role="img" aria-label="BEFORE"></svg><svg data-after role="img" aria-label="AFTER"></svg></div><svg class="group-preview" data-overlay hidden role="img" aria-label="중첩"></svg><div class="records-table" data-metrics data-testid="compare-metrics"></div><div class="records-table" data-testid="compare-rows" data-rows></div><button type="button" id="mCompareSvg" data-compare-svg data-testid="compare-svg">전후 비교 SVG</button> <button type="button" id="mComparePng" data-compare-png data-testid="compare-png">전후 비교 PNG</button> <button type="button" id="compareCsv" data-compare-csv data-testid="export-compare-csv" style="margin-top:14px">비교 요약 CSV</button>', 'compareDialog');
  const drawCompare = () => {
    const p = getProject(), d = rackDiff(p.scenarios.before, p.scenarios.after), vb = common(p), mode = q(md, '[data-mode]').value;
    const sc = (k) => buildScene(p.scenarios[k], p, { scope: k, tool: 'none', mini: true }).svg;
    for (const k of ['before', 'after']) {
      const s = q(md, `[data-${k}]`);
      s.setAttribute('viewBox', vb);
      s.innerHTML = sc(k) + diffOverlay(d, k);
      s.hidden = mode === 'overlay' || (mode !== 'sides' && mode !== k);
    }
    q(md, '[data-plans]').hidden = mode === 'overlay';
    const o = q(md, '[data-overlay]');
    o.hidden = mode !== 'overlay';
    o.setAttribute('viewBox', vb);
    o.innerHTML = `<g opacity=".25">${sc('before')}</g>${sc('after')}${diffOverlay(d, 'before')}${diffOverlay(d, 'after')}`;
    q(md, '[data-sources]').innerHTML = ['before', 'after'].map((k) => `<p class="muted"><b>${k.toUpperCase()}</b> · ${esc(sourceText(p, k))}</p>`).join('');
    q(md, '[data-metrics]').innerHTML = table(compareRows(p));
    const noBefore = !racksOf(p.scenarios.before).length;
    q(md, '[data-rows]').innerHTML = `<p class="info">${noBefore ? '개선 전 기준 도면이 없어 배치 개선 효과를 비교할 수 없습니다.' : p.scenarios.before.referenceSample ? 'BEFORE는 참고 샘플입니다. 실제 기준 도면으로 확정하지 마세요.' : '공통 원점·동일 배율 비교입니다. 위치·치수 근거와 창고/층의 동일성을 확인하세요.'}</p><p class="muted">녹색: 신규 / 빨강 점선: 제거 / 파랑·화살표: 이동 / R: 회전 / 주황: 설계 규격 · 내부 채움은 기존 재고 색상</p>` + table([['랙', '변경 유형 (복수)', 'BEFORE X/Y/° · 설계 m', 'AFTER X/Y/° · 설계 m', '원본 규격 m'], ...diffRows(d)]);
  };
  q(md, '[data-mode]').addEventListener('change', drawCompare);
  q(md, '[data-save]').addEventListener('click', () => download(jsonName(), JSON.stringify(getProject(), null, 2), 'application/json'));
  q(md, '[data-csv]').addEventListener('click', () => { const p = getProject(); download('warehouse_rack_changes.csv', csvEncode([DIFF_CSV_HEADER, ...diffRows(rackDiff(p.scenarios.before, p.scenarios.after))]), 'text/csv;charset=utf-8'); });
  q(md, '[data-compare-csv]').addEventListener('click', () => download('warehouse_comparison.csv', csvEncode(compareRows(getProject())), 'text/csv;charset=utf-8'));
  q(md, '[data-compare-svg]').addEventListener('click', () => download('warehouse_before_after.svg', compareSvg(getProject()), 'image/svg+xml;charset=utf-8'));
  q(md, '[data-compare-png]').addEventListener('click', async () => {
    try { download('warehouse_before_after.png', await pngBlob(compareSvg(getProject()))); } catch (e) { toast('비교 PNG 생성 실패: ' + e.message); }
  });
  const openCompare = () => { drawCompare(); if (!md.open) md.showModal(); };

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
    q(hd, '[data-hrows]').innerHTML = '<table><tr><th>가져오기 시각 / 기준일</th><th>파일 / 시트</th><th>대상 / 방식</th><th>추가·수정·삭제 / 오류·경고</th><th>이전 상태</th></tr>' + p.importHistory.slice(-50).reverse().map((h) => `<tr><td>${esc(h.importedAt || '시각 미기록')}<br>${esc(h.date)}</td><td>${esc(h.file)} / ${esc(h.sheet)}</td><td>${esc(h.scenario)} / ${esc(h.mode)}</td><td>${h.changes?.added ?? '—'} / ${h.changes?.updated ?? '—'} / ${h.changes?.deleted ?? '미기록'} · ${h.errorCount ?? '미기록'} / ${h.warningCount ?? '미기록'}</td><td><button type="button" data-restore="${esc(h.backupId || '')}" ${p.layoutBackups.some((b) => b.id === h.backupId) ? '' : 'disabled'}>이전 상태 복원</button></td></tr>`).join('') + '</table>';
    q(hd, '[data-brows]').innerHTML = '<table>' + p.layoutBackups.slice().reverse().map((b) => `<tr><td>${esc(b.time)}</td><td>${b.target.toUpperCase()}</td><td>${esc(b.reason)} / ${esc(b.meta.versionId)}</td><td><button type="button" data-restore="${esc(b.id)}">이 상태로 복원</button></td></tr>`).join('') + '</table>';
  };
  hd.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-restore]');
    if (!b) return;
    const p = getProject(), backup = p.layoutBackups.find((x) => x.id === b.dataset.restore);
    if (!backup) return toast('백업이 만료되었거나 없습니다.');
    if (backup.target === 'before' && p.scenarioMeta.before.locked && !confirm('잠긴 BEFORE를 백업으로 복원합니까? AFTER는 유지됩니다.')) return;
    if (!confirm(`${backup.target.toUpperCase()}의 ${backup.time} 이전 상태를 복원합니까? 현재 대상 상태도 다시 백업합니다.`)) return;
    const r = await apply(restoreCommand, (pr, o) => restoreBackup(pr, backup.id, o));
    if (r?.ok) drawHistory(); else failed(r);
  });
  hd.addEventListener('toggle', drawHistory);
  const openHistory = () => { openHistoryPanel(); hd.open = true; drawHistory(); hd.scrollIntoView({ block: 'center' }); };

  return { openClone, openCompare, openHistory, renderHistory: drawHistory };
}
