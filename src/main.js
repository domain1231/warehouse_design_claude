// 앱 진입점. 저장소·프로젝트 모델·편집 세션(Phase 1), SVG 도면 보기·선택(Phase 3a), 객체 편집(Phase 3b)을 화면에 연결한다.
// 계산은 src/cad/*(카메라·선택·도면 문자열)에 있고, 이 파일은 DOM 이벤트를 그 함수들에 연결만 한다.
// __APP_VERSION__ / __SCHEMA_VERSION__ 은 빌드 시 package.json에서 주입된다.
import { createIdGenerator } from './core/ids.js';
import { createBackupRing } from './persistence/backups.js';
import { createSession, projectValidator } from './core/session.js';
import { createProjectStore } from './persistence/storage.js';
import { formatNumber as fmt } from './core/format.js';
import { viewBox, zoomBy, panFrom, pinchFrom, centerView, focusBox, withFitScale, wheelPixels, wheelFactor, createWheelTracker } from './cad/camera.js';
import { buildScene, selectionBox, esc, OBJECT_COLORS } from './cad/scene.js';
import { rackLabelParts, labelStatusText } from './cad/labels.js';
import { clickSelect, marqueeSelect, restoreSelection } from './cad/selection.js';
import { loadWheelMode, saveWheelMode, WHEEL_LABELS, WHEEL_STATUS_TEXT } from './cad/wheel-settings.js';
import { pixelsPerMeter } from './cad/camera.js';
import { applyCommand, applyMove, addObjectAt, deleteObjects, duplicateObjects, rotateObjects, nudgeObjects, fieldValue, setField, setDimension, DIMENSION_COMMAND, MM_INPUT_FIELDS, MM_INPUT_MESSAGE, isMmInput, setPositionLock, COMMAND_DEFAULT, selectAllRacks, dragDelta, alignmentGuides, movedLayout, isLocked, RACK_DEFAULTS } from './warehouse/commands.js';
import { setObjectColor, setColorMode, applyThresholdColors, resetColors } from './warehouse/appearance.js';
import { renderInspector } from './ui/inspector.js';
import { createRoomPanel } from './ui/room-panel.js';
import { applyRoom } from './warehouse/room.js';
import { createGroupDialog } from './ui/group-dialog.js';
import { createPanels } from './ui/panels.js';
import { createRackDetail } from './ui/rack-detail.js';
import { createRecordsPanel } from './ui/records-panel.js';
import { createExcelDialog } from './ui/excel-dialog.js';
import { createScenarioDialogs } from './ui/scenario-dialogs.js';
import { createThemeDialog, applyTheme } from './ui/theme-dialog.js';
import { createStorageDialogs, QUOTA_TEXT } from './ui/storage-dialogs.js';
import { compareRows, cloneBeforeToAfter, restoreBackup, CLONE_COMMAND, RESTORE_COMMAND } from './warehouse/scenarios.js';
import { applyExcelProposal, EXCEL_APPLY_COMMAND } from './excel/apply.js';
import { confirmPhysical, PHYSICAL_COMMAND } from './warehouse/rackinfo.js';
import { saveSnapshot, restoreSnapshot, historyLayout, historyDates, historyStatusText, SAVE_SNAPSHOT_COMMAND, RESTORE_SNAPSHOT_COMMAND } from './warehouse/records.js';
import { resized, applyResize, RESIZE_COMMAND, HANDLE_DIRECTIONS, newSpatialWarnings } from './warehouse/commands.js';
import { OBJECT_TYPES } from './core/project.js';
import { scanLayout } from './warehouse/constraints.js';
import { candidateSummary } from './autolayout/candidates.js';
import { rackCsvRows, historyCsvRows, templateCsvRows, reportSvg } from './exports/report.js';
import { csvEncode } from './warehouse/rackinfo.js';
import { GEOMETRY_EPS_M as EPS, SNAP_STEPS_M } from './geometry/tolerance.js';

export const APP_VERSION = __APP_VERSION__;
export const SCHEMA_VERSION = __SCHEMA_VERSION__;

const STATUS_TEXT = {
  loading: '불러오는 중',
  saved: '● 모든 변경사항 저장됨 · SAVED',
  unsaved: '○ 저장되지 않은 변경사항 · UNSAVED',
  saving: '◌ 저장 중',
  error: '! 저장 실패',
};
const ERROR_HINT = {
  QUOTA: QUOTA_TEXT,
  CONFLICT: '다른 탭 또는 창에서 먼저 저장했습니다. 덮어쓰지 않았습니다.',
  CORRUPT: '기존 저장본을 읽을 수 없어 보호 중입니다.',
  VERIFY: '저장 후 읽기 확인에 실패해 저장하지 않았습니다. 기존 저장본은 그대로입니다.',
  VALIDATION: '프로젝트 검증에 실패해 저장하지 않았습니다.',
  STORAGE: '브라우저 저장소를 사용할 수 없습니다.',
};
const TOOL_HELP = {
  select: '클릭 선택 · 드래그 이동 · Shift 추가 · Ctrl/⌘ 토글 · 빈 곳 드래그 영역 선택 · 방향키 미세 이동',
  pan: '드래그하여 화면 이동',
  calibrate: '참고 도면 위의 기준이 되는 두 점을 차례로 클릭하세요.',
};
const ADD_TOOLS = [['rack', '▤ 랙'], ['wall', '━ 내부 벽'], ['column', '▪ 기둥'], ['door', '◴ 출입문'], ['aisle', '▭ 통로'], ['blocked', '▧ 보관 불가'], ['work', '▱ 작업 공간']];
const RACK_TYPES = ['중량랙', '경량랙', '팔레트랙', '일반 선반', '사용자 지정 랙'];

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'testid') node.dataset.testid = v;
    else node.setAttribute(k, v);
  }
  if (text !== undefined) node.textContent = text;
  return node;
}
const button = (testid, text, attrs = {}) => el('button', { type: 'button', testid, ...attrs }, text);

