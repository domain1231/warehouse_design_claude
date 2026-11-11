import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHistory, diff } from '../../src/core/history.js';
import { createProject, validateProject } from '../../src/core/project.js';
import { createIdGenerator } from '../../src/core/ids.js';

const base = () => validateProject(createProject({ nextId: createIdGenerator({ seed: 'h' }), today: () => '2026-11-11' }));

// 재현 가능한 의사난수
function rng(seed) {
  let n = seed >>> 0;
  return () => {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    return n / 2 ** 32;
  };
}

const mutations = [
  (p, r) => { const o = p.scenarios.after.objects[Math.floor(r() * p.scenarios.after.objects.length)]; o.x = Math.round(r() * 20000) / 1000; },
  (p, r) => { const o = p.scenarios.before.objects[Math.floor(r() * p.scenarios.before.objects.length)]; o.rotation = [0, 90, 180, 270][Math.floor(r() * 4)]; },
  (p) => { p.metadata.name += '·'; },
  (p, r) => { p.scenarios.after.objects.push({ ...structuredClone(p.scenarios.after.objects[0]), id: `n-${Math.floor(r() * 1e9)}`, code: `N-${Math.floor(r() * 1e9)}` }); },
  (p) => { if (p.scenarios.after.objects.length > 30) p.scenarios.after.objects.pop(); },
  (p, r) => { p.inventoryHistory.push({ date: '2026-01-05', rackId: `r-${Math.floor(r() * 1e9)}`, capacity: null, quantity: null, unit: 'BOX', source: 'SYN', scenario: 'after' }); },
  (p) => { p.settings.minGap = p.settings.minGap ? 0 : 0.1; },
  (p) => { if (p.theme.customColors.bg) delete p.theme.customColors.bg; else p.theme.customColors.bg = '#101010'; },
];

test('무작위 편집 200단계를 모두 되돌리면 처음 상태, 다시 실행하면 마지막 상태와 같다', () => {
  const r = rng(7);
  const history = createHistory({ limit: 1000 });
  const project = base();
  const start = structuredClone(project);
  for (let i = 0; i < 200; i++) {
    const before = structuredClone(project);
    mutations[Math.floor(r() * mutations.length)](project, r);
    history.record(before, project, `step ${i}`);
  }
  const end = structuredClone(project);
  while (history.canUndo) history.undo(project);
  assert.deepEqual(project, start);
  while (history.canRedo) history.redo(project);
  assert.deepEqual(project, end);
});

test('기록된 패치는 원본과 참조를 공유하지 않는다', () => {
  const history = createHistory();
  const project = base();
  const before = structuredClone(project);
  project.scenarios.after.objects[0].x = 9;
  history.record(before, project);
  project.scenarios.after.objects[0].x = 11; // 기록 이후 변경
  history.undo(project);
  assert.equal(project.scenarios.after.objects[0].x, before.scenarios.after.objects[0].x);
  history.redo(project);
  assert.equal(project.scenarios.after.objects[0].x, 9);
});

test('변화 없는 편집은 기록하지 않고, persistence 변경은 무시한다', () => {
  const history = createHistory();
  const project = base();
  const before = structuredClone(project);
  project.persistence = { lastSavedAt: '2026-11-11T00:00:00.000Z', revision: 9 };
  assert.equal(history.record(before, project), false);
  assert.equal(history.canUndo, false);
});

test('새 편집은 다시 실행 목록을 비운다, 상한 60단계', () => {
  const history = createHistory();
  const project = base();
  for (let i = 0; i < 70; i++) {
    const before = structuredClone(project);
    project.metadata.name = `N${i}`;
    history.record(before, project);
  }
  assert.deepEqual(history.size, { undo: 60, redo: 0 });
  history.undo(project);
  assert.equal(history.canRedo, true);
  const before = structuredClone(project);
  project.metadata.name = 'X';
  history.record(before, project);
  assert.equal(history.canRedo, false);
});

test('랙 1개 이동의 기록 크기는 기준본 방식(프로젝트 전체 문자열)의 1% 미만이다', () => {
  const history = createHistory();
  const project = base();
  const before = structuredClone(project);
  project.scenarios.after.objects[5].x += 0.1;
  history.record(before, project);
  const baselineEntry = JSON.stringify(before).length;
  assert.ok(history.bytes * 100 < baselineEntry, `patch ${history.bytes} vs baseline ${baselineEntry}`);
});

test('추가·삭제된 키를 정확히 되돌린다', () => {
  const before = { a: 1, b: { c: 2 } };
  const after = { a: 1, b: { d: 3 } };
  const ops = diff(before, after);
  assert.equal(ops.length, 2);
  const history = createHistory();
  const state = structuredClone(after);
  history.record(before, after);
  history.undo(state);
  assert.deepEqual(state, before);
});
