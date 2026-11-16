// Excel 가져오기 대화상자 — 1단계: 파일 읽기·시트·머리글 행·열 매핑·분석·규격 충돌 선택(기준본 40 excelDialog 앞부분).
// 배치 생성·적용은 Phase 5b. 파일은 이 브라우저 안에서만 읽고 어디에도 보내지 않는다.
import { esc } from '../cad/scene.js';
import { formatNumber as fmt } from '../core/format.js';
import { readWorkbook, sheetMatrix, encodeCol } from '../excel/xlsx.js';
import { FIELDS, detectHeaderRow, autoMap, analyzeSheet } from '../excel/analyze.js';
import { readExcelConfig } from '../excel/proposal.js';
import { csvEncode } from '../warehouse/rackinfo.js';
import { fixedText } from '../autolayout/fixed-columns.js';
import { buildCandidates, reoptimize, candidateSummary } from '../autolayout/candidates.js';
import { columnReoptimize, columnSafe, stopText, COLUMN_LIMITS } from '../autolayout/column.js';
import { unionArea } from '../warehouse/metrics.js';
import { buildScene } from '../cad/scene.js';
import { warnings as spatialWarnings, excessText, scanLayout } from '../warehouse/constraints.js';
import { bounds } from '../geometry/polygons.js';

const ISSUE_NAMES = { boundary: '경계 초과', rackCollision: '랙 충돌', structureCollision: '구조물 충돌', aisle: '통로 기준', gap: '최소 간격', waiting: '배치 대기', column: '열 조건' };
const COLUMN_HEAD = ['후보', '조건 충족 / 내부', '외부', '열 조건 위반', '수동 이동', '공간 위반', '계산', '이동'];
const PAGE = 50;
const pager = (kind, page, total) => `<div class="row"><button type="button" data-cl-page="${kind}" data-cl-next="${page - 1}" ${page <= 0 ? 'disabled' : ''}>이전</button><span>${total}건 · ${page + 1}/${Math.max(1, Math.ceil(total / PAGE))}쪽 · ${PAGE}건씩 표시</span><button type="button" data-cl-page="${kind}" data-cl-next="${page + 1}" ${(page + 1) * PAGE >= total ? 'disabled' : ''}>다음</button></div>`;
const COMPARE_HEAD = ['후보 / 적용 선택', '내부 / 기준 충족', '경계 / 대기', '랙 / 구조물 충돌', '통로 / 간격', '수동 변경 / 이동', '순서 차이', '랙 면적 / 창고 면적'];

