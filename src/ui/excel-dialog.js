// Excel 가져오기 대화상자 — 1단계: 파일 읽기·시트·머리글 행·열 매핑·분석·규격 충돌 선택(기준본 40 excelDialog 앞부분).
// 배치 생성·적용은 Phase 5b. 파일은 이 브라우저 안에서만 읽고 어디에도 보내지 않는다.
import { esc } from '../cad/scene.js';
import { formatNumber as fmt } from '../core/format.js';
import { readWorkbook, sheetMatrix, encodeCol } from '../excel/xlsx.js';
import { FIELDS, detectHeaderRow, autoMap, analyzeSheet } from '../excel/analyze.js';
import { readExcelConfig, buildProposal } from '../excel/proposal.js';
import { buildScene } from '../cad/scene.js';
import { warnings as spatialWarnings } from '../warehouse/constraints.js';

const MARKUP = `<div class="dialog-head"><h2>Excel 가져오기 · 분석</h2><button type="button" data-close data-testid="excel-close">닫기 ×</button></div>
<p class="muted">파일은 이 PC·브라우저 안에서만 읽습니다. 선택한 배치(BEFORE 또는 AFTER)만 바꾸고 적용 직전 상태를 자동 백업합니다. 대안 자동 배치 후보는 다음 단계에서 추가됩니다.</p>
<div class="excel-top">
<label>파일<input type="file" accept=".xlsx,.csv" data-file data-testid="excel-file"></label>
<span class="muted" data-filename data-testid="excel-filename"></span>
<label>시트<select data-sheet data-testid="excel-sheet"></select></label>
<label>머리글 행<input type="number" min="1" step="1" data-header data-testid="excel-header" class="mini-input"></label>
<button type="button" data-remap data-testid="excel-remap">머리글로 다시 매핑</button>
</div>
<div class="excel-grid"><section><h3>열 매핑</h3><div class="excel-mapping" data-mapping data-testid="excel-mapping"></div></section>
<section><h3>검증 결과</h3><div data-summary data-testid="excel-summary" class="info"></div><button type="button" data-copy data-testid="excel-copy">매핑 요약 복사(값 제외)</button><div data-dims data-testid="excel-dims"></div><div class="excel-issues" data-issues data-testid="excel-issues"></div></section></div>
<h3>배치안 미리보기</h3>
<form class="excel-config" data-config data-testid="excel-config">
<label>대상<select name="target"><option value="before">BEFORE</option><option value="after">AFTER</option></select></label>
<label>방식<select name="mode"><option value="new">전체 교체(새 배치)</option><option value="merge">병합</option><option value="update">기존 랙만 갱신</option></select></label>
<label>기존 랙 위치<select name="keep"><option value="keep">유지</option><option value="reflow">규칙대로 재배치</option></select></label>
<label>건물<input name="building" value="" placeholder="예: 본관"></label>
<label>층<select name="floor"></select></label>
<label>기준일<input name="date" type="date"></label>
<label>출처<input name="source" placeholder="예: 11월 로케이션 목록"></label>
<label>창고 가로 (m)<input name="width" type="number" step="0.1"></label><label>창고 세로 (m)<input name="depth" type="number" step="0.1"></label>
<label>원점 X (m)<input name="originX" type="number" step="0.001"></label><label>원점 Y (m)<input name="originY" type="number" step="0.001"></label>
<label>열 진행<select name="columnDirection"><option value="east">동쪽(→)</option><option value="west">서쪽(←)</option></select></label>
<label>첫 랙 위치<select name="firstRackPosition"><option value="north">북쪽</option><option value="south">남쪽</option></select></label>
<label>열 사이 간격 (m)<input name="columnGap" type="number" step="0.001"></label><label>랙 사이 간격 (m)<input name="rackGap" type="number" step="0.001"></label>
<label>랙 회전 (°)<input name="rotation" type="number" step="1"></label><label>북쪽 회전 (°)<input name="northRotation" type="number" step="1"></label>
<label>벽 최소 이격 (m)<input name="wallGap" type="number" step="0.001"></label><label>통로 목표 폭 (m)<input name="aisleTarget" type="number" step="0.001"></label>
<label>열 순서(비우면 자동)<input name="order" placeholder="예: B, A"></label>
<label>누락 랙<select name="missingPolicy"><option value="mark">유지 + 이번 파일 미등록 표시</option><option value="keep">기존 정보 그대로 유지</option><option value="delete">직접 체크한 누락 랙만 삭제</option></select></label>
<label>재가져오기 규격<select name="specPolicy"><option value="keep">기존 설계 규격 유지(원본 규격만 갱신)</option><option value="source">새 Excel 규격을 설계에도 적용</option></select></label>
<label class="check"><input type="checkbox" name="keepManual" checked> 기존 수동 랙 위치 유지</label>
<label class="check"><input type="checkbox" name="preserveStructures" checked> 전체 교체 시 구조물 유지</label>
<label class="check"><input type="checkbox" name="empty"> 빈 번호 후보 생성</label>
<label>빈 후보 폭·깊이·높이 (m)<span class="triple"><input name="emptyW" type="number" step="0.01" value="1"><input name="emptyD" type="number" step="0.01" value="0.6"><input name="emptyH" type="number" step="0.01" value="2"></span></label>
<label class="check"><input type="checkbox" name="skip"> 오류 행 제외 허용</label>
</form>
<div class="excel-preview-grid"><svg class="group-preview" data-preview data-testid="excel-preview" role="img" aria-label="배치안 미리보기"></svg>
<div><p class="info" data-pstats data-testid="excel-pstats"></p><p class="muted" data-changes data-testid="excel-changes"></p><div class="excel-issues" data-spatial></div>
<label class="check" data-ackrow hidden><input type="checkbox" data-ack data-testid="excel-ack"> 공간 경고를 확인했으며 경고가 있는 배치안을 적용합니다.</label>
<label class="check"><input type="checkbox" name="recordLayout" data-record> 적용 후 이 배치를 기준일 기록으로 저장</label>
<button type="button" class="primary" disabled data-apply data-testid="excel-apply">확인 후 적용</button><p class="muted" data-applymsg data-testid="excel-applymsg" role="status"></p></div></div>`;

