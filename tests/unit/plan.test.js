// 선택 규칙·휠 감도 저장·도면 문자열·세션 화면 상태
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clickSelect, marqueeSelect, restoreSelection } from '../../src/cad/selection.js';
import { loadWheelMode, saveWheelMode, WHEEL_KEY, LEGACY_WHEEL_KEY } from '../../src/cad/wheel-settings.js';
import { buildScene, loadState } from '../../src/cad/scene.js';
import { createProject, createObject, validateProject } from '../../src/core/project.js';
import { createIdGenerator } from '../../src/core/ids.js';
import { createSession, projectValidator } from '../../src/core/session.js';
import { createProjectStore } from '../../src/persistence/storage.js';

const rack = (id, x, y, extra = {}) => ({ id, kind: 'rack', code: id, x, y, width: 1, depth: 0.5, rotation: 0, ...extra });

test('클릭 선택: 단독·선택 유지·Shift 추가·Ctrl 토글, 입력 집합은 바꾸지 않는다', () => {
  const s = new Set(['a', 'b']);
  assert.deepEqual([...clickSelect(s, 'c')], ['c']);
  assert.deepEqual([...clickSelect(s, 'a')], ['a', 'b']);
  assert.deepEqual([...clickSelect(s, 'c', { add: true })], ['a', 'b', 'c']);
  assert.deepEqual([...clickSelect(s, 'a', { toggle: true })], ['b']);
  assert.deepEqual([...s], ['a', 'b']);
});

test('영역 선택: 랙만, 겹침/포함 규칙, 클릭 크기 사각형은 빈 선택, add면 이전 선택 유지', () => {
  const os = [rack('R1', 0, 0), rack('R2', 2, 0), rack('R3', 0.5, 0, { rotation: 45 }), { ...rack('W1', 0, 0), kind: 'wall' }];
  assert.deepEqual([...marqueeSelect(os, { x: -0.1, y: -0.1 }, { x: 1.2, y: 0.7 })].sort(), ['R1', 'R3']);
  assert.deepEqual([...marqueeSelect(os, { x: -0.1, y: -0.1 }, { x: 1.2, y: 0.7 }, { rule: 'contain' })], ['R1']);
  assert.deepEqual([...marqueeSelect(os, { x: 0.5, y: 0.2 }, { x: 0.5, y: 0.2 })], []);
  assert.deepEqual([...marqueeSelect(os, { x: 1.9, y: 0 }, { x: 3.1, y: 0.6 }, { previous: ['R1'], add: true })], ['R1', 'R2']);
  // 경계 접촉: 사각형 끝이 랙 변과 정확히 맞닿는 경우는 포함 규칙에서 포함
  assert.deepEqual([...marqueeSelect(os, { x: 2, y: 0 }, { x: 3, y: 0.5 }, { rule: 'contain' })], ['R2']);
});

test('저장된 선택 복원: 같은 배치에서 저장한 것만, 없는 ID 제거', () => {
  const p = validateProject(createProject({ sample: true, nextId: createIdGenerator({ seed: 'sel' }) }));
  const id = p.scenarios.after.objects[0].id;
  p.editing.selectedRackIds = [id, 'missing'];
  assert.deepEqual([...restoreSelection(p)], []); // selectionScenario 없음
  p.editing.selectionScenario = 'after';
  assert.deepEqual([...restoreSelection(p)], [id]);
  p.editing.selectionScenario = 'before';
  assert.deepEqual([...restoreSelection(p)], []);
});

const mem = (init = {}) => {
  const d = new Map(Object.entries(init));
  return { d, getItem: (k) => (d.has(k) ? d.get(k) : null), setItem: (k, v) => d.set(k, String(v)), removeItem: (k) => d.delete(k) };
};

test('휠 감도: 기본 low, 저장 후 읽기 확인, 손상 값은 안전한 기본값, 기준본 키는 읽기만', () => {
  assert.deepEqual(loadWheelMode(mem()), { mode: 'low', status: 'default' });
  const s = mem();
  assert.deepEqual(saveWheelMode(s, 'high'), { mode: 'high', saved: true });
  assert.deepEqual(loadWheelMode(s), { mode: 'high', status: 'loaded' });
  assert.deepEqual(loadWheelMode(mem({ [WHEEL_KEY]: 'turbo' })), { mode: 'low', status: 'invalid' });
  const legacy = mem({ [LEGACY_WHEEL_KEY]: 'medium' });
  assert.deepEqual(loadWheelMode(legacy), { mode: 'medium', status: 'legacy' });
  saveWheelMode(legacy, 'low');
  assert.equal(legacy.d.get(LEGACY_WHEEL_KEY), 'medium');
  assert.deepEqual(saveWheelMode({ getItem: () => null, setItem() { throw new Error('quota'); } }, 'medium'), { mode: 'medium', saved: false });
  assert.deepEqual(loadWheelMode({ getItem() { throw new Error('blocked'); } }), { mode: 'low', status: 'invalid' });
});

function sceneProject() {
  const nextId = createIdGenerator({ seed: 'sc' });
  const p = validateProject(createProject({ sample: false, nextId }));
  const l = p.scenarios.after;
  l.warehouse = { width: 10, height: 6, ceiling: 3 };
  l.objects = [
    createObject('rack', 1, 1, 1.2, 0.6, { id: 'R"1', code: 'R<1>', capacity: 10, quantity: 5 }, { nextId }),
    createObject('rack', 1.5, 1.2, 1.2, 0.6, { id: 'R2', code: 'R2' }, { nextId }),
    createObject('aisle', 0, 3, 10, 1.5, { id: 'A1', code: 'A1' }, { nextId }),
    createObject('door', 8, 0, 1.2, 1.2, { id: 'D1', code: 'D1' }, { nextId }),
  ];
  return validateProject(p);
}