function download(name, data, type = 'application/json') {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// v2.4.1 화면 골격(기준본 렌더링 DOM의 구조·id·문구, D-032·D-033). 기능 연결은 start()가 하고, 이 함수는 요소를 만들어 참조를 돌려준다.
// 기존 E2E 호환을 위해 data-testid를 함께 둔다. 기준본에 없는 재구축 요소는 숨기거나 해당 구역 끝에 둔다(9b-2~7에서 정리).
const SHELL = `<header><div><div class="eyebrow">OPERATIONS / SPACE PLANNING</div><h1>Warehouse Studio <span class="sub">창고 배치 설계</span> <small id="appVersion" data-testid="versions"></small></h1></div><div class="header-actions"><div class="v-save-tools"><button id="vSave" class="primary" type="button" data-testid="save">프로젝트 저장</button><button id="vVersions" type="button" data-testid="versions-open">이전 버전·백업</button><button id="vStorage" type="button" data-testid="storage-open">저장소 관리</button><button id="vOverwrite" type="button" data-testid="overwrite" hidden>이 탭 내용으로 덮어쓰기</button><button id="vReplaceCorrupt" type="button" data-testid="replace-corrupt" hidden>손상 저장본 교체</button></div><span id="saveStatus" class="save" role="status" data-testid="status"></span><button id="undo" type="button" title="Ctrl+Z" data-testid="undo">↶ 취소</button><button id="redo" type="button" title="Ctrl+Y" data-testid="redo">↷ 다시</button><button id="jsonOut" type="button" data-testid="export">JSON 백업</button><label class="filebtn" data-testid="import-json">불러오기<input id="jsonIn" type="file" accept=".json,application/json" hidden data-testid="import-file"></label></div></header>
<div id="vSaveDetail" role="status"><span data-testid="status-detail"></span><span class="notice" data-testid="notice"></span><span>이 PC·브라우저 저장 / HTML 덮어쓰기·클라우드 동기화 아님</span></div>
<div class="banner" id="sampleBanner" data-testid="sample-banner"></div>
<div class="stats"><div class="stat"><small>전체 창고 면적</small><strong id="kArea" data-testid="k-area">—</strong><span>㎡</span></div><div class="stat"><small>현재 랙 수</small><strong id="kRacks" data-testid="k-racks">—</strong><span>개</span></div><div class="stat"><small>랙 면적 점유율</small><strong id="kFootprint" data-testid="k-footprint">—</strong><span>%</span></div><div class="stat"><small>수량 기준 적재율 · 단위별</small><strong id="kLoad" style="font-size:15px" data-testid="k-load">미확인</strong></div><div class="stat"><small>공간 경고</small><strong id="kWarnings" data-testid="k-warnings">—</strong><span>건</span></div></div>
<div id="wTop" class="w-summary"><span data-testid="w-summary"></span><button id="wAll" type="button">모든 랙 보기</button><button id="wViolations" type="button">위반 목록</button><span id="wTopNote"></span></div>
<div id="sWork"><main class="app" id="app"><aside class="sidebar left" aria-label="설계 도구"></aside><section class="workspace"><div class="r-toolbar"><span id="rActive" class="r-state"></span><button id="rBefore" type="button" data-testid="scenario-before">BEFORE 보기</button><button id="rAfter" type="button" data-testid="scenario-after">AFTER 편집</button><button id="rClone" type="button" data-testid="scenario-clone">BEFORE → AFTER 복제</button><button id="rLock" type="button" data-testid="before-lock"></button><span id="rLockState"></span><button id="rHistory" type="button" data-testid="scenario-history">가져오기 이력</button><button id="rBackupDownload" type="button" data-testid="recovery-download" hidden>JSON 백업 다운로드</button></div><div class="v-label-controls"><label>랙 텍스트<select id="vLabelMode" data-testid="label-mode"><option value="rack-code">랙 번호만</option><option value="occupancy">랙 번호 + 실제 적재율</option><option value="detail">상세 정보</option><option value="minimal">최소 표시 · 선택 랙</option></select></label><label>색상 표시<select id="vColorMode" data-testid="color-mode"><option value="data">데이터 기반</option><option value="custom">사용자 지정 색상</option></select></label><button id="vThemeOpen" type="button" data-testid="theme-open">색상 설정·기본색 복원</button><small id="vLabelStatus" class="muted" data-testid="label-status"></small><div class="q-label-options"><label>ZONE·번호 배치<select id="qLabelLayout" data-testid="label-layout"><option value="auto">자동 · 좁으면 두 줄</option><option value="stacked">항상 두 줄</option><option value="inline">한 줄</option><option value="minimal">최소 · 선택 랙</option></select></label><label>랙 번호 형식<select id="qNumberPadding" data-testid="label-padding"><option value="0">5</option><option value="2">05</option><option value="3">005</option></select></label></div></div><div class="toolbar"><div class="m-panel-tools"><button id="mLeftPanel" type="button" data-testid="toggle-left"></button><button id="mRightPanel" type="button" data-testid="toggle-right"></button><button id="mBothClose" type="button">양쪽 접기</button><button id="mBothOpen" type="button">양쪽 펼치기</button></div><button id="sBottomToggle" type="button" data-testid="bottom-toggle"></button><button id="bDefaultLayout" type="button" data-testid="bottom-default">기본 레이아웃 복원</button><label class="inline">편집 배치</label><select id="scenario" style="width:145px" data-testid="scenario-select"><option value="before">Before · 현재안</option><option value="after">After · 개선안</option></select><button id="compareBtn" type="button" data-testid="scenario-compare">비교</button><button id="seedAfter" type="button" title="미리보기와 백업 후 독립 복제">BEFORE → AFTER 복제</button><span class="spacer"></span><button id="zoomOut" type="button" aria-label="축소" data-testid="zoom-out">−</button><button id="zoomIn" type="button" aria-label="확대" data-testid="zoom-in">＋</button><button id="fit" type="button" data-testid="fit">전체 보기</button><button id="focusSelection" type="button" data-testid="focus-selection">선택 확대</button><small id="zoomLabel" data-testid="zoom-label">100%</small></div><div class="canvas-wrap" id="canvasWrap" data-testid="canvas-wrap"><svg id="plan" role="img" aria-label="창고 평면도. 도구 선택 후 클릭하여 배치합니다." data-testid="plan"></svg><div class="canvas-hint" id="canvasHint" data-testid="canvas-hint">원점: 좌상단 · X → / Y ↓ · 단위 m</div></div><div class="legend" id="legend" data-testid="legend"></div><div class="toolbar"><button id="rotate" type="button" data-testid="rotate">↻ 90°</button><button id="duplicate" type="button" data-testid="duplicate">복제</button><button id="delete" type="button" class="danger" data-testid="delete">삭제</button><span id="selectionStatus" class="muted" data-testid="selection-status"></span><span class="spacer"></span><button id="svgOut" type="button" data-testid="export-svg">SVG</button><button id="pngOut" type="button" data-testid="export-png">PNG</button><button id="printBtn" type="button" data-testid="export-print">인쇄</button></div></section><aside class="sidebar right" aria-label="선택 정보"><h2>선택 객체 <span class="badge" id="selectedCount">0</span></h2><div id="inspector"></div><h3>공간 지표</h3><div id="spaceMetrics" data-testid="space-metrics"></div></aside></main>
<button id="sGrip" type="button" aria-label="하단 패널 높이 조절" role="separator" aria-orientation="horizontal" aria-valuemin="160" aria-valuemax="600" title="위아래로 끌어 공통 높이 조절 · 방향키 20px" tabindex="0" data-testid="bottom-grip"></button><div id="sBottom" data-testid="bottom-panel"><div id="bDatebar"><div class="row b-date-row"><strong>재고·배치 조회</strong><div class="sub" id="historyStatus" data-testid="history-status" role="status"></div><button id="liveBtn" class="primary" type="button" data-testid="history-live">현재 편집으로</button><input id="historyDate" type="date" aria-label="조회 날짜" data-testid="history-date"><select id="historyMode" aria-label="배치 이력 모드" data-testid="history-mode"><option value="recorded">해당 날짜 배치 우선</option><option value="current">현재 배치 + 과거 재고</option></select></div><div class="row b-slider-row"><input id="dateSlider" type="range" min="0" max="0" step="1" value="0" aria-label="저장된 날짜 슬라이더" data-testid="history-slider"><span id="bExports"></span></div></div><div id="bTopRow"></div><div id="bLowerRow"></div></div></div>
<footer>오프라인 전용 · 외부 통신 없음 · 브라우저 로컬 저장 + JSON 백업 권장 · 직사각형 평면 설계 도구이며 하중·법규·피난 동선 검증은 별도로 필요합니다.</footer>
<div id="toast" class="toast" role="alert" data-testid="toast" hidden></div>`;

function renderShell(root) {
  const tpl = document.createElement('template');
  tpl.innerHTML = SHELL;
  root.prepend(tpl.content);
  const $ = (id) => document.getElementById(id);
  const wrap = (text, input) => { const l = el('label', { class: 'field' }, text); l.append(input); return l; };
  const details = (title, open, id) => { const d = el('details', id ? { id } : {}); if (open) d.open = true; d.append(el('summary', {}, title)); return d; };
  $('appVersion').textContent = `v${APP_VERSION}`;
  $('appVersion').title = `앱 v${APP_VERSION} · 프로젝트 스키마 ${SCHEMA_VERSION}`;

  // 왼쪽(기준본 sidebar.left): Excel · 01~05 구역. 구역 안 구성은 9b-2에서 기준본과 같게 맞춘다.
  const left = document.querySelector('.sidebar.left');
  const excelBox = details('Excel / 로케이션 자동 생성', true, 'excelTools');
  const excelBtn = button('excel-open', 'Excel 가져오기');
  excelBox.append(excelBtn);
  const projectBox = details('01 / 프로젝트 · 공간', true);
  const nameLabel = el('label', {}, '프로젝트명');
  const name = el('input', { id: 'projectName', maxlength: '1000', testid: 'name' });
  nameLabel.append(name);
  const roomBody = el('div', { testid: 'room-section' });
  projectBox.append(nameLabel, roomBody);

  const toolBox = details('02 / 배치 도구', true);
  const tools = el('div', { class: 'tool-group tools', id: 'toolButtons', role: 'group', 'aria-label': '도구' });
  const toolSelect = button('tool-select', '선택', { 'data-tool': 'select' });
  const toolPan = button('tool-pan', '화면 이동', { 'data-tool': 'pan' });
  const toolButtons = [toolSelect, toolPan];
  tools.append(toolSelect, toolPan);
  for (const [kind, text] of ADD_TOOLS) {
    const b = button(`tool-${kind}`, text, { 'data-tool': kind });
    toolButtons.push(b);
    tools.append(b);
  }
  const toolHelp = el('p', { class: 'muted', testid: 'tool-help' });
  const rackBox = el('details', { class: 'box' });
  rackBox.append(el('summary', {}, '추가할 랙'));
  const rackType = el('select', { testid: 'new-rack-type' });
  for (const t of RACK_TYPES) rackType.append(el('option', { value: t }, t));
  const num = (testid, value, min = '0.05') => el('input', { type: 'number', min, step: '0.1', value, testid });
  const newWidth = num('new-width', String(RACK_DEFAULTS.width)), newDepth = num('new-depth', String(RACK_DEFAULTS.depth)), newHeight = num('new-height', String(RACK_DEFAULTS.height));
  const newUnit = el('input', { value: RACK_DEFAULTS.unit, maxlength: '20', testid: 'new-unit' });
  rackBox.append(wrap('종류', rackType), wrap('폭 (m)', newWidth), wrap('깊이 (m)', newDepth), wrap('높이 (m)', newHeight), wrap('단위', newUnit));
  toolBox.append(tools, toolHelp, rackBox);

  const precisionBox = details('03 / 정밀 배치', true);
  const groupRow = el('div', { class: 'tool-group', role: 'group', 'aria-label': '여러 랙 정렬' });
  const alignXBtn = button('align-x', '좌측 정렬'), alignYBtn = button('align-y', '상단 정렬'), distributeBtn = button('distribute', '가로 배치');
  const distributeGap = el('input', { type: 'number', min: '0', step: '0.001', value: '0.3', testid: 'distribute-gap', 'aria-label': '간격 배치 간격(m)' });
  groupRow.append(alignXBtn, alignYBtn, distributeBtn, distributeGap);
  const allowLabel = el('label', { class: 'check' });
  const allowWarnings = el('input', { type: 'checkbox', testid: 'allow-warnings' });
  allowLabel.append(allowWarnings, ' 공간 경고 허용(끄면 새 경고가 생기는 편집을 전체 취소)');
  const snapLabel = el('label', { class: 'check' });
  const snapOn = el('input', { type: 'checkbox', testid: 'snap' });
  snapLabel.append(snapOn, ' 배치 스냅');
  const snapStep = el('select', { testid: 'snap-step' });
  for (const v of SNAP_STEPS_M) snapStep.append(el('option', { value: String(v) }, String(v)));
  const keyStep = el('select', { testid: 'key-step' });
  for (const v of SNAP_STEPS_M.filter((x) => x <= 0.1)) keyStep.append(el('option', { value: String(v) }, String(v)));
  const zoomRow2 = el('div', { class: 'tool-group' });
  const zoom50 = button('zoom-50', '50%'), zoom200 = button('zoom-200', '200%');
  zoomRow2.append(zoom50, zoom200);
  const lockLabel = el('label', { class: 'check' });
  const centerLock = el('input', { type: 'checkbox', testid: 'center-lock' });
  lockLabel.append(centerLock, ' 중심 고정');
  const wheelSelect = el('select', { testid: 'wheel-sensitivity' });
  for (const [v, t] of Object.entries(WHEEL_LABELS)) wheelSelect.append(el('option', { value: v }, t));
  const wheelReset = button('wheel-reset', '휠 감도 기본값');
  const wheelStatus = el('p', { class: 'muted', testid: 'wheel-status', role: 'status' });
  precisionBox.append(groupRow, allowLabel, snapLabel, wrap('스냅 간격 (m)', snapStep), wrap('방향키 이동 (m) · Shift는 고속', keyStep), zoomRow2, lockLabel, wrap('마우스 휠 확대 감도', wheelSelect), wheelReset, wheelStatus);

  const refBox = details('04 / 참고 도면 배경', false);
  const refBody = el('div', { testid: 'reference-section' });
  refBox.append(refBody);

  const colorBox = details('05 / 적재율 색상', false);
  const select = (testid, text, options) => { const sel = el('select', { testid }); for (const [v, t] of options) sel.append(el('option', { value: v }, t)); return wrap(text, sel); };
  const vizMode = select('viz-mode', '도면 색상 기준', [['inventory', '실제 재고 적재율'], ['height', '높이 활용률'], ['registered', '위치 등록 현황'], ['management', '품목별 관리 지표']]);
  const heightPolicy = select('height-policy', '랙 높이 집계 정책', [['weightedMax', '선반별 최대 높이 / 높이 가중평균'], ['meanMax', '선반별 최대 높이 비율 / 단순평균'], ['max', '등록 자재 중 최대 높이 비율']]);
  const thr = (testid, text, min, max) => wrap(text, el('input', { type: 'number', testid, min, max }));
  const thrLow = thr('threshold-low', '보통 시작 (%)', 1, 98), thrHigh = thr('threshold-high', '주의 시작 (%)', 2, 100);
  const colorInputs = Object.entries({ empty: '빈 랙', low: '여유', mid: '보통', high: '주의', over: '초과', unknown: '정보 없음' }).map(([k, t]) => [k, wrap(t, el('input', { type: 'color', testid: 'color-' + k }))]);
  const applyColorsBtn = button('apply-colors', '색상 기준 적용');
  colorBox.append(vizMode, heightPolicy, thrLow, thrHigh, ...colorInputs.map((c) => c[1]), applyColorsBtn);
  left.append(excelBox, projectBox, toolBox, precisionBox, refBox, colorBox);

  // 오른쪽(기준본 sidebar.right): 선택 객체·공간 지표
  const inspectorBox = $('inspector');
  const inspector = el('div', { class: 'inspector', testid: 'inspector' });
  const selWarn = el('div', { testid: 'selection-warnings' });
  const detailBtn = button('open-detail', '선반별 자재 상세');
  inspectorBox.append(inspector, detailBtn, selWarn);
  const selList = el('ul'); // 기준본에 없는 선택 목록: 화면에는 두지 않는다

  // 하단(기준본 sBottom): 재고기록·배치 이력 / 랙 목록·공간 검토
  const section = (title, testid, key) => {
    const d = el('details', { class: 's-section', 'data-section': key, testid });
    d.open = true;
    d.append(el('summary', {}, title));
    const body = el('div', { class: 's-content' });
    d.append(body);
    return [d, body];
  };
  const [invBox, invBody] = section('재고기록', 'inventory-section', 'inventory');
  const [snapBox, snapBody] = section('배치 이력', 'snapshots-section', 'layout');
  const [listBox, listBody] = section('랙 목록', 'racklist-section', 'racks');
  const [warnBox, warnBody] = section('공간 검토', 'warnings-section', 'space');
  $('bTopRow').append(invBox, snapBox);
  $('bLowerRow').append(listBox, warnBox);
  const exportBtns = { svg: $('svgOut'), png: $('pngOut'), print: $('printBtn') };
  for (const [k, t] of [['racks-csv', '랙 목록 CSV'], ['history-csv', '이력 CSV'], ['template-csv', 'CSV 양식'], ['compare-csv', '비교 요약 CSV']]) $('bExports').append((exportBtns[k] = button('export-' + k, t)));

  return {
    name, status: $('saveStatus'), detail: document.querySelector('[data-testid=status-detail]'), notice: document.querySelector('[data-testid=notice]'), banner: $('sampleBanner'),
    saveBtn: $('vSave'), overwriteBtn: $('vOverwrite'), replaceBtn: $('vReplaceCorrupt'), undoBtn: $('undo'), redoBtn: $('redo'), exportBtn: $('jsonOut'), importInput: $('jsonIn'),
    versionsBtn: $('vVersions'), storageBtn: $('vStorage'), recoveryBtn: $('rBackupDownload'),
    kpi: { area: $('kArea'), racks: $('kRacks'), footprint: $('kFootprint'), load: $('kLoad'), warnings: $('kWarnings') }, wSummary: document.querySelector('[data-testid=w-summary]'), wNote: $('wTopNote'), wAll: $('wAll'), wViolations: $('wViolations'),
    toolSelect, toolPan, toolHelp, zoomOut: $('zoomOut'), zoomIn: $('zoomIn'), zoomLabel: $('zoomLabel'), fit: $('fit'), zoom50, zoom200, focus: $('focusSelection'), centerLock,
    labelMode: $('vLabelMode'), labelLayout: $('qLabelLayout'), labelPadding: $('qNumberPadding'), labelStatus: $('vLabelStatus'),
    vizMode: vizMode.querySelector('select'), heightPolicy: heightPolicy.querySelector('select'), colorMode: $('vColorMode'), themeBtn: $('vThemeOpen'), applyColorsBtn,
    thrLow: thrLow.querySelector('input'), thrHigh: thrHigh.querySelector('input'), colorInputs: Object.fromEntries(colorInputs.map(([k, l]) => [k, l.querySelector('input')])),
    wheelSelect, wheelReset, wheelStatus, canvasWrap: $('canvasWrap'), plan: $('plan'), hint: $('canvasHint'), selStatus: $('selectionStatus'), selCount: $('selectedCount'), selList, selWarn,
    scenBefore: $('rBefore'), scenAfter: $('rAfter'), rActive: $('rActive'), lockBtn: $('rLock'), lockState: $('rLockState'), cloneBtn: $('rClone'), seedAfter: $('seedAfter'), scenarioSelect: $('scenario'), compareBtn: $('compareBtn'), historyBtn: $('rHistory'),
    leftToggle: $('mLeftPanel'), rightToggle: $('mRightPanel'), bothClose: $('mBothClose'), bothOpen: $('mBothOpen'), bottomToggle: $('sBottomToggle'), bottomDefault: $('bDefaultLayout'), bottomGrip: $('sGrip'), bottom: $('sBottom'),
    bottomSections: { inventory: invBox, layout: snapBox, racks: listBox, space: warnBox }, exportBtns, main: $('app'), metricsBody: $('spaceMetrics'), warnBody, listBody, legendBox: $('legend'), invBody, snapBody, detailBtn, excelBtn, alignXBtn, alignYBtn, distributeBtn, distributeGap,
    roomBody, refBody, histDate: $('historyDate'), histSlider: $('dateSlider'), histMode: $('historyMode'), liveBtn: $('liveBtn'), histStatus: $('historyStatus'), toolButtons, rackType, newWidth, newDepth, newHeight, newUnit,
    rotateBtn: $('rotate'), duplicateBtn: $('duplicate'), deleteBtn: $('delete'), allowWarnings, snapOn, snapStep, keyStep, inspector, toast: $('toast'),
  };
}

async function start() {
  const ui = renderShell(document.body);
  const printArea = el('div', { id: 'printArea', 'aria-hidden': 'true' });
  document.body.append(printArea);
  const store = createProjectStore({ storage: window.localStorage, validate: projectValidator });
  const ids = createIdGenerator();
  // 주요 작업 전 전체 프로젝트 백업 링(기준본 V.checkpoint, D-026). 지문은 저장 메타(persistence)를 뺀 프로젝트 JSON.
  const backups = createBackupRing({ storage: window.localStorage, validate: projectValidator, fingerprint: (p) => JSON.stringify({ ...p, persistence: undefined }), nextId: ids });
  const session = createSession({ store, nextId: ids, backups });
  const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const storageDialogs = createStorageDialogs({ session, store, backups, storage: window.localStorage, validate: projectValidator, schemaVersion: SCHEMA_VERSION, today, toast: (t) => showToast(t), download });

  // ── 화면 상태(세션 밖) ──
  let tool = 'select';
  let selected = new Set();
  let view = null; // 현재 카메라. 조작 중에는 세션보다 앞서 있을 수 있다.
  let gesture = null;
  let marquee = null;
  let lastProject = null;
  let sceneKey = null;
  let sceneScale = null;
  let sceneWarnings = [];
  const tracker = createWheelTracker();
  const wheel = { pending: 0, clientX: 0, clientY: 0, frame: 0 };
  const touches = new Map();
  let wheelMode = loadWheelMode(window.localStorage);
  let preview = null; // 드래그 이동 중 미리보기 { layout, guides }
  let clipboard = [];
  let toastTimer = 0;
  let historyDate = ''; // 과거 조회 날짜: 화면 상태이며 프로젝트에 저장하지 않는다(기준본 historyDate 전역).
  let historyMode = 'recorded';
  let histMemo = null;
  const panels = createPanels({ kpi: ui.kpi, metrics: ui.metricsBody, warnings: ui.warnBody, list: ui.listBody, legend: ui.legendBox }, {
    onFocus: (ids) => {
      const existing = new Set(layout().objects.map((o) => o.id));
      commitSelection(new Set(ids.filter((id) => existing.has(id))));
      const box = selectionBox(layout().objects.filter((o) => selected.has(o.id)));
      if (box) commitView(focusBox(view, box, W(), size()));
    },
    onView: (v) => pref({ panels: { view: v } }),
  });
  const rackDetail = createRackDetail({
    getProject: () => project(),
    getLayout: () => layout(),
    readOnly: () => !!historyDate,
    saveOrder: (order) => pref({ rackInfographic: { shelfOrder: order } }),
    confirmPhysical: (id) => command(PHYSICAL_COMMAND, confirmPhysical(id, new Date().toISOString(), session.nextId()), PHYSICAL_COMMAND).then(() => rackDetail.refresh()),
    download,
    toast: (t) => showToast(t),
  });
  const records = createRecordsPanel({ inventory: ui.invBody, layouts: ui.snapBody }, {
    getProject: () => project(),
    isHistory: () => !!historyDate,
    onView: (date) => { historyMode = 'recorded'; setHistory(date); },
    today,
    saveSnapshot: (date, name) => command('현재 배치 기록', saveSnapshot({ id: session.nextId(), date, name, recordedAt: new Date().toISOString() }), SAVE_SNAPSHOT_COMMAND),
    restoreSnapshot: async (id) => {
      const r = await run(RESTORE_SNAPSHOT_COMMAND, (p, ctx) => applyCommand(p, restoreSnapshot(id), { command: RESTORE_SNAPSHOT_COMMAND, selection: [...selected], resetCamera: true, ...ctx }));
      if (r?.ok) {
        commitSelection(new Set());
        showToast('배치를 복원했습니다. 현재 수량·자재 연결과 날짜별 이력은 유지됩니다.');
      }
    },
    toast: (t) => showToast(t),
  });
  const excelDialog = createExcelDialog({ toast: (t) => showToast(t), getProject: () => project(), nextId: session.nextId, applyProposal: (pr, ctx) => historyBlocked() || session.apply(EXCEL_APPLY_COMMAND, (p, opts) => applyExcelProposal(p, pr, ctx, opts)) });
  const scenarioDialogs = createScenarioDialogs({
    getProject: () => project(), toast: (t) => showToast(t), download, jsonName: () => `warehouse_project_v${SCHEMA_VERSION.replaceAll('.', '_')}_${today()}.json`, cloneBeforeToAfter, restoreBackup, cloneCommand: CLONE_COMMAND, restoreCommand: RESTORE_COMMAND,
    apply: (label, compute) => historyBlocked() || session.apply(label, compute),
  });
  const groupDialog = createGroupDialog({
    getProject: () => project(),
    getSelection: () => selectedRackIds(),
    toast: (t) => showToast(t),
    apply: (label, mutate, overrideAllow) => run(label, (p, ctx) => applyCommand(p, mutate, { command: label, selection: [...selected], overrideAllow, ...ctx })),
  });

  const project = () => session.state.project;
  const layout = () => {
    const p = project();
    if (!historyDate) return p.scenarios[p.settings.scenario];
    if (!histMemo || histMemo.p !== p || histMemo.d !== historyDate || histMemo.m !== historyMode) histMemo = { p, d: historyDate, m: historyMode, l: historyLayout(p, historyDate, historyMode) };
    return histMemo.l;
  };
  const HISTORY_MESSAGE = '과거 조회는 읽기 전용입니다.';
  /** 과거 조회 중이면 편집을 막는다(BEFORE 잠금 안내가 먼저). 막았으면 실패 결과를 돌려준다. */
  function historyBlocked() {
    if (!historyDate || isLocked(project())) return null;
    showToast(HISTORY_MESSAGE);
    return { ok: false, reason: HISTORY_MESSAGE };
  }
  const size = () => {
    const r = ui.canvasWrap.getBoundingClientRect();
    return { w: Math.max(1, r.width), h: Math.max(1, r.height) };
  };
  const toWorld = (clientX, clientY) => {
    const pt = ui.plan.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(ui.plan.getScreenCTM().inverse());
  };
  /** 화면 픽셀 이동량 → 월드 m 이동량(시작 시점 변환 행렬 m). */
  const deltaWorld = (m, dx, dy) => ({ x: m.a * dx + m.c * dy, y: m.b * dx + m.d * dy });

  function applyCamera() {
    if (!view || !project()) return;
    const v = viewBox(view, layout().warehouse, size());
    ui.plan.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
    ui.zoomLabel.textContent = `${fmt(view.zoom * 100, 0)}%`;
    ui.centerLock.checked = view.centerLocked;
    renderPlan();
  }

  let appliedTheme = null;
  function renderPlan(force = false) {
    const p = project();
    if (!p) return;
    if (p.theme !== appliedTheme) { appliedTheme = p.theme; applyTheme(p); }
    const l = layout();
    const u = view ? pixelsPerMeter(view, l.warehouse, size()) : 20;
    const key = [l, !!historyDate, p.settings, p.theme, p.precision, p.rackLabels, p.scenarioMeta, p.panels, [...selected].join('\u0000'), tool, marquee && JSON.stringify(marquee), preview, gesture && gesture.kind !== 'move' ? gesture.kind : null];
    const same = !force && sceneKey && key.every((k, i) => k === sceneKey[i]);
    if (same && u === sceneScale) return;
    // 확대율만 바뀌면 라벨 크기·배치(화면 px 기준)만 다시 계산하고 선택·패널은 그대로 둔다.
    const scaleOnly = same;
    sceneKey = key;
    sceneScale = u;
    const r = buildScene(preview?.layout ?? l, p, { selected, tool, marquee, guides: preview?.guides, pixelsPerMeter: u, gesture: gesture?.kind, resize: isLocked(p) || historyDate ? null : { live: gesture?.kind === 'resize' && gesture.moved, invalidText: preview?.invalidText }, filter: p.panels.view, warnings: scaleOnly ? sceneWarnings : undefined });
    sceneWarnings = r.warnings;
    ui.plan.innerHTML = r.svg;
    ui.labelStatus.textContent = labelStatusText(r.labelHidden);
    if (scaleOnly) return;
    // 기준본 W.top: 현재(또는 과거 조회) 도면 재검사 한 줄 요약
    if (!preview) {
      const chk = scanLayout(l, p);
      ui.wSummary.textContent = candidateSummary(chk);
      ui.wSummary.className = chk.rows?.some((x) => x.issues?.length) ? 'w-warning' : '';
      ui.wNote.textContent = '실제 설치 검토 전 설계안 · ' + (historyDate ? '과거 도면 재검사' : '현재 도면 재검사');
    }
    renderSelection();
    if (!preview) {
      panels.render({ layout: l, project: p, selected, warnings: r.warnings });
      records.render();
      rackDetail.refresh();
    }
  }

  function renderSelection() {
    const os = layout().objects.filter((o) => selected.has(o.id));
    // 기준본 50-editor: 랙이 있으면 'N개 랙 · 면적 ㎡', 아니면 'N개 객체 선택'. 배지는 선택 수.
    const rs = os.filter((o) => o.kind === 'rack');
    ui.selStatus.textContent = rs.length ? `${rs.length}개 랙 · 면적 ${fmt(rs.reduce((a, o) => a + o.width * o.depth, 0), 3)}㎡` : `${os.length}개 객체 선택`;
    ui.selCount.textContent = String(os.length);
    ui.detailBtn.hidden = !(os.length === 1 && rs.length === 1);
    ui.selList.replaceChildren(...os.slice(0, 50).map((o) => el('li', {}, `${o.code} · ${o.kind === 'rack' ? '랙' : o.kind}`)));
    if (os.length > 50) ui.selList.append(el('li', { class: 'muted' }, `외 ${os.length - 50}개`));
    const ws = sceneWarnings.filter((w) => w.ids.some((id) => selected.has(id)));
    ui.selWarn.innerHTML = !os.length ? '<div class="empty">도면에서 객체를 선택하세요.<br>좌표는 회전 전 좌상단 기준입니다.</div>'
      : ws.length ? `<div class="warnbox">${ws.map((w) => esc(w.text)).join('<br>')}</div>` : '<p class="info">선택 객체에 공간 경고가 없습니다.</p>';
    ui.focus.disabled = !os.length;
    const locked = isLocked(project());
    const ro = locked || !!historyDate;
    for (const b of [ui.rotateBtn, ui.duplicateBtn, ui.deleteBtn]) b.disabled = !os.length || ro;
    const rackCount = os.filter((o) => o.kind === 'rack').length;
    ui.detailBtn.disabled = !(os.length === 1 && os[0].kind === 'rack');
    for (const b of [ui.alignXBtn, ui.alignYBtn, ui.distributeBtn]) b.disabled = rackCount < 2 || ro;
    if (!preview) renderInspector(ui.inspector, { objects: os, settings: project().settings, locked, onChange: editField, onLock: (id, v) => command('위치 잠금', setPositionLock(id, v)), objectColor: os.length === 1 ? { value: project().theme.objectColors[project().settings.scenario][os[0].id] || OBJECT_COLORS[os[0].kind] || project().settings.colors.unknown, onSet: (c) => editObjectColor(os[0].id, c) } : undefined, zone: os.length === 1 && os[0].kind === 'rack' ? rackLabelParts(os[0], project(), project().settings.scenario) : undefined, onZone: (name) => editZone(os[0], name) });
  }

  function showToast(text) {
    ui.toast.textContent = text;
    ui.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { ui.toast.hidden = true; }, 6000);
  }

  /** 편집 명령 실행: 실패하면 이유를 알린다(기준본 toast '전체 취소: …'). */
  async function run(label, compute) {
    const blocked = historyBlocked();
    if (blocked) return blocked;
    try {
      const r = await session.apply(label, compute);
      if (r && !r.ok) showToast(`전체 취소: ${r.reason}`);
      return r;
    } catch (e) {
      showToast(`편집을 적용하지 않았습니다: ${e.message}`);
      return null;
    }
  }
  // 명령 기록 이름은 기준본처럼 따로 지정한 것 외에는 '객체 수정'이다. label은 실행취소 표시용.
  const command = (label, mutate, name = COMMAND_DEFAULT) => run(label, (p, ctx) => applyCommand(p, mutate, { command: name, selection: [...selected], ...ctx }));

  // 창고 치수·참고 도면(Phase 9a): 모든 변경은 applyCommand를 거쳐 실행취소에 기록된다.
  let calibration = [];
  const roomPanel = createRoomPanel({ room: ui.roomBody, ref: ui.refBody }, {
    getProject: () => project(),
    isHistory: () => !!historyDate,
    applyRoom: (r) => run('치수 적용', (p, ctx) => applyRoom(p, r, ctx)),
    setBackground: (label, mutate) => command(label, (d, l) => mutate(d.settings.background, l.warehouse)),
    startCalibration: () => { calibration = []; setTool('calibrate'); },
    toast: (t) => showToast(t),
  });
  /** 축척 보정 도구의 클릭 한 번(기준본 30 tool==='calibrate'): 두 점 거리와 실측 거리의 비로 첫 점 기준 균일 확대. */
  function calibrationClick(p) {
    calibration.push({ x: p.x, y: p.y });
    if (calibration.length < 2) return;
    const [a, b] = calibration, d = Math.hypot(a.x - b.x, a.y - b.y), actual = roomPanel.calibrationLength();
    calibration = [];
    if (d > EPS && actual > 0) {
      const f = actual / d;
      command('참고 도면 축척 보정', (dr) => {
        const g = dr.settings.background;
        g.x = a.x + (g.x - a.x) * f;
        g.y = a.y + (g.y - a.y) * f;
        g.width *= f;
        g.height *= f;
      }).then((r) => r?.ok && showToast('배경 축척을 보정했습니다. 위치는 별도로 조정할 수 있습니다.'));
    }
    setTool('select');
  }

  /** 라벨 표시 설정 변경. 기준본 V.appearanceEdit처럼 실행취소에 기록하고 저장한다. */
  function labelEdit(label, mutate) {
    return session.edit(label, mutate).then(() => renderPlan(true)).catch((e) => { showToast(`색상·표시 설정 취소: ${e.message}`); renderPlan(true); });
  }
  function syncColorInputs() {
    const st = project().settings;
    ui.vizMode.value = st.vizMode ?? 'inventory';
    ui.heightPolicy.value = st.heightPolicy ?? 'weightedMax';
    ui.colorMode.value = project().theme.colorMode;
    ui.thrLow.value = st.low;
    ui.thrHigh.value = st.high;
    for (const [k, i] of Object.entries(ui.colorInputs)) i.value = st.colors[k];
  }
  const colorEdit = (label, mutate) => labelEdit(label, mutate).then(syncColorInputs);
  const themeDialog = createThemeDialog({
    project, resetColors,
    edit: (label, mutate) => session.edit(label, mutate).then(() => { renderPlan(true); syncColorInputs(); return true; }).catch((e) => { showToast(`색상·표시 설정 취소: ${e.message}`); renderPlan(true); return false; }),
  });
  function editObjectColor(id, color) {
    colorEdit('객체 표시 색상', (d) => setObjectColor(d, id, color));
  }
  function editZone(o, name) {
    if (name === '') return showToast('표시 이름을 입력하세요.');
    const { key } = rackLabelParts(o, project(), project().settings.scenario);
    labelEdit('ZONE 표시 이름', (d) => {
      const names = d.rackLabels.zoneNames[d.settings.scenario];
      if (name === null) delete names[key];
      else Object.defineProperty(names, key, { value: name, enumerable: true, configurable: true, writable: true });
    });
  }

  function editField(id, field, raw, isNumber) {
    if (selected.size === 1 && MM_INPUT_FIELDS.has(field) && !isMmInput(raw)) {
      showToast(MM_INPUT_MESSAGE);
      renderPlan(true);
      return;
    }
    const dim = (field === 'width' || field === 'depth') && selected.size === 1;
    (dim ? command(DIMENSION_COMMAND, setDimension(id, field, raw), DIMENSION_COMMAND) : command('객체 수정', setField(id, field, fieldValue(field, raw, isNumber)))).then(() => renderPlan(true));
  }
  async function addAt(kind, point) {
    const p = project();
    const add = addObjectAt(p, kind, point, { nextId: session.nextId, rack: { width: Number(ui.newWidth.value), depth: Number(ui.newDepth.value), height: Number(ui.newHeight.value), type: ui.rackType.value, unit: ui.newUnit.value } });
    if (!add) return;
    const r = await command('객체 추가', add.mutate);
    if (r?.ok) commitSelection(new Set([add.id]));
  }
  const selectedObjects = () => layout().objects.filter((o) => selected.has(o.id));
  async function deleteSelected() {
    if (!selected.size) return;
    const r = await command('객체 삭제', deleteObjects([...selected]));
    if (r?.ok) commitSelection(new Set());
  }
  async function duplicate(source) {
    if (!source.length) return;
    const d = duplicateObjects(source, { nextId: session.nextId });
    const r = await command('객체 복제', d.mutate);
    if (r?.ok) commitSelection(new Set(d.ids));
  }
  const selectedRackIds = () => [...selected].filter((id) => layout().objects.some((o) => o.kind === 'rack' && o.id === id));
  const rotateSelected = () => {
    if (!selected.size) return;
    if (selectedRackIds().length > 1) return groupDialog.open('rotate');
    command('객체 회전', rotateObjects([...selected]));
  };
  function nudge(dx, dy, fast) {
    if (!selected.size || tool !== 'select') return;
    const n = nudgeObjects(project(), [...selected], dx, dy, fast);
    const name = `키보드 미세 이동 ${fmt(n.step, 3)}m`;
    command(name, n.mutate, name);
  }

  function syncHistory() {
    const p = project();
    if (!p) return;
    const dates = historyDates(p), on = !!historyDate;
    ui.histDate.value = historyDate;
    ui.histMode.value = historyMode;
    ui.histSlider.max = String(Math.max(0, dates.length - 1));
    ui.histSlider.value = String(Math.max(0, dates.indexOf(historyDate)));
    ui.histSlider.disabled = !dates.length;
    ui.liveBtn.disabled = !on;
    ui.histStatus.textContent = historyStatusText(p, historyDate, layout());
    ui.hint.textContent = on ? `과거 조회 · 읽기 전용 · ${historyDate}` : '원점: 좌상단 · X → / Y ↓ · 단위 m';
    ui.undoBtn.disabled = on || !session.state.canUndo || session.state.status === 'saving';
    ui.redoBtn.disabled = on || !session.state.canRedo || session.state.status === 'saving';
    for (const b of ui.toolButtons) if (b.dataset.tool !== 'select' && b.dataset.tool !== 'pan') b.disabled = on;
    roomPanel.updateState();
  }
  /** 기준본 setHistory: 선택 해제·카메라 초기화·선택 도구. */
  function setHistory(d) {
    abortGesture();
    historyDate = d;
    commitSelection(new Set());
    setTool('select');
    commitView(centerView(view, true, W(), size()));
    syncHistory();
    renderPlan(true);
  }

  function setTool(t) {
    tool = t;
    for (const b of ui.toolButtons) b.classList.toggle('active', b.dataset.tool === t);
    ui.toolHelp.textContent = TOOL_HELP[t] ?? `${OBJECT_TYPES[t]}를 배치할 위치를 클릭하세요.`;
    ui.plan.style.cursor = t === 'pan' ? 'grab' : t === 'select' ? 'default' : 'crosshair';
    renderPlan();
  }

  /** 카메라를 바꾸고 저장을 예약한다(실행취소 기록 없음). */
  function commitView(next, delay) {
    view = next;
    applyCamera();
    session.setView({ viewport: view }, delay === undefined ? undefined : { delay });
  }
  const commitSelection = (next) => {
    selected = next;
    renderPlan();
    session.setView({ selection: [...selected] }, { delay: 0 });
  };
  const cancelWheel = () => {
    cancelAnimationFrame(wheel.frame);
    wheel.frame = 0;
    wheel.pending = 0;
  };

  // 기준본 S.panels 높이 계산(데스크톱): 작업 영역 높이 = max(화면 남은 높이, 도면 최소 + 하단 전체 높이).
  function sizeWork() {
    const pn = project()?.panels;
    if (!pn) return;
    const work = document.getElementById('sWork'), ws = document.querySelector('.workspace');
    const tools = [...ws.children].filter((e) => e.id !== 'canvasWrap').reduce((n, e) => n + e.getBoundingClientRect().height, 0);
    const mainMin = Math.max(460, Math.ceil(tools + 280));
    const upper = Math.max(60, Math.min(360, pn.panelHeights.upper)), lower = Math.max(80, Math.min(420, pn.panelHeights.lower));
    const fullDock = document.getElementById('bDatebar').getBoundingClientRect().height + 2 * 38 + upper + lower + 20;
    const room = Math.max(700, innerHeight - ws.getBoundingClientRect().top - scrollY - 36);
    work.style.height = Math.max(room, mainMin + fullDock + 10) + 'px';
    work.style.gridTemplateRows = pn.bottomOpen ? `minmax(${mainMin}px,1fr) 10px auto` : `minmax(${mainMin}px,1fr)`;
  }
  let workFrame = 0;
  const resizeWork = () => { cancelAnimationFrame(workFrame); workFrame = requestAnimationFrame(sizeWork); };
  window.addEventListener('resize', resizeWork);
  new ResizeObserver(resizeWork).observe(document.querySelector('header'));

  // ── 세션 상태 → 화면 ──
  const paint = (s) => {
    storageDialogs.observe(s);
    ui.recoveryBtn.hidden = !s.lastFailure;
    ui.status.textContent = STATUS_TEXT[s.status] ?? s.status;
    ui.status.dataset.state = s.status;
    // 기준본 V.paint 상세 문구: (오류 · )(안내 · )마지막 확인 저장 시각 · 이 PC·브라우저 저장 …
    const saved = s.project?.persistence?.lastSavedAt;
    ui.detail.textContent = (s.error ? `${ERROR_HINT[s.error.code] ?? ''} (${s.error.code}${s.error.stage ? ' / ' + s.error.stage : ''}) ${s.error.message}${s.error.code === 'QUOTA' ? ' ' + storageDialogs.riskText() : ''} · ` : '') + (saved ? `마지막 확인 저장: ${new Date(saved).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} · ` : '확인된 저장 시각 없음 · ');
    ui.notice.textContent = s.notice ? s.notice + ' · ' : '';
    ui.detail.parentElement.title = ui.detail.parentElement.textContent;
    if (s.project && document.activeElement !== ui.name) ui.name.value = s.project.metadata.name;
    if (s.project) {
      // 기준본 sampleBanner(20-renderer). Excel 연결 문구는 9b-6에서 맞춘다.
      ui.banner.textContent = s.project.metadata.sample ? '샘플 도면 · 첨부 평면도 참고. 창고·객체 치수와 위치는 실측값이 아닙니다. 초기 재고는 미입력입니다.' : '사용자 프로젝트 · 치수·위치의 근거는 선택 객체의 정보에서 확인하세요.';
      const scen = s.project.settings.scenario, locked = s.project.scenarioMeta[scen]?.locked, noBase = !s.project.scenarios.before.objects.some((o) => o.kind === 'rack');
      ui.rActive.textContent = `${scen.toUpperCase()} · ${locked ? '조회 / 원본 잠금' : '편집'}${noBase ? ' · BEFORE 기준 없음' : ''}`;
      ui.scenarioSelect.value = scen;
    }
    ui.overwriteBtn.hidden = s.error?.code !== 'CONFLICT';
    ui.replaceBtn.hidden = !s.corrupt;
    ui.undoBtn.disabled = !s.canUndo || s.status === 'saving';
    ui.redoBtn.disabled = !s.canRedo || s.status === 'saving';
    ui.saveBtn.disabled = s.status === 'saving' || s.status === 'loading';
    if (!s.project) return;
    ui.allowWarnings.checked = s.project.editing.allowWarnings;
    const pn = s.project.panels;
    ui.main.classList.toggle('left-closed', !pn.leftOpen);
    ui.main.classList.toggle('right-closed', !pn.rightOpen);
    ui.bottom.hidden = ui.bottomGrip.hidden = !pn.bottomOpen;
    ui.bottomGrip.setAttribute('aria-valuenow', String(pn.bottomHeight));
    ui.bottomToggle.textContent = pn.bottomOpen ? '하단 전체 접기' : '하단 전체 펼치기';
    ui.bottomToggle.setAttribute('aria-expanded', String(pn.bottomOpen));
    for (const [k, box] of Object.entries(ui.bottomSections)) if (box.open !== pn.bottomSections[k]) box.open = pn.bottomSections[k];
    // 기준본 S.panels: 위 줄(재고기록·배치 이력)은 panelHeights.upper, 아래 줄(랙 목록·공간 검토)은 lower 높이로 내용만 스크롤한다.
    for (const [k, box] of Object.entries(ui.bottomSections)) box.querySelector('.s-content').style.height = Math.max(k === 'inventory' || k === 'layout' ? 60 : 80, Math.min(k === 'inventory' || k === 'layout' ? 360 : 420, k === 'inventory' || k === 'layout' ? pn.panelHeights.upper : pn.panelHeights.lower)) + 'px';
    ui.leftToggle.textContent = pn.leftOpen ? '접기: 설계 도구' : '펼치기: 설계 도구';
    ui.rightToggle.textContent = pn.rightOpen ? '접기: 선택 정보' : '펼치기: 선택 정보';
    sizeWork();
    ui.lockBtn.textContent = s.project.scenarioMeta.before.locked ? 'BEFORE 잠금 해제' : 'BEFORE 잠그기';
    ui.lockState.textContent = 'BEFORE ' + (s.project.scenarioMeta.before.locked ? '잠금' : '수정 허용');
    ui.lockBtn.dataset.locked = String(s.project.scenarioMeta.before.locked);
    ui.snapOn.checked = s.project.settings.snap;
    ui.snapStep.value = String(s.project.precision.snapStep);
    ui.keyStep.value = String(s.project.precision.keyStep);
    syncColorInputs();
    ui.labelMode.value = s.project.rackLabels.displayMode;
    ui.labelLayout.value = s.project.rackLabels.layoutMode;
    ui.labelPadding.value = String(s.project.rackLabels.numberPadding);
    if (s.project !== lastProject) {
      // 프로젝트를 처음 불러오거나 실행취소 등으로 바뀌면 저장된 선택·카메라를 따른다(조작 중이면 조작이 우선).
      const ids = new Set(s.project.scenarios[s.project.settings.scenario].objects.map((o) => o.id));
      selected = lastProject === null ? restoreSelection(s.project) : new Set([...selected].filter((id) => ids.has(id)));
      // 저장된 viewport에 fitScale이 아직 없으면(처음 연 프로젝트) 화면에서 정한 fitScale을 계속 쓴다.
      // 그렇지 않으면 패널 접기 같은 다른 변경 때 현재 화면 크기로 다시 계산되어 축척이 바뀐다.
      const pv = s.project.viewport;
      const sameBase = view && pv.zoom === view.zoom && pv.panX === view.panX && pv.panY === view.panY && pv.centerLocked === view.centerLocked;
      if (!gesture && !(sameBase && !(pv.fitScale > 0) && view.fitScale > 0)) view = withFitScale(pv, s.project.scenarios[s.project.settings.scenario].warehouse, size());
      lastProject = s.project;
    }
    renderPlan();
    applyCamera();
    syncHistory();
    roomPanel.sync();
  };
  session.subscribe(paint);

  const guard = async (fn) => {
    try {
      await fn();
    } catch (e) {
      ui.detail.textContent = `편집을 적용하지 않았습니다: ${e.message}`;
      ui.detail.title = ui.detail.textContent;
    }
  };

  // ── 프로젝트 명령 ──
  ui.name.addEventListener('change', () => guard(() => session.edit('프로젝트 이름 변경', (p) => { p.metadata.name = ui.name.value; })));
  ui.saveBtn.addEventListener('click', () => guard(() => session.save()));
  ui.overwriteBtn.addEventListener('click', () => {
    if (!confirm('다른 탭 또는 창에서 저장한 내용을 이 탭의 현재 프로젝트로 덮어씁니다. 다른 탭의 저장본은 직전 저장본으로 보관됩니다. 계속하시겠습니까?')) return;
    guard(() => session.save({ force: true }));
  });
  ui.replaceBtn.addEventListener('click', () => {
    if (!confirm('읽을 수 없는 기존 저장본을 현재 프로젝트로 교체합니다. 계속하시겠습니까?')) return;
    guard(() => session.save({ replaceCorrupt: true }));
  });
  ui.histDate.addEventListener('change', () => setHistory(/^\d{4}-\d{2}-\d{2}$/.test(ui.histDate.value) ? ui.histDate.value : ''));
  ui.histSlider.addEventListener('input', () => { const d = historyDates(project())[Number(ui.histSlider.value)]; if (d) setHistory(d); });
  ui.histMode.addEventListener('change', () => { historyMode = ui.histMode.value; syncHistory(); renderPlan(true); });
  ui.liveBtn.addEventListener('click', () => setHistory(''));
  ui.undoBtn.addEventListener('click', () => guard(() => session.undo()));
  ui.redoBtn.addEventListener('click', () => guard(() => session.redo()));
  ui.exportBtn.addEventListener('click', () => { if (project()) storageDialogs.exportCurrent(); });
  // 내보내기(기준본 30): 현재 화면의 배치(과거 조회 중이면 그 날짜의 배치)를 쓴다. SVG·PNG·인쇄는 같은 reportSvg.
  const csv = (name, rows) => download(name, csvEncode(rows), 'text/csv;charset=utf-8');
  const report = () => reportSvg(project(), { layout: layout(), historyDate, today: today() });
  ui.exportBtns.svg.addEventListener('click', () => download('warehouse_layout.svg', report(), 'image/svg+xml;charset=utf-8'));
  ui.exportBtns.png.addEventListener('click', async () => {
    let url = '';
    try {
      url = URL.createObjectURL(new Blob([report()], { type: 'image/svg+xml' }));
      const img = new Image();
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error('SVG 이미지 변환 실패')); img.src = url; });
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      const blob = await new Promise((resolve) => c.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('PNG 변환 실패');
      download('warehouse_layout.png', blob);
      showToast('PNG 보고서를 저장했습니다.');
    } catch (e) {
      showToast('PNG 출력 실패: ' + e.message + ' · SVG 출력을 이용하세요.');
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  });
  ui.exportBtns.print.addEventListener('click', () => { printArea.innerHTML = report(); window.print(); });
  ui.exportBtns['racks-csv'].addEventListener('click', () => csv('warehouse_racks.csv', rackCsvRows(layout())));
  ui.exportBtns['history-csv'].addEventListener('click', () => csv('inventory_history.csv', historyCsvRows(project())));
  ui.exportBtns['template-csv'].addEventListener('click', () => csv('inventory_template.csv', templateCsvRows(layout(), today())));
  ui.exportBtns['compare-csv'].addEventListener('click', () => csv('warehouse_comparison.csv', compareRows(project())));

  // 하단 패널(기준본 65): 접기·기본 복원·구역 접기·높이 조절. 화면 상태이므로 실행취소에 넣지 않는다.
  const panelsOf = () => project().panels;
  ui.bottomToggle.addEventListener('click', () => pref({ panels: { bottomOpen: !panelsOf().bottomOpen } }));
  ui.bottomDefault.addEventListener('click', () => {
    pref({ panels: { leftOpen: true, rightOpen: true, bottomOpen: false, bottomSections: { inventory: true, layout: true, racks: true, space: true }, bottomHeight: 300, panelHeights: { upper: 126, lower: 174 }, layoutPreset: 'restored-default' } });
    showToast('화면 구성만 초기화됩니다. 창고 데이터는 유지됩니다.');
  });
  for (const [k, box] of Object.entries(ui.bottomSections)) {
    box.addEventListener('toggle', () => { if (project() && box.open !== panelsOf().bottomSections[k]) pref({ panels: { bottomSections: { ...panelsOf().bottomSections, [k]: box.open }, layoutPreset: 'custom' } }); });
  }
  const setBottomHeight = (h) => { const v = Math.max(160, Math.min(600, Math.round(h))); pref({ panels: { bottomHeight: v, panelHeights: { upper: Math.round(v * 0.42), lower: Math.round(v * 0.58) }, layoutPreset: 'custom' } }); };
  let gripDrag = null;
  ui.bottomGrip.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; e.preventDefault(); gripDrag = { y: e.clientY, h: panelsOf().bottomHeight, id: e.pointerId }; ui.bottomGrip.setPointerCapture(e.pointerId); });
  ui.bottomGrip.addEventListener('pointermove', (e) => { if (gripDrag && e.pointerId === gripDrag.id) ui.bottom.style.height = Math.max(160, Math.min(600, gripDrag.h + gripDrag.y - e.clientY)) + 'px'; });
  const gripEnd = (e) => { if (!gripDrag) return; const d = gripDrag; gripDrag = null; if (e.type === 'pointerup') setBottomHeight(d.h + d.y - e.clientY); else ui.bottom.style.height = d.h + 'px'; };
  ui.bottomGrip.addEventListener('pointerup', gripEnd);
  ui.bottomGrip.addEventListener('pointercancel', gripEnd);
  ui.bottomGrip.addEventListener('keydown', (e) => {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    setBottomHeight(e.key === 'Home' ? 160 : e.key === 'End' ? 600 : panelsOf().bottomHeight + (e.key === 'ArrowUp' ? 20 : -20));
  });
  ui.importInput.addEventListener('change', async () => {
    const f = ui.importInput.files[0];
    if (!f) return;
    ui.importInput.value = '';
    ui.importInput.disabled = true;
    try { await storageDialogs.importFile(f); } finally { ui.importInput.disabled = false; }
  });
  ui.versionsBtn.addEventListener('click', () => storageDialogs.openBackups());
  ui.storageBtn.addEventListener('click', () => storageDialogs.openStorage());
  ui.recoveryBtn.addEventListener('click', () => storageDialogs.exportRecovery());

  // ── 화면 명령(기준본 fit/zoomIn/zoomOut/mZoom50/mZoom200/mCenterLock/focusSelection) ──
  const W = () => layout().warehouse;
  for (const b of ui.toolButtons) b.addEventListener('click', () => setTool(b.dataset.tool));
  ui.rotateBtn.addEventListener('click', () => rotateSelected());
  ui.excelBtn.addEventListener('click', () => excelDialog.open());
  ui.cloneBtn.addEventListener('click', () => scenarioDialogs.openClone());
  ui.seedAfter.addEventListener('click', () => scenarioDialogs.openClone());
  ui.compareBtn.addEventListener('click', () => scenarioDialogs.openCompare());
  ui.historyBtn.addEventListener('click', () => scenarioDialogs.openHistory());
  ui.detailBtn.addEventListener('click', () => rackDetail.open([...selected][0]));
  ui.alignXBtn.addEventListener('click', () => groupDialog.open('left'));
  ui.alignYBtn.addEventListener('click', () => groupDialog.open('top'));
  ui.distributeBtn.addEventListener('click', () => groupDialog.open('spaceX', { gap: ui.distributeGap.value }));
  const switchScenario = (k) => {
    abortGesture();
    selected = new Set();
    pref({ scenario: k });
  };
  ui.leftToggle.addEventListener('click', () => pref({ panels: { leftOpen: !project().panels.leftOpen } }));
  ui.rightToggle.addEventListener('click', () => pref({ panels: { rightOpen: !project().panels.rightOpen } }));
  ui.scenBefore.addEventListener('click', () => switchScenario('before'));
  ui.scenarioSelect.addEventListener('change', () => switchScenario(ui.scenarioSelect.value));
  ui.bothClose.addEventListener('click', () => pref({ panels: { leftOpen: false, rightOpen: false } }));
  ui.bothOpen.addEventListener('click', () => pref({ panels: { leftOpen: true, rightOpen: true } }));
  ui.scenAfter.addEventListener('click', () => switchScenario('after'));
  ui.lockBtn.addEventListener('click', () => {
    const locked = project().scenarioMeta.before.locked;
    if (locked && !confirm('개선 전 배치를 수정하면 개선 효과 분석의 기준 데이터가 변경됩니다. BEFORE 잠금을 해제합니까?')) return;
    pref({ beforeLocked: !locked });
  });
  ui.duplicateBtn.addEventListener('click', () => duplicate(selectedObjects()));
  ui.deleteBtn.addEventListener('click', () => deleteSelected());
  const pref = (v) => { try { session.setView(v, { delay: 0 }); } catch (e) { showToast(e.message); } };
  ui.allowWarnings.addEventListener('change', () => pref({ allowWarnings: ui.allowWarnings.checked }));
  ui.labelMode.addEventListener('change', () => labelEdit('랙 텍스트', (d) => { d.rackLabels.displayMode = ui.labelMode.value; }));
  ui.labelLayout.addEventListener('change', () => labelEdit('ZONE·번호 배치', (d) => { d.rackLabels.layoutMode = ui.labelLayout.value; }));
  ui.labelPadding.addEventListener('change', () => labelEdit('랙 번호 형식', (d) => { d.rackLabels.numberPadding = Number(ui.labelPadding.value); }));
  ui.vizMode.addEventListener('change', () => colorEdit('색상 표시 기준', (d) => { d.settings.vizMode = ui.vizMode.value; }));
  ui.heightPolicy.addEventListener('change', () => colorEdit('높이 집계 정책', (d) => { d.settings.heightPolicy = ui.heightPolicy.value; }));
  ui.colorMode.addEventListener('change', () => colorEdit('색상 표시', (d) => setColorMode(d, ui.colorMode.value)));
  ui.applyColorsBtn.addEventListener('click', () => colorEdit('적재율 색상 기준', (d) => applyThresholdColors(d, { low: ui.thrLow.value, high: ui.thrHigh.value, colors: Object.fromEntries(Object.entries(ui.colorInputs).map(([k, i]) => [k, i.value])) })));
  ui.themeBtn.addEventListener('click', () => { if (project()) themeDialog.open(); });
  ui.snapOn.addEventListener('change', () => pref({ snap: ui.snapOn.checked }));
  ui.snapStep.addEventListener('change', () => pref({ precision: { snapStep: Number(ui.snapStep.value) } }));
  ui.keyStep.addEventListener('change', () => {
    const k = Number(ui.keyStep.value);
    pref({ precision: { keyStep: k, fastStep: Math.max(k, project().precision.fastStep) } });
  });
  ui.zoomIn.addEventListener('click', () => { cancelWheel(); commitView(zoomBy(view, 0.8, null, W(), size())); });
  ui.zoomOut.addEventListener('click', () => { cancelWheel(); commitView(zoomBy(view, 1.25, null, W(), size())); });
  ui.fit.addEventListener('click', () => { cancelWheel(); tracker.reset(); commitView(centerView(view, true, W(), size())); });
  ui.zoom50.addEventListener('click', () => { cancelWheel(); commitView({ ...centerView(view, true, W(), size()), zoom: 0.5 }); });
  ui.zoom200.addEventListener('click', () => { cancelWheel(); commitView({ ...centerView(view, true, W(), size()), zoom: 2 }); });
  ui.centerLock.addEventListener('change', () => commitView(ui.centerLock.checked ? { ...view, centerLocked: true, panX: 0, panY: 0 } : { ...view, centerLocked: false }));
  // 기준본 W.fitAll: 모든 랙의 외곽에 맞춰 보기
  ui.wAll.addEventListener('click', () => {
    const box = selectionBox(layout().objects.filter((o) => o.kind === 'rack'));
    if (box) { cancelWheel(); commitView(focusBox(view, box, W(), size())); }
  });
  // 위반 목록 대화상자(기준본 wDialog)는 9b-4. 그 전까지 하단 공간 검토를 연다.
  ui.wViolations.addEventListener('click', () => {
    pref({ panels: { bottomOpen: true, bottomSections: { ...project().panels.bottomSections, space: true } } });
    ui.bottomSections.space.scrollIntoView({ block: 'nearest' });
  });
  ui.focus.addEventListener('click', () => {
    const box = selectionBox(layout().objects.filter((o) => selected.has(o.id)));
    if (box) commitView(focusBox(view, box, W(), size()));
  });

  // ── 휠 감도(F-039) ──
  ui.wheelSelect.value = wheelMode.mode;
  ui.wheelStatus.textContent = WHEEL_STATUS_TEXT[wheelMode.status];
  const setWheelMode = (v) => {
    cancelWheel();
    const r = saveWheelMode(window.localStorage, v);
    wheelMode = { mode: r.mode, status: r.saved ? 'saved' : 'unsaved' };
    ui.wheelSelect.value = r.mode;
    ui.wheelStatus.textContent = WHEEL_STATUS_TEXT[wheelMode.status];
  };
  ui.wheelSelect.addEventListener('change', () => setWheelMode(ui.wheelSelect.value));
  ui.wheelReset.addEventListener('click', () => setWheelMode('low'));

  // ── 휠 확대: 휠이 시작된 영역이 도면일 때만(패널 스크롤이 도면 확대로 이어지지 않게) ──
  const wheelArea = (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (document.querySelector('dialog[open]') || t?.closest('dialog')) return 'MODAL';
    if (t?.closest('#plan')) return 'CANVAS';
    if (t?.closest('.side.left')) return 'LEFT_PANEL';
    if (t?.closest('.side.right')) return 'RIGHT_PANEL';
    return 'OTHER';
  };
  let wheelAllowed = false;
  document.addEventListener('wheel', (e) => {
    wheelAllowed = tracker.observe(wheelArea(e), performance.now(), e.momentum === true);
    if (!wheelAllowed) cancelWheel();
  }, { capture: true, passive: true });
  const flushWheel = () => {
    const delta = wheel.pending;
    wheel.frame = 0;
    wheel.pending = 0;
    if (!project() || !view) return;
    const f = wheelFactor(delta, wheelMode.mode);
    if (f !== 1) commitView(zoomBy(view, f, toWorld(wheel.clientX, wheel.clientY), W(), size()));
  };
  ui.plan.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (!wheelAllowed || gesture) return;
    const style = getComputedStyle(ui.plan);
    const delta = wheelPixels(e, { lineHeight: parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5 || 16, pageHeight: ui.plan.getBoundingClientRect().height });
    if (!delta) return;
    wheel.pending += delta;
    wheel.clientX = e.clientX;
    wheel.clientY = e.clientY;
    if (!wheel.frame) wheel.frame = requestAnimationFrame(flushWheel);
  }, { passive: false });

  // ── 포인터: 선택·영역 선택·팬·두 손가락 확대 ──
  const capture = (e) => { try { ui.plan.setPointerCapture(e.pointerId); } catch { /* 이미 해제됨 */ } };
  function abortGesture() {
    const g = gesture;
    if (!g) return;
    gesture = null;
    if (g.kind === 'marquee') {
      marquee = null;
      selected = new Set(g.previous);
      renderPlan();
    } else if (g.kind === 'pan' || g.kind === 'pinch') {
      view = g.viewport;
      applyCamera();
    } else if (g.kind === 'move' || g.kind === 'resize') {
      preview = null; // 기준본 Esc: 기록 없이 이동·크기 조절 전으로
      renderPlan();
    }
  }
  ui.plan.addEventListener('pointerdown', (e) => {
    // 도면을 누르면 입력 칸 포커스를 풀어 방향키·Delete 단축키가 도면에 적용되게 한다(입력 칸 안에서는 단축키 무시).
    if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) document.activeElement.blur();
    tracker.reset();
    cancelWheel();
    if (!project()) return;
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) {
        e.preventDefault();
        abortGesture();
        const [a, b] = [...touches.values()], mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        gesture = { kind: 'pinch', distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), mid, zoom: view.zoom, viewport: view, view: viewBox(view, W(), size()), matrix: ui.plan.getScreenCTM().inverse(), anchor: toWorld(mid.x, mid.y) };
        capture(e);
        return;
      }
      if (touches.size > 2) return;
    }
    if (e.button !== 0 || gesture) return;
    e.preventDefault();
    if (tool === 'calibrate') {
      const p = toWorld(e.clientX, e.clientY);
      calibrationClick(p);
      return;
    }
    if (tool !== 'select' && tool !== 'pan') {
      const p = toWorld(e.clientX, e.clientY);
      addAt(tool, { x: p.x, y: p.y });
      return;
    }
    capture(e);
    if (tool === 'pan') {
      gesture = { kind: 'pan', pointer: e.pointerId, start: { x: e.clientX, y: e.clientY }, viewport: view, matrix: ui.plan.getScreenCTM().inverse() };
      return;
    }
    const handle = e.target.closest?.('[data-resize]');
    if (handle) {
      if (isLocked(project())) {
        showToast('BEFORE 잠금 · 크기 변경 불가');
        return;
      }
      const o = layout().objects.find((x) => x.id === handle.dataset.object);
      if (o) {
        const p = toWorld(e.clientX, e.clientY);
        const [sx, sy] = HANDLE_DIRECTIONS[handle.dataset.resize];
        gesture = { kind: 'resize', pointer: e.pointerId, start: { x: p.x, y: p.y }, sx, sy, object: structuredClone(o), changes: null, moved: false };
        return;
      }
    }
    const hit = e.target.closest?.('[data-id]')?.dataset.id;
    if (hit) {
      const toggle = e.ctrlKey || e.metaKey, add = e.shiftKey;
      commitSelection(clickSelect(selected, hit, { toggle, add }));
      if (toggle || add || isLocked(project())) return;
      const p = toWorld(e.clientX, e.clientY);
      const originals = layout().objects.filter((o) => selected.has(o.id));
      gesture = { kind: 'move', pointer: e.pointerId, start: { x: p.x, y: p.y }, originals, dx: 0, dy: 0, moved: false };
      return;
    }
    const p = toWorld(e.clientX, e.clientY);
    const add = e.ctrlKey || e.metaKey || e.shiftKey;
    gesture = { kind: 'marquee', pointer: e.pointerId, start: { x: p.x, y: p.y }, previous: [...selected], add };
    marquee = { a: { x: p.x, y: p.y }, b: { x: p.x, y: p.y } };
    if (!add) selected = new Set();
    renderPlan();
  });
  ui.plan.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' && touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture;
    if (!g) return;
    e.preventDefault();
    if (g.kind === 'pinch') {
      if (touches.size < 2) return;
      const [a, b] = [...touches.values()], mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const d = deltaWorld(g.matrix, mid.x - g.mid.x, mid.y - g.mid.y);
      view = pinchFrom(g, Math.hypot(a.x - b.x, a.y - b.y), d.x, d.y, W());
      applyCamera();
      return;
    }
    if (g.pointer !== e.pointerId) return;
    if (g.kind === 'pan') {
      const d = deltaWorld(g.matrix, e.clientX - g.start.x, e.clientY - g.start.y);
      view = panFrom(g.viewport, d.x, d.y);
      applyCamera();
      return;
    }
    if (g.kind === 'resize') {
      const p = toWorld(e.clientX, e.clientY);
      if (!g.moved && Math.hypot(p.x - g.start.x, p.y - g.start.y) < 2e-3) return;
      g.moved = true;
      const pr = project(), l = layout();
      g.changes = resized(pr, g.object, g.sx, g.sy, p.x - g.start.x, p.y - g.start.y);
      const next = { ...l, objects: l.objects.map((o) => (o.id === g.object.id ? { ...o, ...g.changes } : o)) };
      const invalid = newSpatialWarnings(pr, l, next, new Set([g.object.id]));
      preview = { layout: next, guides: [], invalidText: invalid[0]?.text ?? '' };
      renderPlan();
      ui.selStatus.textContent = `크기 조절 · 폭 ${fmt(g.changes.width, 3)}m × 깊이 ${fmt(g.changes.depth, 3)}m`;
      return;
    }
    if (g.kind === 'move') {
      const p = toWorld(e.clientX, e.clientY);
      const pr = project(), l = layout();
      let { dx, dy } = dragDelta(pr, g.originals[0], g.start, p);
      const a = alignmentGuides(pr, l, g.originals, dx, dy, pixelsPerMeter(view, l.warehouse, size()));
      ({ dx, dy } = a);
      if (!g.moved && Math.abs(dx) + Math.abs(dy) < EPS) return;
      g.moved = true;
      g.dx = dx;
      g.dy = dy;
      preview = { layout: movedLayout(l, g.originals.map((o) => o.id), dx, dy), guides: a.guides };
      renderPlan();
      ui.selStatus.textContent = `${g.originals.length}개 객체 · ΔX ${fmt(dx)}m / ΔY ${fmt(dy)}m`;
      return;
    }
    if (g.kind === 'marquee') {
      const p = toWorld(e.clientX, e.clientY);
      marquee = { a: g.start, b: { x: p.x, y: p.y } };
      selected = marqueeSelect(layout().objects, g.start, marquee.b, { rule: project().editing.selectionRule, previous: g.previous, add: g.add });
      renderPlan();
    }
  });
  const finish = (e, cancel) => {
    if (e.pointerType === 'touch') touches.delete(e.pointerId);
    const g = gesture;
    if (!g) return;
    if (g.kind === 'pinch') {
      if (touches.size) return; // 손가락이 남아 있으면 이어서
      gesture = null;
      if (cancel) abortGesture();
      else commitView(view, 0);
      return;
    }
    if (g.pointer !== e.pointerId) return;
    if (g.kind === 'resize') {
      gesture = null;
      if (cancel || !g.moved || !g.changes) {
        preview = null;
        renderPlan(true);
        return;
      }
      const changes = { width: g.changes.width, depth: g.changes.depth, height: g.object.height ?? null, x: g.changes.x, y: g.changes.y };
      command(RESIZE_COMMAND, applyResize(g.object.id, changes), RESIZE_COMMAND).finally(() => {
        preview = null;
        renderPlan(true);
      });
      return;
    }
    if (g.kind === 'move') {
      gesture = null;
      const ids = g.originals.map((o) => o.id);
      if (!g.moved) return; // 움직이지 않았으면 기록 없음(기준본 M.finish)
      // pointercancel은 기준본처럼 '사용자 취소' 실패 기록을 남긴다(Esc 취소는 기록 없음).
      run(g.originals.length > 1 ? '그룹 이동' : '객체 이동', (p, ctx) => applyMove(p, ids, g.dx, g.dy, { cancel, ...ctx })).finally(() => {
        preview = null;
        renderPlan(true);
      });
      return;
    }
    if (cancel) return abortGesture();
    gesture = null;
    if (g.kind === 'pan') commitView(view, 0);
    else if (g.kind === 'marquee') {
      marquee = null;
      commitSelection(selected);
    }
  };
  ui.plan.addEventListener('dblclick', (e) => {
    if (e.target.closest('[data-resize]') || gesture || tool !== 'select' || !project()) return;
    // 포인터 캡처 때문에 대상이 SVG 전체일 수 있어 기준본처럼 점이 들어간 랙(회전 반영)을 찾는다.
    const id = e.target.closest('[data-id]')?.dataset.id, p = toWorld(e.clientX, e.clientY);
    const inside = (o) => {
      const a = (o.rotation * Math.PI) / 180, c = Math.cos(a), si = Math.sin(a), dx = p.x - o.x - o.width / 2, dy = p.y - o.y - o.depth / 2;
      return Math.abs(dx * c + dy * si) <= o.width / 2 && Math.abs(-dx * si + dy * c) <= o.depth / 2;
    };
    const o = layout().objects.slice().reverse().find((x) => x.kind === 'rack' && (id ? x.id === id : inside(x)));
    if (!o) return;
    e.preventDefault();
    commitSelection(new Set([o.id]));
    rackDetail.open(o.id);
  });
  ui.plan.addEventListener('pointerup', (e) => finish(e, false));
  ui.plan.addEventListener('pointercancel', (e) => finish(e, true));
  document.addEventListener('keydown', (e) => {
    cancelWheel();
    if (document.querySelector('dialog[open]') || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable || !project()) return;
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    const dir = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
    if (dir && !mod && !e.altKey) {
      if (!selected.size || tool !== 'select') return;
      e.preventDefault();
      nudge(dir[0], dir[1], e.shiftKey);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      abortGesture();
      touches.clear();
      setTool('select');
      commitSelection(new Set());
    } else if (mod && k === 'a') {
      e.preventDefault();
      commitSelection(selectAllRacks(layout()));
    } else if (mod && k === 'z') {
      e.preventDefault();
      if (!historyDate) guard(() => (e.shiftKey ? session.redo() : session.undo()));
    } else if (mod && k === 'y') {
      e.preventDefault();
      if (!historyDate) guard(() => session.redo());
    } else if (e.key === 'Delete') {
      e.preventDefault();
      deleteSelected();
    } else if (k === 'r' && !mod) {
      rotateSelected();
    } else if (mod && k === 'c') {
      e.preventDefault();
      clipboard = structuredClone(selectedObjects());
      showToast(`${clipboard.length}개 객체 복사`);
    } else if (mod && k === 'v') {
      e.preventDefault();
      duplicate(clipboard);
    }
  });
  new ResizeObserver(() => applyCamera()).observe(ui.canvasWrap);

  window.addEventListener('storage', (event) => session.handleStorageEvent(event));
  window.addEventListener('pagehide', () => { session.flushView(); });
  window.addEventListener('beforeunload', (event) => {
    session.flushView();
    const s = session.state.status;
    if (s === 'unsaved' || s === 'error' || s === 'saving') event.preventDefault();
  });

  setTool('select');
  await session.init();
  window.__warehouseSession = session; // E2E 검사용 읽기 진입점
  window.__excelDialog = excelDialog;
  window.__warehouseView = { get viewport() { return view; }, get selected() { return [...selected]; }, get wheelMode() { return wheelMode.mode; } };
}

start().catch((e) => {
  document.getElementById('app').textContent = `시작 실패: ${e.message}`;
});
