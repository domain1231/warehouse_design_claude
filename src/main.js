// 앱 진입점. Phase 1b-2: 저장소·프로젝트 모델·편집 세션을 화면에 연결한다.
// CAD 도면은 Phase 2–3에서 추가한다. 이 화면은 저장 상태와 기본 편집(이름)·실행취소만 제공한다.
// __APP_VERSION__ / __SCHEMA_VERSION__ 은 빌드 시 package.json에서 주입된다.
import { createSession, projectValidator } from './core/session.js';
import { createProjectStore } from './persistence/storage.js';

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

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'testid') node.dataset.testid = v;
    else node.setAttribute(k, v);
  }
  if (text !== undefined) node.textContent = text;
  return node;
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderShell(root) {
  const shell = el('section', { class: 'shell' });
  const title = el('h1', {}, 'Warehouse Layout Designer');
  const versions = el('p', { class: 'versions', testid: 'versions' }, `앱 v${APP_VERSION} · 프로젝트 스키마 ${SCHEMA_VERSION}`);
  const status = el('p', { class: 'status-badge', testid: 'status', role: 'status' });
  const detail = el('p', { class: 'status-detail', testid: 'status-detail' });
  const notice = el('p', { class: 'notice', testid: 'notice' });

  const label = el('label', { class: 'field' }, '프로젝트 이름');
  const name = el('input', { type: 'text', maxlength: '1000', testid: 'name' });
  label.append(name);

  const actions = el('div', { class: 'actions' });
  const saveBtn = el('button', { type: 'button', testid: 'save' }, '프로젝트 저장');
  const overwriteBtn = el('button', { type: 'button', testid: 'overwrite', hidden: '' }, '이 탭 내용으로 덮어쓰기');
  const replaceBtn = el('button', { type: 'button', testid: 'replace-corrupt', hidden: '' }, '손상 저장본 교체');
  const undoBtn = el('button', { type: 'button', testid: 'undo' }, '실행취소');
  const redoBtn = el('button', { type: 'button', testid: 'redo' }, '다시 실행');
  const exportBtn = el('button', { type: 'button', testid: 'export' }, 'JSON 내보내기');
  actions.append(saveBtn, overwriteBtn, replaceBtn, undoBtn, redoBtn, exportBtn);

  const summary = el('p', { class: 'summary', testid: 'summary' });
  const note = el('p', { class: 'muted' }, '재구축 진행 중: 도면 편집은 아직 포함되지 않았습니다. 이 PC·브라우저 저장이며 클라우드 동기화가 아닙니다.');

  shell.append(title, versions, status, detail, notice, label, actions, summary, note);
  root.replaceChildren(shell);
  return { name, status, detail, notice, saveBtn, overwriteBtn, replaceBtn, undoBtn, redoBtn, exportBtn, summary };
}

async function start() {
  const ui = renderShell(document.getElementById('app'));
  const store = createProjectStore({ storage: window.localStorage, validate: projectValidator });
  const session = createSession({ store });

  const paint = (s) => {
    ui.status.textContent = STATUS_TEXT[s.status] ?? s.status;
    ui.status.dataset.state = s.status;
    ui.detail.textContent = s.error ? `${ERROR_HINT[s.error.code] ?? ''} (${s.error.code}${s.error.stage ? ' / ' + s.error.stage : ''}) ${s.error.message}` : s.project?.persistence?.lastSavedAt ? `마지막 확인 저장: ${new Date(s.project.persistence.lastSavedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} · 리비전 ${s.project.persistence.revision}` : '확인된 저장 없음';
    ui.notice.textContent = s.notice;
    ui.notice.hidden = !s.notice;
    if (s.project && document.activeElement !== ui.name) ui.name.value = s.project.metadata.name;
    const racks = (k) => s.project?.scenarios[k].objects.filter((o) => o.kind === 'rack').length ?? 0;
    ui.summary.textContent = s.project ? `BEFORE 랙 ${racks('before')}개 · AFTER 랙 ${racks('after')}개 · 출처 ${s.source}` : '';
    ui.overwriteBtn.hidden = s.error?.code !== 'CONFLICT';
    ui.replaceBtn.hidden = !s.corrupt;
    ui.undoBtn.disabled = !s.canUndo || s.status === 'saving';
    ui.redoBtn.disabled = !s.canRedo || s.status === 'saving';
    ui.saveBtn.disabled = s.status === 'saving' || s.status === 'loading';
  };
  session.subscribe(paint);

  const guard = async (fn) => {
    try {
      await fn();
    } catch (e) {
      ui.detail.textContent = `편집을 적용하지 않았습니다: ${e.message}`;
    }
  };

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
    const p = session.state.project;
    if (p) download(`warehouse_project_v${SCHEMA_VERSION.replaceAll('.', '_')}.json`, JSON.stringify(p, null, 2));
  });
  window.addEventListener('storage', (event) => session.handleStorageEvent(event));
  window.addEventListener('beforeunload', (event) => {
    const s = session.state.status;
    if (s === 'unsaved' || s === 'error' || s === 'saving') event.preventDefault();
  });

  await session.init();
  window.__warehouseSession = session; // E2E 검사용 읽기 진입점
}

start().catch((e) => {
  document.getElementById('app').textContent = `시작 실패: ${e.message}`;
});