test('도면: 구역→구조물→랙 순서, 특수문자 이스케이프, 경고 객체 빨간 테두리·⚠, 선택 테두리', () => {
  const p = sceneProject();
  const { svg, warnings } = buildScene(p.scenarios.after, p, { selected: new Set(['R2']) });
  const order = [...svg.matchAll(/<g data-id="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ['A1', 'D1', 'R&quot;1', 'R2']);
  assert.match(svg, /R&lt;1&gt;/);
  assert.ok(warnings.some((w) => w.ids.includes('R2')));
  assert.match(svg, /data-id="R2"[^]*?stroke="#ff7885" stroke-width="0.075"/); // 경고가 선택보다 우선, 선택이면 굵게
  assert.ok((svg.match(/⚠/g) ?? []).length >= 2);
  assert.match(svg, /<path d="M 8 0 l 1.2 0 A 1.2 1.2 0 0 1 8 1.2 Z"/); // 출입문 열림(in-right 기본: 왼쪽 경첩)
});

test('도면: 격자 끄기, 적재 상태 색, 사용자 지정 색, 영역 선택 사각형', () => {
  const p = sceneProject();
  p.settings.gridOn = false;
  let { svg } = buildScene(p.scenarios.after, p, { marquee: { a: { x: 2, y: 2 }, b: { x: 1, y: 1 } } });
  assert.doesNotMatch(svg, /url\(#pgrid\)/);
  assert.match(svg, /<rect id="mSelectionBox" class="m-overlay" pointer-events="none" x="1" y="1" width="1" height="1"/);
  assert.equal(loadState(p.scenarios.after.objects[0], p.settings), 'mid');
  assert.match(svg, new RegExp(`fill="${p.settings.colors.mid}"`));
  p.theme.colorMode = 'custom';
  p.theme.objectColors.after.R2 = '#123456';
  ({ svg } = buildScene(p.scenarios.after, p));
  assert.match(svg, /data-id="R2"[^]*?fill="#123456"/);
});

const makeSession = (storage) => createSession({ store: createProjectStore({ storage, validate: projectValidator }), nextId: createIdGenerator({ seed: 'v' }), today: () => '2026-11-15' });

test('세션 화면 상태: 카메라·선택은 저장되지만 실행취소 기록에 넣지 않는다', async () => {
  const storage = mem();
  const s = makeSession(storage);
  await s.init();
  await s.edit('이름', (p) => { p.metadata.name = 'A'; });
  const id = s.state.project.scenarios.after.objects[0].id;
  await s.setView({ viewport: { zoom: 2, panX: 1, panY: -1, centerLocked: false, fitScale: 40 }, selection: [id] }, { delay: 0 });
  assert.equal(s.state.status, 'saved');
  const again = await makeSession(storage).init();
  assert.deepEqual(again.project.viewport, { zoom: 2, panX: 1, panY: -1, centerLocked: false, fitScale: 40 });
  assert.deepEqual(again.project.editing.selectedRackIds, [id]);
  assert.equal(again.project.editing.selectionScenario, 'after');
  await s.undo();
  assert.equal(s.state.project.metadata.name, '자재창고 배치 검토 · 샘플');
  assert.equal(s.state.project.viewport.zoom, 2); // 실행취소는 화면 상태를 되돌리지 않는다
  assert.deepEqual(s.state.project.editing.selectedRackIds, [id]);
});

test('세션 화면 상태: 범위 제한, 같은 값은 무시, 지연 저장은 하나로 모이고 flushView로 즉시 저장', async () => {
  const storage = mem();
  const s = makeSession(storage);
  await s.init();
  await s.save();
  const rev = s.state.project.persistence.revision;
  assert.equal(s.setView({ viewport: { zoom: 99, panX: 9e9, panY: -9e9, centerLocked: false } }, { delay: 10_000 }).changed, true);
  assert.deepEqual(s.state.project.viewport, { zoom: 30, panX: 5000, panY: -5000, centerLocked: false });
  s.setView({ viewport: { zoom: 3, panX: 0, panY: 0, centerLocked: false } }, { delay: 10_000 });
  assert.equal(s.state.status, 'unsaved');
  assert.equal(s.setView({ viewport: { zoom: 3, panX: 0, panY: 0, centerLocked: false } }).changed, false);
  await s.flushView();
  assert.equal(s.state.status, 'saved');
  assert.equal(s.state.project.persistence.revision, rev + 1);
  assert.equal((await makeSession(storage).init()).project.viewport.zoom, 3);
  assert.throws(() => s.setView({ viewport: { zoom: NaN, panX: 0, panY: 0 } }), /올바르지/);
});

test('세션: 저장이 겹쳐도 순서대로 실행되어 스스로 충돌(CONFLICT)로 보지 않는다', async () => {
  const storage = mem();
  const s = makeSession(storage);
  await s.init();
  const results = await Promise.all([s.save(), s.setView({ viewport: { zoom: 2, panX: 0, panY: 0, centerLocked: true } }, { delay: 0 }), s.edit('이름', (p) => { p.metadata.name = 'B'; })]);
  assert.equal(results[0].state, 'SAVED');
  assert.equal(s.state.status, 'saved');
  const loaded = (await makeSession(storage).init()).project;
  assert.equal(loaded.metadata.name, 'B');
  assert.equal(loaded.viewport.zoom, 2);
});