const B = (id, text, attr = '') => `<button type="button" id="${id}" ${attr}>${text}</button>`;
const MARKUP = `<div class="ex-sticky"><button type="button" id="exClose" class="close" data-close data-testid="excel-close">닫기 ×</button><h2>Excel 연동 / 창고 레이아웃 자동 생성</h2><p class="muted">엑셀 치수와 사용자 지정 규칙으로 만드는 초기 설계안입니다. 적용 전까지 현재 프로젝트를 변경하지 않습니다.</p></div>
<form data-config data-testid="excel-config" autocomplete="off">
<section id="rTargetBox" class="r-box"><h3>적용할 편집 배치 · 다른 편집안은 유지</h3><div class="r-target"><label>가져오기 대상<select id="rTarget" name="target"><option value="before">BEFORE — 개선 전</option><option value="after">AFTER — 개선 후</option></select></label><label class="check"><input id="rTargetConfirm" data-targetconfirm type="checkbox">선택한 대상 배치를 확인했습니다.</label></div><p id="rTargetWarning" class="r-notice"></p><label class="check"><input type="checkbox" checked disabled>적용 전 대상 자동 백업 (필수 · 최신 최대 6개 / JSON 합계 3.2MB · 정상 저장·검증 성공 시 오래된 백업부터 교체 · 실패 시 기존 백업 보존)</label></section>
<div class="ex-grid"><section><h3>1 / 파일 · 데이터 분석</h3><label class="filebtn">파일 선택<input id="exFileDialog" type="file" accept=".xlsx,.csv" hidden data-file data-testid="excel-file"></label><span id="exFilename" class="muted" data-filename data-testid="excel-filename">파일을 선택하세요.</span><div class="fields"><label>워크시트<select id="exSheet" data-sheet data-testid="excel-sheet"></select></label><label>머리글 행<input id="exHeader" type="number" value="8" min="1" max="100" data-header data-testid="excel-header"></label></div>${B('exRemap', '머리글 자동 인식', 'data-remap data-testid="excel-remap"')}${B('exAnalyze', '데이터 재분석', 'data-analyze data-testid="excel-analyze"')}<details><summary>20개 필드 / 수동 열 매핑</summary><div id="exMapping" class="ex-map" data-mapping data-testid="excel-mapping"></div></details><div id="exSummary" class="info" data-summary data-testid="excel-summary">파일 선택 후 시트와 머리글을 확인하세요.</div><label class="check"><input id="exSkip" name="skip" type="checkbox">오류 행 제외 허용 (첫 중복만 유지)</label><details open><summary>검증 결과 / 오류 원본 행</summary><div id="exIssues" class="ex-scroll" data-issues data-testid="excel-issues"></div>${B('exIssuesCsv', '검증 결과 CSV', 'data-issuescsv data-testid="excel-issues-csv"')}<div data-dims data-testid="excel-dims" id="exDimensions"></div></details></section>
<section><h3>2 / 창고 · 자동 배치 규칙</h3><div class="fields"><label>건물<input id="exBuilding" name="building" value="B동" maxlength="40"></label><label>층<select id="exFloor" name="floor"></select></label><label>창고 가로 (m)<input id="exWidth" name="width" type="number" min="1" max="500" step="0.1"></label><label>창고 세로 (m)<input id="exDepth" name="depth" type="number" min="1" max="500" step="0.1"></label><label>북쪽 표시<select id="exNorth" name="northRotation"><option value="0">화면 위 ↑</option><option value="90">화면 오른쪽 →</option><option value="180">화면 아래 ↓</option><option value="270">화면 왼쪽 ←</option></select></label><label>열 진행 방향<select id="exDirection" name="columnDirection"><option value="east">A → N / 동쪽 방향</option><option value="west">A → N / 서쪽 방향</option></select></label><label>A열 기준 X (m)<input id="exOriginX" name="originX" type="number" value="1" step="0.001"></label><label>A열 기준 Y (m)<input id="exOriginY" name="originY" type="number" value="1" step="0.001"></label><button type="button" id="exPick" class="full">도면에서 A열 시작점 지정</button><label>첫 랙 위치 / 번호 증가<select id="exFirst" name="firstRackPosition"><option value="north">북쪽 시작 → 남쪽 증가</option><option value="south">남쪽 시작 → 북쪽 증가</option></select></label><label>초기 회전 (°)<input id="exRotation" name="rotation" type="number" value="90" step="1"></label>${[['exColumnGap', 'columnGap', '열 사이 간격 (m)', '0.6'], ['exRackGap', 'rackGap', '랙 사이 간격 (m)', '0.2'], ['exWallGap', 'wallGap', '벽 최소 이격 (m)', '0.1'], ['exAisleTarget', 'aisleTarget', '통로 목표 폭 (m)', '1.2']].map(([id, n, t, v]) => `<label>${t}<input id="${id}" name="${n}" type="number" value="${v}" min="0" max="50" step=".01" title="${t.replace(' (m)', '')} · 증감 0.01m / 직접 입력 0.001m까지 · 0~50m"></label>`).join('')}<label class="full">사용자 정의 열 순서 (비우면 A~N)<input id="exOrder" name="order" placeholder="A,B,C,D,E,F,G,H,I,J,K,L,M,N"></label></div><p class="muted">기준점은 각 열의 가장 작은 등록 번호 랙의 <b>회전 외곽 좌상단</b>입니다. 남쪽 시작은 기준점에서 북쪽으로 진행하므로 Y 위치를 충분히 아래에 지정하세요. 동·서 방향은 북쪽 표시와 함께 회전합니다.</p>
<details><summary>열별 시작 좌표 · 북/남 · 회전</summary><p class="muted">빈 항목은 일괄 설정을 따릅니다. 각 열의 좌표는 자동 계산 대신 지정한 값을 사용합니다.</p><div class="ex-scroll"><table><thead><tr><th>열</th><th>X</th><th>Y</th><th>첫 랙</th><th>회전</th></tr></thead><tbody id="exColumns"></tbody></table></div></details>
<details><summary>기록 없는 번호의 랙 후보 생성</summary><label class="check"><input id="exEmpty" name="empty" type="checkbox">1번~최대 등록 번호 사이 누락 랙을 생성</label><div class="fields"><label>후보 폭 (m)<input id="exEmptyW" name="emptyW" value="1.2" type="number" min="0.01" step="0.01"></label><label>후보 깊이 (m)<input id="exEmptyD" name="emptyD" value="0.5" type="number" min="0.01" step="0.01"></label><label>후보 높이 (m)<input id="exEmptyH" name="emptyH" value="2" type="number" min="0.01" step="0.01"></label></div><p class="note">사용자가 선택한 후보이며 실존·빈 랙으로 확정하지 않습니다. 빈 선반·자재는 생성하지 않습니다.</p></details>
<h3>3 / 적용 · 재불러오기 정책</h3><div class="fields"><label>생성 방식<select id="exMode" name="mode"><option value="new">선택한 배치 전체 교체</option><option value="merge">선택한 배치에 병합</option><option value="update">기존 랙 정보만 업데이트 (신규 미추가)</option></select></label><label>기존 객체 위치<select id="exKeep" name="keep"><option value="">병합/업데이트 시 선택 필요</option><option value="keep">수동 위치·회전 유지</option><option value="reflow">규칙에 따라 재배치</option></select></label><label>가져오기 기준일<input id="exDate" name="date" type="date"></label><label>출처<input id="exSource" name="source" value="사용자 제공 Excel"></label></div><label class="check"><input id="exRecordLayout" name="recordLayout" type="checkbox" checked data-record>기준일의 배치 이력도 저장</label><label class="check"><input id="exAllowWarnings" name="allowWarnings" type="checkbox"> 경고가 발생해도 확인 후 설계안 적용 허용</label><p class="note">사라진 랙은 자동 삭제하지 않고 ‘이번 파일 미등록’으로 표시합니다. 현재고와 과거 수량 이력을 만들거나 덮어쓰지 않습니다.</p></section></div>
<h3>4 / 적용 전 미리보기</h3><div id="exPreviewStats" class="info" data-pstats data-testid="excel-pstats"></div>
<section id="wControls" class="w-box" data-testid="excel-cands"><h3>Excel 자동 배치 · v2.3.6</h3><div class="w-grid"><label>배치 방식<select id="wMode" name="autoMode"><option value="inside">창고 내부 수용 우선</option><option value="order">로케이션 순서 우선</option><option value="fixed">로케이션 열 고정 · 열·번호 순서 유지</option><option value="aisle">통로 확보 우선</option><option value="column">열 우선 최대 수용 · 미수용 외부 배치</option></select></label><label class="check"><input type="checkbox" id="wKeep" name="keepManual" checked>기존 수동 랙 위치 유지 (이전 자료의 미확인 위치 포함)</label><label class="check"><input type="checkbox" id="wRotate" name="allowRotation">자동 90° 회전 허용</label><label class="check"><input type="checkbox" id="wStructures" name="preserveStructures" checked>전체 교체 시 기존 구조물·보호 통로 유지</label><label>재최적화 대상<select id="wScope" data-scope data-testid="excel-scope"><option value="all">전체 랙</option><option value="boundary">경계 초과·대기 랙만</option><option value="collision">충돌·통로 침범 랙만</option><option value="new">신규 랙만</option><option value="selected">아래에서 선택한 랙만</option></select></label></div>
<details id="clOptions" data-colonly hidden><summary>열 우선 고급 설정</summary><p>엄격한 열·번호 순서 유지. 기본값: 줄바꿈 OFF / 회전 OFF / 수동·잠금 보호 ON. 열 간 이격은 열 간격·통로 목표·전역 최소 간격 중 큰 값을 사용합니다.</p><label class="check"><input id="clWrap" name="allowWrap" type="checkbox">같은 열 내부 줄바꿈 허용</label><p>미수용 외부 배치: 오른쪽만 지원 · 원래 회전 유지 · 좌표 범위 초과 시 적용 불가</p></details>
<details id="fxOptions" data-fixedonly hidden open><summary>로케이션 열 고정 설정</summary><p>열 순서와 열 안 번호 순서를 바꾸지 않습니다. 창고 치수와 랙 깊이로 열 사이 간격을 계산하고, 들어가지 않으면 랙을 옮기지 않고 부족한 길이를 알립니다. 북쪽 방향 0·90·180·270°에서 사용하며 열별 X·Y 지정은 무시합니다.</p><label>배치 축<select id="fxAxis" name="fixedAxis" data-testid="fixed-axis"><option value="column">열 배치(세로)</option><option value="row">행 배치(가로)</option><option value="auto">자동 추천 (모든 형태 비교)</option></select></label><label>한 줄 열 수<select id="fxPerLine" name="fixedPerLine" data-testid="fixed-perline"><option value="1">1열</option><option value="2">2열 (로케이션 순서대로 이어 놓음)</option></select></label><label>시작 방향<select id="fxStart" name="fixedStart" data-testid="fixed-start"><option value="config">첫 랙 위치 설정대로</option><option value="zigzag">지그재그 (줄마다 반대)</option></select></label><label>통로 방식<select id="fxPairing" name="fixedPairing" data-testid="fixed-pairing"><option value="all">모든 줄 사이 통로</option><option value="pairs">등 맞댐 쌍 (두 열씩 등을 붙임)</option></select></label><label>열 사이 간격<select id="fxSpacing" name="fixedSpacing" data-testid="fixed-spacing"><option value="max">남는 폭을 통로에 고르게 나눔</option><option value="target">통로 목표 폭 그대로</option></select></label><pre data-fixedplan data-testid="fixed-plan"></pre></details>
<p>실제 규격과 보호 구역을 유지하는 제한된 후보 탐색입니다. 최적해를 보장하지 않습니다. 위치 잠금은 자동 이동하지 않습니다. 내부 미수용 랙은 외부 대기 영역에 보존됩니다.</p>
<div class="row">${B('wOptimize', '배치 재최적화', 'data-optimize data-testid="excel-optimize"')}${B('wPrevious', '이전 후보로 돌아가기', 'disabled data-previous data-testid="excel-previous"')}${B('wPreviewAll', '모든 랙 보기')}${B('wPreviewViolations', '위반 랙 확인')}</div><div class="row" data-colonly hidden>${B('clReaccept', '외부 대기 랙 다시 수용 시도', 'data-reaccept data-testid="excel-reaccept"')}${B('clLegacy', '기존 내부 우선 방식으로 전환', 'data-legacy data-testid="excel-legacy"')}${B('clInsideFit', '창고 내부 맞춤', 'data-insidefit data-testid="excel-insidefit"')}</div>
<p id="wOptimizeNote" role="status" data-note data-testid="excel-note"></p><div id="wComparison" class="excel-scroll" data-comparison data-testid="excel-comparison"></div><section id="clResults" class="w-box" hidden data-colresults data-testid="excel-colresults"></section>
<label class="check"><input type="checkbox" id="wAck" data-ack data-testid="excel-ack">현재 후보의 경고를 확인했습니다 (실제 설치 승인과 다름)</label><div id="wPreviewDetail" class="w-box" hidden data-detail data-testid="excel-detail"></div><div id="wPreviewList" class="w-scroll" data-list data-testid="excel-list"></div></section>
<svg id="exPreview" xmlns="http://www.w3.org/2000/svg" aria-label="자동 생성 배치 미리보기" role="img" data-preview data-testid="excel-preview"></svg><div id="exChanges" class="info" data-changes data-testid="excel-changes"></div>
<div class="r-box"><label>이번 Excel에서 빠진 기존 랙<select id="rMissingPolicy" name="missingPolicy"><option value="mark">유지 + 이번 파일 미등록 표시</option><option value="keep">기존 정보 그대로 유지</option><option value="delete">직접 체크한 누락 랙만 삭제</option></select></label><div id="rMissingList"></div><p class="r-notice">전체 교체 모드의 제거 후보는 최종 확인 후에만 제거됩니다. 로케이션 누락을 물리적 랙 철거로 확정하지 않습니다. 표시 번호가 겹치면 신규 랙에만 건물명/일련번호(-2부터)를 붙입니다. 이는 화면 구분용이며 원본 로케이션·선반·자재 연결은 상세에서 확인할 수 있습니다.</p></div>
<div id="exSpatial" class="ex-scroll" data-spatial></div><label>재불러오기 규격 처리<select id="sReimportSpec" name="specPolicy"><option value="keep">기존 설계 규격 유지 (원본 규격만 갱신)</option><option value="source">새 Excel 규격을 설계에도 적용</option></select></label>
<div class="row" style="margin-top:14px">${B('exRefresh', '미리보기 갱신')}<div><p id="vExcelStorageRisk" class="r-notice">localStorage의 실제 남은 용량은 알 수 없습니다. 적용·교체 전 JSON 백업을 권장하며 저장 성공을 보장하지 않습니다.</p><p id="vExcelStorageStatus" role="status" class="r-notice">○ 저장되지 않은 변경사항 · UNSAVED</p>${B('vExcelStorageOpen', '저장소 관리')}</div><section id="exApplyStatus" class="w-box" role="status" aria-live="polite" data-applymsg data-testid="excel-applymsg"></section>${B('exApply', '확인 후 프로젝트에 적용', 'class="primary" disabled data-apply data-testid="excel-apply"')}<button type="button" id="rImportBackup" hidden>적용 취소 상태 JSON 백업 다운로드</button><span id="exPending" class="muted">실측 위치가 아닌 초기 설계안입니다.</span></div></form>`;

