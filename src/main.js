// 앱 진입점. 저장소·프로젝트 모델·편집 세션(Phase 1)과 SVG 도면 보기·선택(Phase 3a)을 화면에 연결한다.
// 계산은 src/cad/*(카메라·선택·도면 문자열)에 있고, 이 파일은 DOM 이벤트를 그 함수들에 연결만 한다.
// __APP_VERSION__ / __SCHEMA_VERSION__ 은 빌드 시 package.json에서 주입된다.
import { createSession, projectValidator } from './core/session.js';
import { createProjectStore } from './persistence/storage.js';
import { formatNumber as fmt } from './core/format.js';
import { viewBox, zoomBy, panFrom, pinchFrom, centerView, focusBox, withFitScale, wheelPixels, wheelFactor, createWheelTracker } from './cad/camera.js';
import { buildScene, selectionBox, esc } from './cad/scene.js';
import { clickSelect, marqueeSelect, restoreSelection } from './cad/selection.js';
import { loadWheelMode, saveWheelMode, WHEEL_LABELS, WHEEL_STATUS_TEXT } from './cad/wheel-settings.js';

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
  select: '클릭 선택 · Shift 추가 · Ctrl/⌘ 토글 · 빈 곳 드래그 영역 선택',
  pan: '드래그하여 화면 이동',
};

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

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
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
  actions.append(saveBtn, overwriteBtn, replaceBtn, undoBtn, redoBtn, exportBtn);
  header.append(brand, label, statusBox, actions);
  const notice = el('p', { class: 'notice', testid: 'notice' });

  // 왼쪽: 도구·화면
  const left = el('aside', { class: 'side left', 'aria-label': '도구와 화면' });
  const tools = el('div', { class: 'tool-group', role: 'group', 'aria-label': '도구' });
  const toolSelect = button('tool-select', '선택', { 'data-tool': 'select' });
  const toolPan = button('tool-pan', '화면 이동', { 'data-tool': 'pan' });
  tools.append(toolSelect, toolPan);
  const toolHelp = el('p', { class: 'muted', testid: 'tool-help' });
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
  left.append(el('h2', {}, '도구'), tools, toolHelp, el('h2', {}, '화면'), zoomRow, zoomRow2, lockLabel, wheelLabel, wheelReset, wheelStatus);

  // 가운데: 도면
  const canvasWrap = el('div', { class: 'canvas-wrap', testid: 'canvas-wrap' });
  // HTML 파서가 SVG 이름공간을 붙인다(산출물에 외부 URL 문자열을 넣지 않기 위해 createElementNS를 쓰지 않음).
  canvasWrap.innerHTML = '<svg id="plan" role="img" aria-label="창고 배치 도면" data-testid="plan"></svg>';
  const plan = canvasWrap.firstElementChild;
  const hint = el('p', { class: 'canvas-hint', testid: 'canvas-hint' }, '원점: 좌상단 · X → / Y ↓ · 단위 m');
  canvasWrap.append(hint);

  // 오른쪽: 선택·요약
  const right = el('aside', { class: 'side right', 'aria-label': '선택 정보' });
  const selStatus = el('p', { class: 'sel-status', testid: 'selection-status' });
  const selList = el('ul', { class: 'sel-list', testid: 'selection-list' });
  const selWarn = el('div', { testid: 'selection-warnings' });
  const summary = el('p', { class: 'summary', testid: 'summary' });
  const note = el('p', { class: 'muted' }, '재구축 진행 중: 도면 보기·선택까지 포함되었고 객체 편집은 아직 없습니다. 이 PC·브라우저 저장이며 클라우드 동기화가 아닙니다.');
  right.append(el('h2', {}, '선택'), selStatus, selList, selWarn, el('h2', {}, '요약'), summary, note);

  const main = el('div', { class: 'workspace' });
  main.append(left, canvasWrap, right);
  app.append(header, notice, main);
  root.replaceChildren(app);
  return {
    name, status, detail, notice, saveBtn, overwriteBtn, replaceBtn, undoBtn, redoBtn, exportBtn, summary,
    toolSelect, toolPan, toolHelp, zoomOut, zoomIn, zoomLabel, fit, zoom50, zoom200, focus, centerLock,
    wheelSelect, wheelReset, wheelStatus, canvasWrap, plan, hint, selStatus, selList, selWarn,
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
  let sceneWarnings = [];
  const tracker = createWheelTracker();
  const wheel = { pending: 0, clientX: 0, clientY: 0, frame: 0 };
  const touches = new Map();
  let wheelMode = loadWheelMode(window.localStorage);

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
  }

  function renderPlan(force = false) {
    const p = project();
    if (!p) return;
    const l = layout();
    const key = [l, p.settings, p.theme, [...selected].join('\u0000'), tool, marquee && JSON.stringify(marquee)];
    if (!force && sceneKey && key.every((k, i) => k === sceneKey[i])) return;
    sceneKey = key;
    const r = buildScene(l, p, { selected, tool, marquee });
    sceneWarnings = r.warnings;
    ui.plan.innerHTML = r.svg;
    renderSelection();
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
  }

  function setTool(t) {
    tool = t;
    for (const b of [ui.toolSelect, ui.toolPan]) b.classList.toggle('active', b.dataset.tool === t);
    ui.toolHelp.textContent = TOOL_HELP[t];
    ui.plan.style.cursor = t === 'pan' ? 'grab' : 'default';
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
    if (s.project !== lastProject) {
      // 프로젝트를 처음 불러오거나 실행취소 등으로 바뀌면 저장된 선택·카메라를 따른다(조작 중이면 조작이 우선).
      const ids = new Set(s.project.scenarios[s.project.settings.scenario].objects.map((o) => o.id));
      selected = lastProject === null ? restoreSelection(s.project) : new Set([...selected].filter((id) => ids.has(id)));
      if (!gesture) view = withFitScale(s.project.viewport, s.project.scenarios[s.project.settings.scenario].warehouse, size());
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
  ui.toolSelect.addEventListener('click', () => setTool('select'));
  ui.toolPan.addEventListener('click', () => setTool('pan'));
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
    }
  }
  ui.plan.addEventListener('pointerdown', (e) => {
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
    capture(e);
    if (tool === 'pan') {
      gesture = { kind: 'pan', pointer: e.pointerId, start: { x: e.clientX, y: e.clientY }, viewport: view, matrix: ui.plan.getScreenCTM().inverse() };
      return;
    }
    const hit = e.target.closest?.('[data-id]')?.dataset.id;
    if (hit) {
      commitSelection(clickSelect(selected, hit, { toggle: e.ctrlKey || e.metaKey, add: e.shiftKey }));
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
    if (cancel) return abortGesture();
    gesture = null;
    if (g.kind === 'pan') commitView(view, 0);
    else if (g.kind === 'marquee') {
      marquee = null;
      commitSelection(selected);
    }
  };
  ui.plan.addEventListener('pointerup', (e) => finish(e, false));
  ui.plan.addEventListener('pointercancel', (e) => finish(e, true));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && gesture) abortGesture();
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
  window.__warehouseView = { get viewport() { return view; }, get selected() { return [...selected]; }, get wheelMode() { return wheelMode.mode; } };
}

start().catch((e) => {
  document.getElementById('app').textContent = `시작 실패: ${e.message}`;
});
