// Excel 가져오기 대화상자 — 1단계: 파일 읽기·시트·머리글 행·열 매핑·분석·규격 충돌 선택(기준본 40 excelDialog 앞부분).
// 배치 생성·적용은 Phase 5b. 파일은 이 브라우저 안에서만 읽고 어디에도 보내지 않는다.
import { esc } from '../cad/scene.js';
import { formatNumber as fmt } from '../core/format.js';
import { readWorkbook, sheetMatrix, encodeCol } from '../excel/xlsx.js';
import { FIELDS, detectHeaderRow, autoMap, analyzeSheet } from '../excel/analyze.js';

const MARKUP = `<div class="dialog-head"><h2>Excel 가져오기 · 분석</h2><button type="button" data-close data-testid="excel-close">닫기 ×</button></div>
<p class="muted">파일은 이 PC·브라우저 안에서만 읽습니다. 현재 단계는 열 매핑과 데이터 검증까지이며, 랙 배치 생성·적용은 다음 단계에서 추가됩니다.</p>
<div class="excel-top">
<label>파일<input type="file" accept=".xlsx,.csv" data-file data-testid="excel-file"></label>
<span class="muted" data-filename data-testid="excel-filename"></span>
<label>시트<select data-sheet data-testid="excel-sheet"></select></label>
<label>머리글 행<input type="number" min="1" step="1" data-header data-testid="excel-header" class="mini-input"></label>
<button type="button" data-remap data-testid="excel-remap">머리글로 다시 매핑</button>
</div>
<div class="excel-grid"><section><h3>열 매핑</h3><div class="excel-mapping" data-mapping data-testid="excel-mapping"></div></section>
<section><h3>검증 결과</h3><div data-summary data-testid="excel-summary" class="info"></div><div data-dims data-testid="excel-dims"></div><div class="excel-issues" data-issues data-testid="excel-issues"></div></section></div>`;

export function createExcelDialog({ toast }) {
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
  function renderAnalysis() {
    const a = state.analysis;
    const shelfCount = new Set(a.rows.map((i) => i.shelfKey)).size, itemCodes = new Set(a.rows.map((i) => i.itemCode).filter(Boolean)).size;
    const missing = FIELDS.filter(([k]) => state.mapping[k] < 0).length;
    $('[data-summary]').innerHTML = `<div class="excel-counts"><span>데이터 <b>${a.dataRows}</b>행</span><span>유효 <b>${a.rows.length}</b>건</span><span>랙 <b>${a.racks.length}</b></span><span>선반 <b>${shelfCount}</b></span><span>품목 <b>${itemCodes}</b></span></div>20개 필드 중 ${20 - missing}개 매핑 · 로케이션 ${a.rows.length}개 · 중복 ${a.duplicates}개<br>고유 랙 면적 ${fmt(a.area, 4)}㎡${a.referenceArea > 0 ? ` / 원본 총면적 ${fmt(a.referenceArea)}㎡ 대비 ${fmt((a.area / a.referenceArea) * 100, 1)}%` : ''}<br>총면적은 참고용입니다. 가로·세로를 임의로 결정하지 않습니다.`;
    $('[data-issues]').innerHTML = a.issues.map((i) => `<div class="${i.type === 'warning' ? 'issue-warning' : 'issue-error'}">${i.row ? `원본 ${i.row}행 · ` : ''}${esc(i.text)}</div>`).join('') || '<p class="info">데이터 오류 없음</p>';
    $('[data-dims]').innerHTML = a.dimensionConflicts.map((c) => `<label class="excel-dim">${esc(c.key)} 치수 선택<select data-dim="${esc(c.key)}"><option value="">사용할 규격을 선택하세요.</option>${c.options.map((v, n) => `<option value="${n}" ${JSON.stringify(state.resolutions[c.key]) === JSON.stringify(v) ? 'selected' : ''}>${v.join(' × ')} mm</option>`).join('')}</select></label>`).join('');
  }

  $('[data-close]').addEventListener('click', () => dialog.close());
  $('[data-file]').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      state.book = null;
      state.resolutions = {};
      $('[data-summary]').textContent = '새 파일을 읽고 있습니다.';
      $('[data-issues]').innerHTML = '';
      state.book = await readWorkbook(f.name, await f.arrayBuffer());
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

  return { open: () => dialog.open || dialog.showModal(), get state() { return state; } };
}