export function createExcelDialog({ toast, getProject, nextId, applyProposal, download, pickPoint, exportRecovery, openStorage }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'excel-dialog';
  dialog.dataset.testid = 'excel-dialog';
  dialog.innerHTML = MARKUP;
  document.body.append(dialog);
  const $ = (s) => dialog.querySelector(s);
  const state = { book: null, sheetName: '', matrix: [], mapping: {}, resolutions: {}, analysis: null, missingDelete: new Set(), applyError: '', previewError: '', failed: false, perColumnSettings: {} };

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
  // 기준본 70 대상 안내(미리보기 전·대상 변경 시). 미리보기가 계산되면 기준본 92 문구로 바뀐다.
  function targetNotice(p, target) {
    const racks = (k) => p.scenarios[k].objects.some((o) => o.kind === 'rack');
    $('#rTargetWarning').textContent = target === 'before' ? (racks('after') ? '개선 전 배치가 변경되면 현재 개선안과의 비교 기준도 달라질 수 있습니다. AFTER 배치는 유지됩니다.' : 'BEFORE에만 반영합니다.') : (racks('before') ? 'AFTER에만 반영합니다. BEFORE는 유지됩니다.' : '개선 전 기준 도면이 없어 배치 개선 효과를 비교할 수 없습니다.');
  }
  function fillTarget(init = false) {
    const p = getProject();
    const f = form();
    if (init) {
      f.target.value = p.metadata.sample ? 'before' : p.settings.scenario;
      f.mode.value = p.metadata.sample ? 'new' : 'merge';
      f.keep.value = 'keep';
      $('[data-targetconfirm]').checked = false;
      state.missingDelete.clear();
      state.failed = false;
      state.applyError = '';
      if (!f.date.value) f.date.value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    }
    targetNotice(p, f.target.value);
    const k = f.target.value, w = p.scenarios[k].warehouse, l = p.scenarioMeta[k].locationLayout;
    f.width.value = w.width;
    f.depth.value = w.height;
    for (const key of ['originX', 'originY', 'columnDirection', 'firstRackPosition', 'columnGap', 'rackGap', 'northRotation', 'rotation', 'wallGap', 'aisleTarget']) f[key].value = l[key];
    state.perColumnSettings = structuredClone(l.perColumnSettings || {});
    renderColumns();
  }
  /** 기준본 EX.renderColumns: 열별 시작 좌표·첫 랙·회전(빈 항목은 일괄 설정). */
  function renderColumns() {
    const fl = form().floor.value;
    const cols = [...new Set((state.analysis?.racks || []).filter((r) => r.floor === fl).map((r) => r.column))].sort((a, b) => String(a).localeCompare(String(b), 'en', { numeric: true }));
    $('#exColumns').innerHTML = cols.map((col) => {
      const c = state.perColumnSettings[col] || {};
      return `<tr data-column="${esc(col)}"><td>${esc(col)}</td><td><input data-colfield="x" type="number" step=".01" placeholder="자동" value="${c.x ?? ''}"></td><td><input data-colfield="y" type="number" step=".01" placeholder="자동" value="${c.y ?? ''}"></td><td><select data-colfield="first"><option value="">일괄</option><option value="north" ${c.first === 'north' ? 'selected' : ''}>북쪽</option><option value="south" ${c.first === 'south' ? 'selected' : ''}>남쪽</option></select></td><td><input data-colfield="rotation" type="number" step="1" placeholder="일괄" value="${c.rotation ?? ''}"></td></tr>`;
    }).join('');
    syncDirectionLabels();
  }
  function preview() {
    state.proposal = null;
    state.applyError = '';
    state.note = '';
    state.previewError = '';
    const f = form(), a = state.analysis;
    const svg = $('[data-preview]');
    try {
      if (!a) throw new Error('파일과 시트를 선택하세요.');
      if (a.issues.some((i) => i.type === 'conflict')) throw new Error('치수 충돌을 먼저 해결하세요.');
      if (a.issues.some((i) => i.type === 'error') && !f.skip.checked) throw new Error('오류 행을 수정하거나 제외 허용을 직접 선택하세요.');
      if (!a.racks.length) throw new Error('유효한 랙이 없습니다.');
      const raw = Object.fromEntries([...new FormData(f).entries()]);
      for (const k of ['keepManual', 'preserveStructures', 'empty', 'allowRotation', 'allowWrap', 'allowWarnings', 'recordLayout']) raw[k] = f[k].checked;
      raw.perColumnSettings = state.perColumnSettings;
      const c = readExcelConfig(raw);
      const p = getProject();
      const res = buildCandidates(p, a, c, { nextId, filename: state.filename, sheet: state.sheetName, missingDelete: state.missingDelete });
      Object.assign(state, { fixedPlan: res.fixed ?? null, candidates: res.candidates, choice: res.choice, base: res.proposal, reference: res.reference, run: res.run, pages: { list: 0, groups: 0 }, cfg: c, analysisUsed: a, chosen: new Set(), previous: undefined, proposalProject: p });
      syncDirectionLabels();
      $('[data-previous]').disabled = true;
      $('[data-note]').textContent = '';
      $('[data-detail]').hidden = true;
      showChoice();
    } catch (err) {
      state.candidates = null;
      state.fixedPlan = null;
      syncDirectionLabels();
      $('[data-fixedplan]').textContent = '';
      state.previewError = err.message;
      $('[data-pstats]').textContent = err.message;
      $('#rMissingList').innerHTML = '';
      $('[data-changes]').textContent = '';
      $('[data-spatial]').innerHTML = '';
      $('[data-comparison]').innerHTML = '';
      $('[data-list]').innerHTML = '';
      $('[data-detail]').hidden = true;
      svg.innerHTML = '';
    }
    readiness();
  }
  const viewBox = (l, c) => {
    const bs = l.objects.map(bounds);
    const x0 = Math.min(-1.2, ...bs.map((b) => b.minX - 1)), y0 = Math.min(-1.2, ...bs.map((b) => b.minY - 1));
    const x1 = Math.max(c.width + 1.2, ...bs.map((b) => b.maxX + 1)), y1 = Math.max(c.depth + 1.2, ...bs.map((b) => b.maxY + 1));
    return `${x0} ${y0} ${x1 - x0} ${y1 - y0}`;
  };
  /** 선택된 후보를 다시 그린다(후보는 다시 만들지 않는다). 후보·설정이 바뀌면 경고 확인을 해제한다. */
  function showChoice() {
    const { cfg: c, analysisUsed: a, base, candidates, choice } = state, p = state.proposalProject;
    const cand = candidates[choice];
    const pr = { ...base, layout: cand.layout };
    const ws = spatialWarnings(pr.layout, p);
    pr.warnings = ws;
    state.proposal = pr;
    $('[data-fixedplan]').textContent = state.fixedPlan ? fixedText(state.fixedPlan).join('\n') : '';
    const key = JSON.stringify([c, cand.name, ws.map((w) => w.text)]);
    if (state.ackKey !== key) {
      $('[data-ack]').checked = false;
      state.ackKey = key;
    }
    state.blocked = ws.length > 0 || cand.result.rows.some((r) => r.issues.length);
    $('[data-apply]').textContent = c.target.toUpperCase() + (state.blocked ? '에 경고 확인 후 적용' : '에 확인 후 적용');
    $('#rTargetWarning').textContent = c.target === 'before' ? 'BEFORE에만 반영합니다. 원본 잠금 승인은 기존 적용 절차에서 확인하며 AFTER는 유지됩니다.' : 'AFTER에만 반영합니다. BEFORE는 유지됩니다.';
    $('#exPending').textContent = c.autoPlacement.mode === 'column' ? '최종 확인 전 두 배치 변경 없음 · 실패 후보는 경고 확인으로 적용할 수 없음 · 외부 오른쪽만 지원' : '최종 확인 전 BEFORE/AFTER 변경 없음 · 승인한 현재 후보만 적용합니다. 경고 포함 설계안은 실제 설치 승인이 아닙니다.';
    $('#rMissingList').innerHTML = (base.missing ?? []).map((o) => `<label class="check"><input type="checkbox" data-r-delete="${esc(o.id)}" ${state.missingDelete.has(o.id) ? 'checked' : ''} ${c.mode === 'new' ? 'disabled' : ''}>${esc(o.code)} · 누락 후보</label>`).join('');
    const svg = $('[data-preview]');
    svg.setAttribute('viewBox', viewBox(pr.layout, c));
    svg.innerHTML = buildScene(pr.layout, p, { tool: 'none' }).svg;
    const racks = (l) => l.objects.filter((o) => o.kind === 'rack').length;
    const cn = cand.result.counts, col = c.autoPlacement.mode === 'column';
    $('[data-pstats]').textContent = `선택 후보: ${cand.name} · 내부 정상 ${cn.validInside}/${cn.total} · 대기 ${cn.waiting} | 대상 ${c.target.toUpperCase()} · 기존 ${racks(p.scenarios[c.target])}랙 / Excel 고유 ${a.racks.length}랙 / 적용 후 ${racks(pr.layout)}랙 · 일치 ${pr.changes.updated} / 오류 ${a.issues.filter((i) => i.type === 'error').length} / 경고 ${ws.length}`;
    $('[data-changes]').textContent = `${col ? columnSummary(cand.result) : candidateSummary(cand.result)}\n신규 ${pr.changes.added} / 기존 갱신 ${pr.changes.updated} / 규격 후보 ${pr.changes.dimensions} / 누락 ${pr.changes.missing} / 제거 승인 후보 ${pr.changes.deleted}랙 + 구조물 ${pr.changes.structuresDeleted || 0} / 업데이트 모드 신규 제외 ${pr.changes.skippedNew} · 자재 추가 ${pr.changes.itemsAdded} / 제거 ${pr.changes.itemsRemoved} / 값 변경 ${pr.changes.itemsChanged}`;
    $('[data-spatial]').innerHTML = ws.map((w) => `<div class="issue-warning">${esc(w.text)}</div>`).join('') || '<p class="info">설정 기준 공간 경고 없음</p>';
    $('[data-comparison]').innerHTML = col ? columnComparison() : `<table class="excel-table"><thead><tr>${COMPARE_HEAD.map((t) => `<th>${t}</th>`).join('')}</tr></thead><tbody>${candidates.map((v, i) => {
      const s = v.result.counts;
      return `<tr><td><label><input type="radio" name="excelCandidate" data-cand="${i}" ${i === choice ? 'checked' : ''}>${esc(v.name)}</label></td><td>${s.inside} / ${s.validInside}</td><td>${s.boundary} / ${s.waiting}</td><td>${s.rackCollision} / ${s.structureCollision}</td><td>${s.aisle} / ${s.gap}</td><td>${v.manualMoved} / ${v.moved}</td><td>${v.orderLoss}</td><td>${fmt(v.result.footprint, 3)} / ${fmt(v.result.warehouseArea, 3)}㎡</td></tr>`;
    }).join('')}</tbody></table>`;
    const page = (state.pages.list = Math.min(state.pages.list, Math.max(0, Math.ceil(cand.result.rows.length / PAGE) - 1)));
    const shown = col ? cand.result.rows.slice(page * PAGE, page * PAGE + PAGE).map((r) => ({ ...r, issues: r.issues.slice(0, 8).map((i) => ({ ...i, targets: i.targets.slice(0, 8) })) })) : cand.result.rows;
    $('[data-list]').innerHTML = `<table class="excel-table"><thead><tr><th>랙 / 선택</th><th>위반 유형·방향·초과 거리</th><th>충돌 대상</th><th>상태</th></tr></thead><tbody>${shown.map((r) => `<tr tabindex="0" data-rack="${esc(r.id)}"><td><input aria-label="${esc(r.code)} 재최적화 선택" type="checkbox" data-select="${esc(r.id)}" ${state.chosen.has(r.id) ? 'checked' : ''}><button type="button" data-focus="${esc(r.id)}">${esc(r.code)}</button></td><td>${esc(r.issues.map((i) => `${ISSUE_NAMES[i.type]} · ${i.text}`).join(' / ') || '위반 없음')}<br>${esc(excessText(r.excess))}</td><td>${esc([...new Set(r.issues.flatMap((i) => i.targets.map((t) => `${t.code} (${t.id})`)))].join(', ') || '—')}</td><td>${r.issues.length ? (getProject().autoPlacement.reviewNotes?.[getProject().settings.scenario]?.[r.id] === 'review' ? '검토 중' : '미해결') : '해결'}</td></tr>`).join('')}</tbody></table>${col ? pager('list', page, cand.result.rows.length) : ''}`;
    $('[data-detail]').hidden = true;
    renderColumnResults(cand, col);
  }
  const columnSummary = (r) => `전체 ${r.counts.total}랙 · 내부 ${r.counts.inside} / 조건 충족 ${r.counts.validInside} · 외부 대기 ${r.counts.waiting} · 유효 수용률 ${fmt(r.column.acceptance, 1)}% · 미수용 열 ${r.column.unacceptedGroups} · 충돌 ${r.counts.rackCollision + r.counts.structureCollision} / 통로 ${r.counts.aisle} / 간격 ${r.counts.gap} / 열 조건 ${r.counts.columnViolation}`;
  function columnComparison() {
    const row = (v, i, reference = false) => {
      if (!v.result) return `<tr><td colspan="8">${esc(v.name)}</td></tr>`;
      const s = v.result.counts, status = v.result.column ? s.columnViolation : '열 조건 미검증';
      return `<tr><td>${reference ? '비교 전용' : `<label><input type="radio" name="excelCandidate" data-cand="${i}" ${i === state.choice ? 'checked' : ''} aria-label="${esc(v.name)} 선택"></label>`} ${esc(v.name)} ${reference ? '' : columnSafe(v) ? '검증 통과' : '적용 불가'}</td><td>${s.validInside} / ${s.inside}</td><td>${s.waiting}</td><td>${status}${reference ? `<br><small>번호 순서 위반 ${v.orderLoss}</small>` : ''}</td><td>${v.manualMoved}</td><td>${s.rackCollision + s.structureCollision + s.aisle + s.gap}</td><td>${fmt(v.columnElapsedMs ?? 0, 1)}ms</td><td>${v.moved}</td></tr>`;
    };
    return `<table class="excel-table"><thead><tr>${COLUMN_HEAD.map((t) => `<th>${t}</th>`).join('')}</tr></thead><tbody>${state.reference ? row(state.reference, -1, true) : ''}${state.candidates.map((v, i) => row(v, i)).join('')}</tbody></table><p class="muted">비교 전용 기존 배치는 새 엄격 모드의 적용 후보가 아닙니다. 기존 방식 적용은 위 전환 버튼으로 명시적으로 선택하세요.</p>`;
  }
  function renderColumnResults(cand, col) {
    const box = $('[data-colresults]');
    for (const el of dialog.querySelectorAll('[data-colonly]')) el.hidden = !(form().autoMode.value === 'column');
    for (const el of dialog.querySelectorAll('[data-fixedonly]')) el.hidden = form().autoMode.value !== 'fixed';
    box.hidden = !col;
    if (!col) return;
    const r = cand.result, c = r.column, groups = c.groups, run = state.run, l = cand.layout, w = l.warehouse;
    const page = (state.pages.groups = Math.min(state.pages.groups, Math.max(0, Math.ceil(groups.length / PAGE) - 1)));
    const ex = l.objects.filter((o) => ['wall', 'column', 'blocked', 'door'].includes(o.kind)), ai = l.objects.filter((o) => o.kind === 'aisle');
    const excluded = ex.length <= 128 ? unionArea(ex, w.width, w.height) : null, aisles = ai.length <= 128 ? unionArea(ai, w.width, w.height) : null;
    const stop = run?.stopReason ? stopText(run.stopReason) : '유한 후보 탐색 완료 · 전역 최적 증명 아님';
    box.innerHTML = `<strong>${esc(columnSummary(r))}</strong><p>${esc(c.fatal.length ? '배치 실패 · ' + c.fatal.slice(0, 8).join(' / ') : c.failures.length ? '공간·열 조건 실패 · 적용 불가: ' + c.failures.slice(0, 8).map((v) => v.text).join(' / ') : '현재 후보의 공간·열 조건 검증 통과 · 외부 대기 경고는 별도 확인 필요')}</p><div class="excel-scroll"><table class="excel-table"><thead><tr><th>건물 / 층 / 열</th><th>전체</th><th>내부</th><th>외부</th><th>보호</th></tr></thead><tbody>${groups.slice(page * PAGE, page * PAGE + PAGE).map((g) => `<tr><td>${esc(g.label)}</td><td>${g.total}</td><td>${g.inside}</td><td>${g.outside}</td><td>${g.protected}</td></tr>`).join('')}<tr><th>합계</th><td>${r.counts.total}</td><td>${r.counts.inside}</td><td>${r.counts.waiting}</td><td>${r.rows.filter((v) => v.protected).length}</td></tr></tbody></table></div>${pager('groups', page, groups.length)}<p>전체 랙 바닥면적 ${fmt(r.footprint, 3)}㎡ / 창고 ${fmt(r.warehouseArea, 3)}㎡ / 제외 구역 ${excluded === null ? '미측정 (128개 초과)' : fmt(excluded, 3) + '㎡'} / 보호 통로 ${aisles === null ? '미측정 (128개 초과)' : fmt(aisles, 3) + '㎡'} / 내부 랙 바닥면적 합 ${fmt(c.insideFootprint, 3)}㎡ / 외부 랙 바닥면적 합 ${fmt(c.outsideFootprint, 3)}㎡. 외부 면적 합은 추가 필요 창고 면적이 아닙니다.</p>${run ? `<p>탐색 계측: 후보 ${run.candidates} / 시작 위치 ${run.starts} / 탐색 probe ${run.probes} / 계산 ${fmt(run.searchMs ?? 0, 1)}ms (참고용) / ${esc(stop)}</p>` : ''}<p>후보 위치·진행 시작점을 변경해 비교할 수 있습니다. 줄바꿈/회전은 직접 허용해야 합니다. 계산하지 않은 추가 수용량은 표시하지 않습니다.</p>`;
  }
  const columnFailure = () => {
    const c = state.candidates?.[state.choice]?.result.column;
    return state.cfg?.autoPlacement.mode === 'column' && c ? (c.fatal[0] ?? c.failures[0]?.text ?? '') : '';
  };
  /** D-043: 행 배치(열 고정)에서는 방향 이름을 행 기준으로 표시. 값·로직은 그대로, 문구만 바꾼다. */
  function syncDirectionLabels() {
    const f = form(), ax = f.fixedAxis?.value;
    const row = f.autoMode.value === 'fixed' && (ax === 'row' || (ax === 'auto' && state.fixedPlan?.chosen?.axis === 'row'));
    const set = (sel, cap, texts) => {
      if (!sel) return;
      const t = sel.closest('label')?.firstChild;
      if (cap && t?.nodeType === 3) { t.__o ??= t.textContent; t.textContent = row ? cap : t.__o; }
      for (const o of sel.options) if (texts[o.value]) { o.__o ??= o.textContent; o.textContent = row ? texts[o.value] : o.__o; }
    };
    set(f.columnDirection, '행 진행 방향', { east: 'A → N / 북→남 방향', west: 'A → N / 남→북 방향' });
    set(f.firstRackPosition, '첫 랙 위치 / 번호 증가(행)', { north: '서쪽 끝 시작 → 동쪽 증가', south: '동쪽 끝 시작 → 서쪽 증가' });
    for (const sel of dialog.querySelectorAll('select[data-colfield=first]')) set(sel, '', { north: '서쪽 끝', south: '동쪽 끝' });
  }
  function syncMode() {
    const f = form(), on = f.autoMode.value === 'column';
    for (const el of dialog.querySelectorAll('[data-colonly]')) el.hidden = !on;
    const fx = f.autoMode.value === 'fixed';
    for (const el of dialog.querySelectorAll('[data-fixedonly]')) el.hidden = !fx;
    if (f.fixedAxis) f.fixedPerLine.disabled = f.fixedPairing.disabled = f.fixedAxis.value === 'auto';
    for (const el of dialog.querySelectorAll('[data-optimize],[data-reaccept],[data-scope]')) { el.disabled = fx; if (el.tagName === 'BUTTON') el.title = fx ? '로케이션 열 고정은 재최적화하지 않습니다(순서 유지).' : ''; }
    f.preserveStructures.disabled = on;
    if (on) f.preserveStructures.checked = true;
    syncDirectionLabels();
  }
  function focusRack(id) {
    const cand = state.candidates[state.choice], o = cand.layout.objects.find((x) => x.id === id), r = cand.result.rows.find((x) => x.id === id);
    if (!o) return;
    const b = bounds(o);
    $('[data-preview]').setAttribute('viewBox', `${b.minX - 1} ${b.minY - 1} ${b.maxX - b.minX + 2} ${b.maxY - b.minY + 2}`);
    const d = $('[data-detail]');
    d.hidden = false;
    d.style.whiteSpace = 'pre-line';
    d.textContent = `미리보기 선택 · ${o.code}\nX ${fmt(o.x, 3)}m / Y ${fmt(o.y, 3)}m · 폭 ${fmt(o.width, 3)} × 깊이 ${fmt(o.depth, 3)}m · ${fmt(o.rotation)}°\n${excessText(r.excess)}\n${r.issues.map((i) => i.text).join('\n') || '위반 없음'}\n프로젝트는 최종 적용 전 변경되지 않습니다.`;
  }
  /** 기준본 W.readiness: 적용 가능 여부와 안내 문구(대상 확인 → 경고 허용 → 현재 경고 확인 순). */
  function gate() {
    const pr = state.proposal, fail = columnFailure(), target = form().target.value.toUpperCase();
    const confirmed = $('[data-targetconfirm]').checked, allow = form().allowWarnings.checked, ack = $('[data-ack]').checked, blocked = !!pr && state.blocked;
    let message = '미리보기 갱신 완료 — 적용 대상을 확인해 주세요.', ok = false;
    if (state.applyError) message = state.applyError;
    else if (!state.analysis) message = 'Excel 파일과 시트를 분석해 주세요.';
    else if (!pr) message = state.previewError;
    else if (fail) message = '안전·열 조건 실패 · 경고 확인으로 승인할 수 없습니다: ' + fail;
    else if (!confirmed) message = 'BEFORE/AFTER 적용 대상을 확인해 주세요.';
    else if (blocked && !allow) message = '경고가 있는 배치를 적용하려면 경고 후 적용 허용을 확인해 주세요.';
    else if (blocked && !ack) message = '현재 배치의 경고 확인을 체크해 주세요.';
    else { ok = true; message = state.note || target + ' 적용 준비 완료 — 확인한 후보를 저장합니다.'; }
    const checks = [['적용 대상 ' + target, confirmed ? '확인 완료' : '확인 필요'], ['현재 미리보기', pr ? '갱신 완료' : '갱신 필요'], ['현재 후보 경고', !pr ? '계산 전' : !blocked ? '추가 확인 불필요' : !allow ? '경고 후 적용 허용 필요' : ack ? '확인 완료' : '현재 경고 확인 필요']];
    return { ok, message, checks, fail };
  }
  function readiness() {
    const g = gate();
    $('[data-apply]').disabled = !g.ok;
    const box = $('[data-applymsg]');
    box.dataset.state = g.ok ? 'READY_TO_APPLY' : 'BLOCKED';
    box.innerHTML = `<strong>적용 준비 상태 · ${esc(g.message)}</strong><ul>${g.checks.map(([k, v]) => `<li>${esc(k)}: ${esc(v)}</li>`).join('')}</ul>`;
    $('#rImportBackup').hidden = !state.failed;
  }
  /** 기준본 EX.apply: 잠금·최종 확인 → 원자적 적용. 미리보기 이후 프로젝트가 바뀌었으면 다시 확인하게 한다. */
  async function apply() {
    const pr = state.proposal;
    if (!pr || !gate().ok) return;
    if (state.proposalProject !== getProject()) {
      preview();
      state.applyError = '확인한 후보가 변경되었습니다. 미리보기와 경고를 다시 확인해 주세요.';
      readiness();
      return;
    }
    const stop = (m) => { state.note = m; readiness(); };
    const c = pr.config, p = getProject();
    if (c.autoPlacement.mode === 'column') {
      const fresh = scanLayout(pr.layout, p).column;
      if (!fresh || fresh.fatal.length || fresh.failures.length) {
        stop('공간·열 조건 또는 외부 좌표 안전 검증 실패 · 적용할 수 없습니다.');
        return;
      }
    }
    if (c.target === 'before' && p.scenarioMeta.before.locked && !confirm('BEFORE 원본 잠금이 활성화되어 있습니다. 이번 Excel 갱신을 허용합니까? 잠금은 갱신 후에도 유지됩니다.')) {
      stop('BEFORE 잠금 승인을 취소했습니다. 기존 배치는 유지됩니다.');
      return;
    }
    if (!confirm(`${c.target.toUpperCase()} · ${c.mode} · 신규 ${pr.changes.added} / 갱신 ${pr.changes.updated} / 제거 ${pr.changes.deleted}랙·구조물 ${pr.changes.structuresDeleted || 0}\n선택한 배치만 변경하고 자동 백업합니다. 다른 편집안은 유지됩니다.\n브라우저 저장소의 실제 남은 용량은 알 수 없습니다. 적용 전 JSON 백업을 권장하며 저장 성공을 보장하지 않습니다. 적용할까요?`)) {
      stop('최종 적용 확인을 취소했습니다. 기존 배치는 유지됩니다.');
      return;
    }
    const r = await applyProposal(pr, { filename: state.filename, sheet: state.sheetName, analysis: structuredClone(state.analysis), acknowledged: $('[data-ack]').checked, candidate: state.candidates[state.choice].name });
    if (r?.ok) {
      state.applyError = '';
      state.failed = false;
      dialog.close();
      toast(c.target.toUpperCase() + ' 가져오기 완료 · 다른 편집안은 유지됩니다.');
    } else {
      state.failed = true;
      state.applyError = ('ROLLED_BACK · 전체 취소: ' + (r?.reason ?? '알 수 없는 오류') + ' · 기존 배치는 그대로입니다.');
      readiness();
      toast(state.applyError);
    }
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
    renderColumns();
    preview();
    $('[data-dims]').innerHTML = a.dimensionConflicts.map((c) => `<label class="excel-dim">${esc(c.key)} 치수 선택<select data-dim="${esc(c.key)}"><option value="">사용할 규격을 선택하세요.</option>${c.options.map((v, n) => `<option value="${n}" ${JSON.stringify(state.resolutions[c.key]) === JSON.stringify(v) ? 'selected' : ''}>${v.join(' × ')} mm</option>`).join('')}</select></label>`).join('');
  }

  $('[data-close]').addEventListener('click', () => dialog.close());
  const touch = () => { state.applyError = ''; state.note = ''; readiness(); };
  $('[data-ack]').addEventListener('change', touch);
  $('[data-targetconfirm]').addEventListener('change', touch);
  form().addEventListener('submit', (e) => e.preventDefault());
  $('[data-analyze]').addEventListener('click', () => { if (state.book) analyze(); });
  $('[data-issuescsv]').addEventListener('click', () => download('excel_import_validation.csv', csvEncode([['구분', '원본 행', '내용'], ...(state.analysis?.issues || []).map((i) => [i.type, i.row ?? '', i.text])]), 'text/csv;charset=utf-8'));
  $('#rImportBackup').addEventListener('click', () => exportRecovery());
  $('#vExcelStorageOpen').addEventListener('click', () => openStorage());
  $('#exRefresh').addEventListener('click', () => preview());
  $('#wPreviewAll').addEventListener('click', () => { if (state.proposal) $('[data-preview]').setAttribute('viewBox', viewBox(state.proposal.layout, state.cfg)); });
  $('#wPreviewViolations').addEventListener('click', () => {
    $('[data-list]').scrollIntoView({ block: 'nearest' });
    const r = state.candidates?.[state.choice]?.result.rows.find((x) => x.issues.length);
    if (r) focusRack(r.id);
  });
  $('#exPick').addEventListener('click', () => {
    dialog.close();
    pickPoint((p) => {
      form().originX.value = Number(p.x.toFixed(3));
      form().originY.value = Number(p.y.toFixed(3));
      dialog.showModal();
      preview();
    });
  });
  $('#rMissingList').addEventListener('change', (e) => {
    const el = e.target.closest('[data-r-delete]');
    if (!el) return;
    el.checked ? state.missingDelete.add(el.dataset.rDelete) : state.missingDelete.delete(el.dataset.rDelete);
    preview();
  });
  $('#exColumns').addEventListener('change', (e) => {
    const el = e.target.closest('[data-colfield]');
    if (!el) return;
    const col = el.closest('[data-column]').dataset.column, k = el.dataset.colfield;
    (state.perColumnSettings[col] ??= {});
    if (el.value === '') delete state.perColumnSettings[col][k];
    else state.perColumnSettings[col][k] = k === 'first' ? el.value : Number(el.value);
    preview();
  });
  $('[data-apply]').addEventListener('click', apply);
  const cands = $('[data-comparison]'), list = $('[data-list]');
  cands.addEventListener('change', (e) => {
    const el = e.target.closest('[data-cand]');
    if (!el || !state.candidates) return;
    state.choice = Number(el.dataset.cand);
    showChoice();
    readiness();
  });
  list.addEventListener('change', (e) => {
    const el = e.target.closest('[data-select]');
    if (el) el.checked ? state.chosen.add(el.dataset.select) : state.chosen.delete(el.dataset.select);
  });
  list.addEventListener('click', (e) => {
    const el = e.target.closest('[data-focus]') || (e.target.closest('input') ? null : e.target.closest('tr[data-rack]'));
    if (el) focusRack(el.dataset.focus ?? el.dataset.rack);
  });
  list.addEventListener('keydown', (e) => {
    const tr = e.target.closest('tr[data-rack]');
    if (e.key === 'Enter' && tr && e.target === tr) { e.preventDefault(); focusRack(tr.dataset.rack); }
  });
  function optimize(scope) {
    if (!state.candidates) return;
    try {
      const prior = state.candidates[state.choice], column = state.cfg.autoPlacement.mode === 'column';
      const { candidate, note, run } = column
        ? columnReoptimize(prior, state.cfg, scope, { project: state.proposalProject, chosen: state.chosen, generated: state.base.generated })
        : reoptimize(prior, state.cfg, scope, { project: state.proposalProject, chosen: state.chosen });
      if (column) state.run = run;
      state.previous = state.choice;
      if (column && state.candidates.length >= COLUMN_LIMITS.maxCandidates) {
        state.candidates = [prior, candidate];
        state.previous = 0;
        state.choice = 1;
      } else {
        state.candidates.push(candidate);
        state.choice = state.candidates.length - 1;
      }
      $('[data-previous]').disabled = false;
      showChoice();
      $('[data-note]').textContent = note;
      readiness();
    } catch (err) {
      toast(err.message);
    }
  }
  $('[data-optimize]').addEventListener('click', () => optimize($('[data-scope]').value));
  $('[data-reaccept]').addEventListener('click', () => optimize('waiting'));
  $('[data-legacy]').addEventListener('click', () => { form().autoMode.value = 'inside'; syncMode(); preview(); });
  $('[data-insidefit]').addEventListener('click', () => {
    const w = state.candidates?.[state.choice]?.layout.warehouse;
    if (w) $('[data-preview]').setAttribute('viewBox', `-1.2 -1.2 ${w.width + 2.4} ${w.height + 2.4}`);
  });
  dialog.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cl-page]');
    if (!b || !state.candidates) return;
    state.pages[b.dataset.clPage] = Number(b.dataset.clNext);
    showChoice();
    readiness();
  });
  $('[data-previous]').addEventListener('click', () => {
    if (state.previous === undefined) return;
    state.choice = state.previous;
    showChoice();
    $('[data-note]').textContent = '이전 후보로 돌아왔습니다.';
    readiness();
  });
  form().addEventListener('change', (e) => {
    const f = form(), n = e.target.name;
    if (!n || n === 'excelCandidate') return; // 파일·시트·머리글·매핑·후보·확인 칸은 각자의 처리기가 있다
    if (n === 'target') {
      $('[data-targetconfirm]').checked = false;
      state.missingDelete.clear();
      fillTarget();
    }
    if (n === 'mode') {
      f.keep.value ||= 'keep';
      state.missingDelete.clear();
    }
    if (n === 'floor') renderColumns();
    // 기준본 90: 수동 위치 유지 ↔ 기존 객체 위치 연동
    if (n === 'keepManual' && !e.target.checked) f.keep.value = 'reflow';
    if (n === 'keep' && e.target.value === 'keep') f.keepManual.checked = true;
    if (n === 'autoMode' && e.target.value === 'column') {
      f.keepManual.checked = true;
      f.allowRotation.checked = false;
      f.allowWrap.checked = false;
      f.keep.value = 'reflow';
    }
    syncMode();
    preview();
  });
  $('[data-file]').addEventListener('change', (e) => { if (e.target.files?.[0]) readFile(e.target.files[0]); });
  async function readFile(f) {
    try {
      state.book = null;
      state.resolutions = {};
      $('[data-targetconfirm]').checked = false;
      state.missingDelete.clear();
      state.failed = false;
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
  }
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
    /** 기준본 exFile(왼쪽 'Excel·로케이션 CSV 불러오기'): 파일을 읽고 대화상자를 연다. */
    openWithFile(f) {
      this.open();
      readFile(f);
    },
    open() {
      fillTarget(true);
      syncMode();
      if (!dialog.open) dialog.showModal();
      preview();
    },
    /** 저장소 상태·위험 문구(기준본 vExcelStorageStatus·vExcelStorageRisk). */
    setStorage(status, risk) {
      $('#vExcelStorageStatus').textContent = status;
      $('#vExcelStorageRisk').textContent = risk;
    },
    get state() { return state; },
  };
}