export function createExcelDialog({ toast, getProject, nextId, applyProposal }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'excel-dialog';
  dialog.dataset.testid = 'excel-dialog';
  dialog.innerHTML = MARKUP;
  document.body.append(dialog);
  const $ = (s) => dialog.querySelector(s);
  const state = { book: null, sheetName: '', matrix: [], mapping: {}, resolutions: {}, analysis: null };

  function analyze() {
    if (!state.book) return;
    const sheet = state.book.sheets[state.sheetName];
    state.analysis = analyzeSheet({ matrix: state.matrix, headerRow1: Number($('[data-header]').value), mapping: state.mapping, cell: (a) => sheet.cells.get(a), resolutions: state.resolutions });
    renderAnalysis();
  }
  function renderMap() {
    const row = state.matrix[Number($('[data-header]').value) - 1] || [];
    $('[data-mapping]').innerHTML = FIELDS.map(([key, name]) => `<label>${esc(name)}<select data-map="${key}"><option value="-1">미지정</option>${row.map((v, i) => `<option value="${i}" ${state.mapping[key] === i ? 'selected' : ''}>${encodeCol(i)} · ${esc(v ?? '빈 열')}</option>`).join('')}</select></label>`).join('');
  }
  function remap() {
    state.mapping = autoMap(state.matrix, Number($('[data-header]').value));
    renderMap();
    analyze();
  }
  function loadSheet() {
    state.sheetName = $('[data-sheet]').value;
    state.matrix = sheetMatrix(state.book.sheets[state.sheetName]);
    $('[data-header]').value = detectHeaderRow(state.matrix) + 1;
    remap();
  }
  const form = () => $('[data-config]');
  /** 대상 배치의 창고·자동 배치 설정으로 칸을 채운다(기준본 R.targetSettings, EX.open 기본값). */
  function fillTarget(init = false) {
    const p = getProject();
    const f = form();
    if (init) {
      f.target.value = p.metadata.sample ? 'before' : p.settings.scenario;
      f.mode.value = p.metadata.sample ? 'new' : 'merge';
      f.keep.value = 'keep';
      if (!f.date.value) f.date.value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    }
    const k = f.target.value, w = p.scenarios[k].warehouse, l = p.scenarioMeta[k].locationLayout;
    f.width.value = w.width;
    f.depth.value = w.height;
    for (const key of ['originX', 'originY', 'columnDirection', 'firstRackPosition', 'columnGap', 'rackGap', 'northRotation', 'rotation', 'wallGap', 'aisleTarget']) f[key].value = l[key];
    state.perColumnSettings = structuredClone(l.perColumnSettings || {});
  }
  function preview() {
    state.proposal = null;
    const f = form(), a = state.analysis;
    const svg = $('[data-preview]');
    try {
      if (!a) throw new Error('파일과 시트를 선택하세요.');
      if (a.issues.some((i) => i.type === 'conflict')) throw new Error('치수 충돌을 먼저 해결하세요.');
      if (a.issues.some((i) => i.type === 'error') && !f.skip.checked) throw new Error('오류 행을 수정하거나 제외 허용을 직접 선택하세요.');
      if (!a.racks.length) throw new Error('유효한 랙이 없습니다.');
      const raw = Object.fromEntries([...new FormData(f).entries()]);
      for (const k of ['keepManual', 'preserveStructures', 'empty']) raw[k] = f[k].checked;
      Object.assign(raw, { perColumnSettings: state.perColumnSettings, autoMode: 'inside', allowRotation: false, allowWarnings: true, recordLayout: $('[data-record]').checked });
      const c = readExcelConfig(raw);
      const p = getProject();
      const pr = buildProposal(p, a, c, { nextId, filename: state.filename, sheet: state.sheetName });
      const ws = spatialWarnings(pr.layout, p);
      pr.warnings = ws;
      state.proposal = pr;
      state.proposalProject = p;
      const key = JSON.stringify([c, ws.map((w) => w.text)]);
      if (state.ackKey !== key) {
        $('[data-ack]').checked = false;
        state.ackKey = key;
      }
      $('[data-ackrow]').hidden = !ws.length;
      $('[data-apply]').textContent = c.target.toUpperCase() + (ws.length ? '에 경고 확인 후 적용' : '에 확인 후 적용');
      svg.setAttribute('viewBox', `-1.2 -1.2 ${c.width + 2.4} ${c.depth + 2.4}`);
      svg.innerHTML = buildScene(pr.layout, p, { tool: 'none' }).svg;
      const racks = (l) => l.objects.filter((o) => o.kind === 'rack').length;
      $('[data-pstats]').textContent = `대상 ${c.target.toUpperCase()} · 기존 ${racks(p.scenarios[c.target])}랙 / Excel 고유 ${a.racks.length}랙 / 적용 후 ${racks(pr.layout)}랙 · 일치 ${pr.changes.updated} / 오류 ${a.issues.filter((i) => i.type === 'error').length} / 경고 ${ws.length}`;
      $('[data-changes]').textContent = `신규 ${pr.changes.added} / 기존 갱신 ${pr.changes.updated} / 규격 후보 ${pr.changes.dimensions} / 누락 ${pr.changes.missing} / 제거 승인 후보 ${pr.changes.deleted}랙 + 구조물 ${pr.changes.structuresDeleted || 0} / 업데이트 모드 신규 제외 ${pr.changes.skippedNew} · 자재 추가 ${pr.changes.itemsAdded} / 제거 ${pr.changes.itemsRemoved} / 값 변경 ${pr.changes.itemsChanged}`;
      $('[data-spatial]').innerHTML = ws.map((w) => `<div class="issue-warning">${esc(w.text)}</div>`).join('') || '<p class="info">설정 기준 공간 경고 없음</p>';
    } catch (err) {
      $('[data-pstats]').textContent = err.message;
      $('[data-changes]').textContent = '';
      $('[data-spatial]').innerHTML = '';
      svg.innerHTML = '';
    }
    readiness();
  }
  function readiness() {
    const pr = state.proposal;
    $('[data-apply]').disabled = !pr || (pr.warnings.length > 0 && !$('[data-ack]').checked);
  }
  /** 기준본 EX.apply: 잠금·최종 확인 → 원자적 적용. 미리보기 이후 프로젝트가 바뀌었으면 다시 확인하게 한다. */
  async function apply() {
    const pr = state.proposal, msg = $('[data-applymsg]');
    if (!pr) return;
    if (state.proposalProject !== getProject()) {
      preview();
      msg.textContent = '확인한 후보가 변경되었습니다. 미리보기와 경고를 다시 확인해 주세요.';
      return;
    }
    const c = pr.config, p = getProject();
    if (c.target === 'before' && p.scenarioMeta.before.locked && !confirm('BEFORE 원본 잠금이 활성화되어 있습니다. 이번 Excel 갱신을 허용합니까? 잠금은 갱신 후에도 유지됩니다.')) {
      msg.textContent = 'BEFORE 잠금 승인을 취소했습니다. 기존 배치는 유지됩니다.';
      return;
    }
    if (!confirm(`${c.target.toUpperCase()} · ${c.mode} · 신규 ${pr.changes.added} / 갱신 ${pr.changes.updated} / 제거 ${pr.changes.deleted}랙·구조물 ${pr.changes.structuresDeleted || 0}\n선택한 배치만 변경하고 자동 백업합니다. 다른 편집안은 유지됩니다.\n브라우저 저장소의 실제 남은 용량은 알 수 없습니다. 적용 전 JSON 백업을 권장하며 저장 성공을 보장하지 않습니다. 적용할까요?`)) {
      msg.textContent = '최종 적용 확인을 취소했습니다. 기존 배치는 유지됩니다.';
      return;
    }
    const r = await applyProposal(pr, { filename: state.filename, sheet: state.sheetName, analysis: structuredClone(state.analysis), acknowledged: $('[data-ack]').checked, candidate: '기존 배치 규칙' });
    if (r?.ok) {
      msg.textContent = '';
      dialog.close();
      toast(c.target.toUpperCase() + ' 가져오기 완료 · 다른 편집안은 유지됩니다.');
    } else {
      msg.textContent = 'ROLLED_BACK · 전체 취소: ' + (r?.reason ?? '알 수 없는 오류') + ' · 기존 배치는 그대로입니다.';
      toast(msg.textContent);
    }
  }
  /** 매핑 결과 요약(머리글 이름·열 위치·건수·문제 유형만, 데이터 값 제외). */
  function mappingSummary() {
    const a = state.analysis;
    const row = state.matrix[Number($('[data-header]').value) - 1] || [];
    const lines = [`시트: ${state.sheetName} · 머리글 ${$('[data-header]').value}행 · 열 ${row.length}개`];
    for (const [k, name] of FIELDS) lines.push(`${name} ← ${state.mapping[k] >= 0 ? `${encodeCol(state.mapping[k])} "${row[state.mapping[k]] ?? ''}"` : '미지정'}`);
    const unmapped = row.map((v, i) => [i, v]).filter(([i, v]) => v !== null && !Object.values(state.mapping).includes(i)).map(([i, v]) => `${encodeCol(i)} "${v}"`);
    lines.push(`매핑 안 된 열: ${unmapped.join(', ') || '없음'}`);
    if (a) {
      lines.push(`데이터 ${a.dataRows}행 · 유효 ${a.rows.length} · 랙 ${a.racks.length} · 중복 ${a.duplicates} · 규격 충돌 ${a.dimensionConflicts.length}`);
      const counts = {};
      for (const i of a.issues) {
        const key = `${i.type}: ${i.text.replace(/[0-9]+F-[A-Z]+-[0-9-]+/g, '<로케이션>').replace(/: .*/, '')}`;
        counts[key] = (counts[key] ?? 0) + 1;
      }
      for (const [k, n] of Object.entries(counts)) lines.push(`${k} × ${n}`);
    }
    return lines.join('\n');
  }

  function renderAnalysis() {
    const a = state.analysis;
    const shelfCount = new Set(a.rows.map((i) => i.shelfKey)).size, itemCodes = new Set(a.rows.map((i) => i.itemCode).filter(Boolean)).size;
    const missing = FIELDS.filter(([k]) => state.mapping[k] < 0).length;
    $('[data-summary]').innerHTML = `<div class="excel-counts"><span>데이터 <b>${a.dataRows}</b>행</span><span>유효 <b>${a.rows.length}</b>건</span><span>랙 <b>${a.racks.length}</b></span><span>선반 <b>${shelfCount}</b></span><span>품목 <b>${itemCodes}</b></span></div>20개 필드 중 ${20 - missing}개 매핑 · 로케이션 ${a.rows.length}개 · 중복 ${a.duplicates}개<br>고유 랙 면적 ${fmt(a.area, 4)}㎡${a.referenceArea > 0 ? ` / 원본 총면적 ${fmt(a.referenceArea)}㎡ 대비 ${fmt((a.area / a.referenceArea) * 100, 1)}%` : ''}<br>총면적은 참고용입니다. 가로·세로를 임의로 결정하지 않습니다.`;
    $('[data-issues]').innerHTML = a.issues.map((i) => `<div class="${i.type === 'warning' ? 'issue-warning' : 'issue-error'}">${i.row ? `원본 ${i.row}행 · ` : ''}${esc(i.text)}</div>`).join('') || '<p class="info">데이터 오류 없음</p>';
    const floors = [...new Set(a.rows.map((r) => r.floor))].sort((x, y) => String(x).localeCompare(String(y), 'en', { numeric: true }));
    const prevFloor = form().floor.value;
    form().floor.innerHTML = floors.map((fl) => `<option ${fl === prevFloor ? 'selected' : ''}>${esc(fl)}</option>`).join('');
    preview();
    $('[data-dims]').innerHTML = a.dimensionConflicts.map((c) => `<label class="excel-dim">${esc(c.key)} 치수 선택<select data-dim="${esc(c.key)}"><option value="">사용할 규격을 선택하세요.</option>${c.options.map((v, n) => `<option value="${n}" ${JSON.stringify(state.resolutions[c.key]) === JSON.stringify(v) ? 'selected' : ''}>${v.join(' × ')} mm</option>`).join('')}</select></label>`).join('');
  }

  $('[data-close]').addEventListener('click', () => dialog.close());
  $('[data-ack]').addEventListener('change', readiness);
  $('[data-record]').addEventListener('change', () => preview());
  $('[data-apply]').addEventListener('click', apply);
  form().addEventListener('change', (e) => {
    if (e.target.name === 'target') fillTarget();
    preview();
  });
  $('[data-copy]').addEventListener('click', async () => {
    if (!state.book) return toast('먼저 파일을 선택하세요.');
    const text = mappingSummary();
    try {
      await navigator.clipboard.writeText(text);
      toast('매핑 요약을 복사했습니다(데이터 값 제외).');
    } catch {
      state.lastSummary = text;
      toast('클립보드에 복사하지 못했습니다. 요약을 화면에 표시합니다.');
      $('[data-issues]').insertAdjacentHTML('afterbegin', `<pre class="summary-text">${esc(text)}</pre>`);
    }
  });
  $('[data-file]').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      state.book = null;
      state.resolutions = {};
      $('[data-summary]').textContent = '새 파일을 읽고 있습니다.';
      $('[data-issues]').innerHTML = '';
      state.book = await readWorkbook(f.name, await f.arrayBuffer());
      state.filename = f.name;
      $('[data-filename]').textContent = `${f.name} · ${fmt(f.size / 1024, 1)}KB`;
      $('[data-sheet]').innerHTML = state.book.sheetNames.map((n) => `<option>${esc(n)}</option>`).join('');
      loadSheet();
    } catch (err) {
      $('[data-summary]').textContent = `읽기 실패: ${err.message}`;
      toast(err.message);
    }
  });
  $('[data-sheet]').addEventListener('change', () => { try { loadSheet(); } catch (err) { toast(err.message); } });
  $('[data-header]').addEventListener('change', () => { renderMap(); analyze(); });
  $('[data-remap]').addEventListener('click', () => state.book && remap());
  $('[data-mapping]').addEventListener('change', (e) => {
    const el = e.target.closest('[data-map]');
    if (!el) return;
    state.mapping[el.dataset.map] = Number(el.value);
    analyze();
  });
  $('[data-dims]').addEventListener('change', (e) => {
    const el = e.target.closest('[data-dim]');
    if (!el) return;
    const c = state.analysis.dimensionConflicts.find((x) => x.key === el.dataset.dim);
    if (el.value === '') delete state.resolutions[c.key];
    else state.resolutions[c.key] = c.options[Number(el.value)];
    analyze();
  });

  return {
    open() {
      fillTarget(true);
      if (!dialog.open) dialog.showModal();
      preview();
    },
    mappingSummary,
    get state() { return state; },
  };
}
