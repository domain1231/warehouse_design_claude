// 앱 진입점. 저장소·프로젝트 모델·편집 세션(Phase 1), SVG 도면 보기·선택(Phase 3a), 객체 편집(Phase 3b)을 화면에 연결한다.
// 계산은 src/cad/*(카메라·선택·도면 문자열)에 있고, 이 파일은 DOM 이벤트를 그 함수들에 연결만 한다.
// __APP_VERSION__ / __SCHEMA_VERSION__ 은 빌드 시 package.json에서 주입된다.
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
import { createGroupDialog } from './ui/group-dialog.js';
import { createPanels } from './ui/panels.js';
import { createRackDetail } from './ui/rack-detail.js';
import { createRecordsPanel } from './ui/records-panel.js';
import { createExcelDialog } from './ui/excel-dialog.js';
import { applyExcelProposal, EXCEL_APPLY_COMMAND } from './excel/apply.js';
import { confirmPhysical, PHYSICAL_COMMAND } from './warehouse/rackinfo.js';
import { saveSnapshot, restoreSnapshot, SAVE_SNAPSHOT_COMMAND, RESTORE_SNAPSHOT_COMMAND } from './warehouse/records.js';
import { resized, applyResize, RESIZE_COMMAND, HANDLE_DIRECTIONS, newSpatialWarnings } from './warehouse/commands.js';
import { OBJECT_TYPES } from './core/project.js';
import { GEOMETRY_EPS_M as EPS, SNAP_STEPS_M } from './geometry/tolerance.js';

export const APP_VERSION = __APP_VERSION__;
export const SCHEMA_VERSION = __SCHEMA_VERSION__;

const STATUS_TEXT = {
  loading: '불러오는 중',
  saved: '● 저장됨 · SAVED',
  unsaved: '○ 저장되지 않은 변경 · UNSAVED',
  saving: '◌ 저장 중',
  error: '! 저장 실패',
};
const ERROR_HINT = {
  QUOTA: '브라우저 저장 공간이 부족합니다. 편집 내용은 이 탭의 메모리에 남아 있습니다. JSON으로 내보내 보관하세요.',
  CONFLICT: '다른 탭 또는 창에서 먼저 저장했습니다. 덮어쓰지 않았습니다.',
  CORRUPT: '기존 저장본을 읽을 수 없어 보호 중입니다.',
  VERIFY: '저장 후 읽기 확인에 실패해 저장하지 않았습니다. 기존 저장본은 그대로입니다.',
  VALIDATION: '프로젝트 검증에 실패해 저장하지 않았습니다.',
  STORAGE: '브라우저 저장소를 사용할 수 없습니다.',
};
const TOOL_HELP = {
  select: '클릭 선택 · 드래그 이동 · Shift 추가 · Ctrl/⌘ 토글 · 빈 곳 드래그 영역 선택 · 방향키 미세 이동',
  pan: '드래그하여 화면 이동',
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

function renderShell(root) {
  const app = el('div', { class: 'app' });

  // 머리글: 이름·저장 상태·프로젝트 명령
  const header = el('header', { class: 'topbar' });
  const brand = el('div', { class: 'brand' });
  brand.append(el('h1', {}, 'Warehouse Layout Designer'), el('p', { class: 'versions', testid: 'versions' }, `앱 v${APP_VERSION} · 프로젝트 스키마 ${SCHEMA_VERSION}`));
  const label = el('label', { class: 'field name-field' }, '프로젝트 이름');
  const name = el('input', { type: 'text', maxlength: '1000', testid: 'name' });
  label.append(name);
  const statusBox = el('div', { class: 'status-box' });
  const status = el('p', { class: 'status-badge', testid: 'status', role: 'status' });
  const detail = el('p', { class: 'status-detail', testid: 'status-detail' });
  statusBox.append(status, detail);
  const actions = el('div', { class: 'actions' });
  const saveBtn = button('save', '프로젝트 저장');
  const overwriteBtn = button('overwrite', '이 탭 내용으로 덮어쓰기', { hidden: '' });
  const replaceBtn = button('replace-corrupt', '손상 저장본 교체', { hidden: '' });
  const undoBtn = button('undo', '실행취소');
  const redoBtn = button('redo', '다시 실행');
  const exportBtn = button('export', 'JSON 내보내기');
  const excelBtn = button('excel-open', 'Excel 가져오기');
  actions.append(saveBtn, overwriteBtn, replaceBtn, undoBtn, redoBtn, exportBtn, excelBtn);
  const scenarioRow = el('div', { class: 'tool-group scenario-row', role: 'group', 'aria-label': '배치 대상' });
  const scenBefore = button('scenario-before', 'BEFORE 개선 전');
  const scenAfter = button('scenario-after', 'AFTER 개선 후');
  const lockBtn = button('before-lock', '');
  scenarioRow.append(scenBefore, scenAfter, lockBtn);
  const panelRow = el('div', { class: 'tool-group panel-row', role: 'group', 'aria-label': '패널' });
  const leftToggle = button('toggle-left', '');
  const rightToggle = button('toggle-right', '');
  panelRow.append(leftToggle, rightToggle);
  header.append(brand, label, scenarioRow, panelRow, statusBox, actions);
  const notice = el('p', { class: 'notice', testid: 'notice' });

  // 왼쪽: 도구·화면
  const left = el('aside', { class: 'side left', 'aria-label': '도구와 화면' });
  const tools = el('div', { class: 'tool-group', role: 'group', 'aria-label': '도구' });
  const toolSelect = button('tool-select', '선택', { 'data-tool': 'select' });
  const toolPan = button('tool-pan', '화면 이동', { 'data-tool': 'pan' });
  tools.append(toolSelect, toolPan);
  const addTools = el('div', { class: 'tool-group', role: 'group', 'aria-label': '추가 도구' });
  const toolButtons = [toolSelect, toolPan];
  for (const [kind, text] of ADD_TOOLS) {
    const b = button(`tool-${kind}`, text, { 'data-tool': kind });
    toolButtons.push(b);
    addTools.append(b);
  }
  const toolHelp = el('p', { class: 'muted', testid: 'tool-help' });
  const rackBox = el('details', { class: 'box' });
  rackBox.append(el('summary', {}, '추가할 랙'));
  const rackType = el('select', { testid: 'new-rack-type' });
  for (const t of RACK_TYPES) rackType.append(el('option', { value: t }, t));
  const num = (testid, value, min = '0.05') => el('input', { type: 'number', min, step: '0.1', value, testid });
  const newWidth = num('new-width', String(RACK_DEFAULTS.width)), newDepth = num('new-depth', String(RACK_DEFAULTS.depth)), newHeight = num('new-height', String(RACK_DEFAULTS.height));
  const newUnit = el('input', { value: RACK_DEFAULTS.unit, maxlength: '20', testid: 'new-unit' });
  const wrap = (text, input) => { const l = el('label', { class: 'field' }, text); l.append(input); return l; };
  rackBox.append(wrap('종류', rackType), wrap('폭 (m)', newWidth), wrap('깊이 (m)', newDepth), wrap('높이 (m)', newHeight), wrap('단위', newUnit));
  const editRow = el('div', { class: 'tool-group', role: 'group', 'aria-label': '선택 객체 편집' });
  const rotateBtn = button('rotate', '↻ 90° 회전'), duplicateBtn = button('duplicate', '⧉ 복제'), deleteBtn = button('delete', '✕ 삭제');
  editRow.append(rotateBtn, duplicateBtn, deleteBtn);
  const groupRow = el('div', { class: 'tool-group', role: 'group', 'aria-label': '여러 랙 정렬' });
  const alignXBtn = button('align-x', '⇤ 왼쪽 정렬'), alignYBtn = button('align-y', '⤒ 위쪽 정렬'), distributeBtn = button('distribute', '↔ 간격 배치');
  const distributeGap = el('input', { type: 'number', min: '0', step: '0.001', value: '0.3', testid: 'distribute-gap', 'aria-label': '간격 배치 간격(m)', class: 'mini-input' });
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
  const zoomRow = el('div', { class: 'tool-group', role: 'group', 'aria-label': '확대' });
  const zoomOut = button('zoom-out', '－', { 'aria-label': '축소' });
  const zoomLabel = el('output', { class: 'zoom-label', testid: 'zoom-label' });
  const zoomIn = button('zoom-in', '＋', { 'aria-label': '확대' });
  const fit = button('fit', '전체 보기');
  zoomRow.append(zoomOut, zoomLabel, zoomIn, fit);
  const zoomRow2 = el('div', { class: 'tool-group' });
  const zoom50 = button('zoom-50', '50%');
  const zoom200 = button('zoom-200', '200%');
  const focus = button('focus-selection', '선택 영역 보기');
  zoomRow2.append(zoom50, zoom200, focus);
  const lockLabel = el('label', { class: 'check' });
  const centerLock = el('input', { type: 'checkbox', testid: 'center-lock' });
  lockLabel.append(centerLock, ' 중심 고정');
  const wheelLabel = el('label', { class: 'field' }, '마우스 휠 확대 감도');
  const wheelSelect = el('select', { testid: 'wheel-sensitivity' });
  for (const [v, t] of Object.entries(WHEEL_LABELS)) wheelSelect.append(el('option', { value: v }, t));
  wheelLabel.append(wheelSelect);
  const wheelReset = button('wheel-reset', '휠 감도 기본값');
  const wheelStatus = el('p', { class: 'muted', testid: 'wheel-status', role: 'status' });
  const labelSelect = (testid, text, options) => {
    const sel = el('select', { testid });
    for (const [v, t] of options) sel.append(el('option', { value: v }, t));
    return wrap(text, sel);
  };
  const labelMode = labelSelect('label-mode', '랙 텍스트', [['rack-code', '랙 번호만'], ['occupancy', '랙 번호 + 실제 적재율'], ['detail', '상세 정보'], ['minimal', '최소 표시 · 선택 랙']]);
  const labelLayout = labelSelect('label-layout', 'ZONE·번호 배치', [['auto', '자동 · 좁으면 두 줄'], ['stacked', '항상 두 줄'], ['inline', '한 줄'], ['minimal', '최소 · 선택 랙']]);
  const labelPadding = labelSelect('label-padding', '랙 번호 형식', [['0', '5'], ['2', '05'], ['3', '005']]);
  const labelStatus = el('p', { class: 'muted', testid: 'label-status' });
  const vizMode = labelSelect('viz-mode', '도면 색상 기준', [['inventory', '실제 재고 적재율'], ['height', '높이 활용률'], ['registered', '위치 등록 현황'], ['management', '품목별 관리 지표']]);
  const heightPolicy = labelSelect('height-policy', '랙 높이 집계 정책', [['weightedMax', '선반별 최대 높이 / 높이 가중평균'], ['meanMax', '선반별 최대 높이 비율 / 단순평균'], ['max', '등록 자재 중 최대 높이 비율']]);
  const colorMode = labelSelect('color-mode', '색상 표시', [['data', '데이터 기반'], ['custom', '사용자 지정 색상']]);
  const thr = (testid, text, min, max) => wrap(text, el('input', { type: 'number', testid, min, max }));
  const thrLow = thr('threshold-low', '보통 시작 (%)', 1, 98), thrHigh = thr('threshold-high', '주의 시작 (%)', 2, 100);
  const colorInputs = Object.entries({ empty: '빈 랙', low: '여유', mid: '보통', high: '주의', over: '초과', unknown: '정보 없음' }).map(([k, t]) => [k, wrap(t, el('input', { type: 'color', testid: 'color-' + k }))]);
  const applyColorsBtn = button('apply-colors', '색상 기준 적용');
  const resetScope = labelSelect('reset-scope', '복원 범위', [['ui', 'UI 기본 테마만 복원'], ['occupancy', '적재율 기본 색상·기준만 복원'], ['all', '모든 색상 설정 복원 (양쪽 객체 지정색 포함)']]);
  const resetBtn = button('reset-colors', '기본 색상 복원');
  left.append(el('h2', {}, '색상'), vizMode, heightPolicy, thrLow, thrHigh, ...colorInputs.map((c) => c[1]), applyColorsBtn, colorMode, resetScope, resetBtn);
  left.append(el('h2', {}, '도구'), tools, addTools, toolHelp, rackBox, el('h2', {}, '편집'), editRow, groupRow, allowLabel, snapLabel, wrap('스냅 간격 (m)', snapStep), wrap('방향키 이동 (m) · Shift는 고속', keyStep), el('h2', {}, '화면'), zoomRow, zoomRow2, lockLabel, wheelLabel, wheelReset, wheelStatus, el('h2', {}, '라벨'), labelMode, labelLayout, labelPadding, labelStatus);

  // 가운데: 도면
  const canvasWrap = el('div', { class: 'canvas-wrap', testid: 'canvas-wrap' });
  // HTML 파서가 SVG 이름공간을 붙인다(산출물에 외부 URL 문자열을 넣지 않기 위해 createElementNS를 쓰지 않음).
  canvasWrap.innerHTML = '<svg id="plan" role="img" aria-label="창고 배치 도면" data-testid="plan"></svg>';
  const plan = canvasWrap.firstElementChild;
  const hint = el('p', { class: 'canvas-hint', testid: 'canvas-hint' }, '원점: 좌상단 · X → / Y ↓ · 단위 m');
  const legendBox = el('div', { class: 'legend', testid: 'legend' });
  canvasWrap.append(hint, legendBox);

  // 오른쪽: 선택·요약
  const right = el('aside', { class: 'side right', 'aria-label': '선택 정보' });
  const selStatus = el('p', { class: 'sel-status', testid: 'selection-status' });
  const selList = el('ul', { class: 'sel-list', testid: 'selection-list' });
  const selWarn = el('div', { testid: 'selection-warnings' });
  const inspector = el('div', { class: 'inspector', testid: 'inspector' });
  const summary = el('p', { class: 'summary', testid: 'summary' });
  const note = el('p', { class: 'muted' }, '재구축 진행 중: 객체 추가·이동·속성 편집까지 포함되었습니다. 크기 조절 핸들·정렬은 다음 단계입니다. 이 PC·브라우저 저장이며 클라우드 동기화가 아닙니다.');
  const section = (title, testid, open = true) => {
    const d = el('details', { class: 'side-section', testid });
    if (open) d.open = true;
    d.append(el('summary', {}, title));
    const body = el('div', { class: 'section-body' });
    d.append(body);
    return [d, body];
  };
  const [statsBox, statsBody] = section('배치 통계', 'stats-section');
  const [warnBox, warnBody] = section('공간 경고', 'warnings-section');
  const [listBox, listBody] = section('랙 목록', 'racklist-section');
  const [invBox, invBody] = section('재고 기록', 'inventory-section', false);
  const [snapBox, snapBody] = section('배치 이력', 'snapshots-section', false);
  const detailBtn = button('open-detail', '▤ 랙 상세(더블클릭)');
  right.append(el('h2', {}, '선택'), selStatus, selList, detailBtn, selWarn, inspector, statsBox, warnBox, listBox, invBox, snapBox, el('h2', {}, '요약'), summary, note);

  const main = el('div', { class: 'workspace' });
  main.append(left, canvasWrap, right);
  const toast = el('p', { class: 'toast', testid: 'toast', role: 'alert', hidden: '' });
  app.append(header, notice, main, toast);
  root.replaceChildren(app);
  return {
    name, status, detail, notice, saveBtn, overwriteBtn, replaceBtn, undoBtn, redoBtn, exportBtn, summary,
    toolSelect, toolPan, toolHelp, zoomOut, zoomIn, zoomLabel, fit, zoom50, zoom200, focus, centerLock,
    labelMode: labelMode.querySelector('select'), labelLayout: labelLayout.querySelector('select'), labelPadding: labelPadding.querySelector('select'), labelStatus,
    vizMode: vizMode.querySelector('select'), heightPolicy: heightPolicy.querySelector('select'), colorMode: colorMode.querySelector('select'), resetScope: resetScope.querySelector('select'), resetBtn, applyColorsBtn,
    thrLow: thrLow.querySelector('input'), thrHigh: thrHigh.querySelector('input'), colorInputs: Object.fromEntries(colorInputs.map(([k, l]) => [k, l.querySelector('input')])),
    wheelSelect, wheelReset, wheelStatus, canvasWrap, plan, hint, selStatus, selList, selWarn,
    scenBefore, scenAfter, lockBtn, leftToggle, rightToggle, main, statsBody, warnBody, listBody, legendBox, invBody, snapBody, detailBtn, excelBtn, alignXBtn, alignYBtn, distributeBtn, distributeGap,
    toolButtons, rackType, newWidth, newDepth, newHeight, newUnit, rotateBtn, duplicateBtn, deleteBtn, allowWarnings, snapOn, snapStep, keyStep, inspector, toast,
  };
}

async function start() {
  const ui = renderShell(document.getElementById('app'));
  const store = createProjectStore({ storage: window.localStorage, validate: projectValidator });
  const session = createSession({ store });

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
  const panels = createPanels({ stats: ui.statsBody, warnings: ui.warnBody, list: ui.listBody, legend: ui.legendBox }, {
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
    saveOrder: (order) => pref({ rackInfographic: { shelfOrder: order } }),
    confirmPhysical: (id) => command(PHYSICAL_COMMAND, confirmPhysical(id, new Date().toISOString(), session.nextId()), PHYSICAL_COMMAND).then(() => rackDetail.refresh()),
    download,
    toast: (t) => showToast(t),
  });
  const records = createRecordsPanel({ inventory: ui.invBody, layouts: ui.snapBody }, {
    getProject: () => project(),
    today: () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10),
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
  const excelDialog = createExcelDialog({ toast: (t) => showToast(t), getProject: () => project(), nextId: session.nextId, applyProposal: (pr, ctx) => session.apply(EXCEL_APPLY_COMMAND, (p, opts) => applyExcelProposal(p, pr, ctx, opts)) });
  const groupDialog = createGroupDialog({
    getProject: () => project(),
    getSelection: () => selectedRackIds(),
    toast: (t) => showToast(t),
    apply: (label, mutate, overrideAllow) => run(label, (p, ctx) => applyCommand(p, mutate, { command: label, selection: [...selected], overrideAllow, ...ctx })),
  });

  const project = () => session.state.project;
  const layout = () => project().scenarios[project().settings.scenario];
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

  function renderPlan(force = false) {
    const p = project();
    if (!p) return;
    const l = layout();
    const u = view ? pixelsPerMeter(view, l.warehouse, size()) : 20;
    const key = [l, p.settings, p.theme, p.precision, p.rackLabels, p.scenarioMeta, p.panels, [...selected].join('\u0000'), tool, marquee && JSON.stringify(marquee), preview];
    const same = !force && sceneKey && key.every((k, i) => k === sceneKey[i]);
    if (same && u === sceneScale) return;
    // 확대율만 바뀌면 라벨 크기·배치(화면 px 기준)만 다시 계산하고 선택·패널은 그대로 둔다.
    const scaleOnly = same;
    sceneKey = key;
    sceneScale = u;
    const r = buildScene(preview?.layout ?? l, p, { selected, tool, marquee, guides: preview?.guides, pixelsPerMeter: u, resize: isLocked(p) ? null : { live: gesture?.kind === 'resize' && gesture.moved, invalidText: preview?.invalidText }, filter: p.panels.view, warnings: scaleOnly ? sceneWarnings : undefined });
    sceneWarnings = r.warnings;
    ui.plan.innerHTML = r.svg;
    ui.labelStatus.textContent = labelStatusText(r.labelHidden);
    if (scaleOnly) return;
    renderSelection();
    if (!preview) {
      panels.render({ layout: l, project: p, selected, warnings: r.warnings });
      records.render();
      rackDetail.refresh();
    }
  }

  function renderSelection() {
    const os = layout().objects.filter((o) => selected.has(o.id));
    ui.selStatus.textContent = os.length ? `${os.length}개 선택` : '선택 없음';
    ui.selList.replaceChildren(...os.slice(0, 50).map((o) => el('li', {}, `${o.code} · ${o.kind === 'rack' ? '랙' : o.kind}`)));
    if (os.length > 50) ui.selList.append(el('li', { class: 'muted' }, `외 ${os.length - 50}개`));
    const ws = sceneWarnings.filter((w) => w.ids.some((id) => selected.has(id)));
    ui.selWarn.innerHTML = !os.length ? '<p class="muted">도면에서 객체를 선택하세요. 좌표는 회전 전 좌상단 기준입니다.</p>'
      : ws.length ? `<div class="warnbox">${ws.map((w) => esc(w.text)).join('<br>')}</div>` : '<p class="info">선택 객체에 공간 경고가 없습니다.</p>';
    ui.focus.disabled = !os.length;
    const locked = isLocked(project());
    for (const b of [ui.rotateBtn, ui.duplicateBtn, ui.deleteBtn]) b.disabled = !os.length || locked;
    const rackCount = os.filter((o) => o.kind === 'rack').length;
    ui.detailBtn.disabled = !(os.length === 1 && os[0].kind === 'rack');
    for (const b of [ui.alignXBtn, ui.alignYBtn, ui.distributeBtn]) b.disabled = rackCount < 2 || locked;
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

  // ── 세션 상태 → 화면 ──
  const paint = (s) => {
    ui.status.textContent = STATUS_TEXT[s.status] ?? s.status;
    ui.status.dataset.state = s.status;
    ui.detail.textContent = s.error ? `${ERROR_HINT[s.error.code] ?? ''} (${s.error.code}${s.error.stage ? ' / ' + s.error.stage : ''}) ${s.error.message}` : s.project?.persistence?.lastSavedAt ? `마지막 확인 저장: ${new Date(s.project.persistence.lastSavedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} · 리비전 ${s.project.persistence.revision}` : '확인된 저장 없음';
    ui.notice.textContent = s.notice;
    ui.notice.hidden = !s.notice;
    if (s.project && document.activeElement !== ui.name) ui.name.value = s.project.metadata.name;
    const racks = (k) => s.project?.scenarios[k].objects.filter((o) => o.kind === 'rack').length ?? 0;
    ui.summary.textContent = s.project ? `현재 ${s.project.settings.scenario.toUpperCase()} · BEFORE 랙 ${racks('before')}개 · AFTER 랙 ${racks('after')}개 · 출처 ${s.source}` : '';
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
    ui.leftToggle.textContent = pn.leftOpen ? '◧ 도구 접기' : '◧ 도구 펼치기';
    ui.rightToggle.textContent = pn.rightOpen ? '◨ 정보 접기' : '◨ 정보 펼치기';
    ui.scenBefore.classList.toggle('active', s.project.settings.scenario === 'before');
    ui.scenAfter.classList.toggle('active', s.project.settings.scenario === 'after');
    ui.lockBtn.textContent = s.project.scenarioMeta.before.locked ? '🔒 BEFORE 잠금 해제' : '🔓 BEFORE 잠그기';
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
  };
  session.subscribe(paint);

  const guard = async (fn) => {
    try {
      await fn();
    } catch (e) {
      ui.detail.textContent = `편집을 적용하지 않았습니다: ${e.message}`;
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
  ui.undoBtn.addEventListener('click', () => guard(() => session.undo()));
  ui.redoBtn.addEventListener('click', () => guard(() => session.redo()));
  ui.exportBtn.addEventListener('click', () => {
    const p = project();
    if (p) download(`warehouse_project_v${SCHEMA_VERSION.replaceAll('.', '_')}.json`, JSON.stringify(p, null, 2));
  });

  // ── 화면 명령(기준본 fit/zoomIn/zoomOut/mZoom50/mZoom200/mCenterLock/focusSelection) ──
  const W = () => layout().warehouse;
  for (const b of ui.toolButtons) b.addEventListener('click', () => setTool(b.dataset.tool));
  ui.rotateBtn.addEventListener('click', () => rotateSelected());
  ui.excelBtn.addEventListener('click', () => excelDialog.open());
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
  ui.resetBtn.addEventListener('click', () => {
    const scope = ui.resetScope.value;
    if (scope === 'all' && !confirm('색상 설정만 변경됩니다. BEFORE·AFTER의 사용자 지정 객체색까지 기본값으로 복원합니까? 창고 데이터는 유지됩니다.')) return;
    colorEdit('기본 색상 복원', (d) => resetColors(d, scope));
  });
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
      guard(() => (e.shiftKey ? session.redo() : session.undo()));
    } else if (mod && k === 'y') {
      e.preventDefault();
      guard(() => session.redo());
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
