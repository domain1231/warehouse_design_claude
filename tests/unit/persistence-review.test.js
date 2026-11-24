// Phase 11-4 독립 검토 지적 재현: 손상 교체 재시도, SAVED 오표시, 백업 링 되돌리기·격리.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, projectValidator } from '../../src/core/session.js';
import { createProjectStore } from '../../src/persistence/storage.js';
import { createBackupRing } from '../../src/persistence/backups.js';
import { createProject, validateProject } from '../../src/core/project.js';
import { createIdGenerator } from '../../src/core/ids.js';

const quota = () => Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
const mem = () => { const m = new Map(); return { m, failSet: null, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem(k, v) { const e = this.failSet?.(k); if (e) throw e; m.set(k, String(v)); }, removeItem: (k) => m.delete(k) }; };
const project = () => validateProject(createProject({ sample: true, nextId: createIdGenerator({ seed: 'pr' }), today: () => '2026-11-16' }));
const fingerprint = (p) => JSON.stringify({ ...p, persistence: undefined });
const dropTwo = (p) => {
  const k = p.settings.scenario, ids = p.scenarios[k].objects.filter((o) => o.kind === 'rack').slice(0, 2).map((o) => o.id);
  p.scenarios[k].objects = p.scenarios[k].objects.filter((o) => !ids.includes(o.id));
};
const dropOne = (p) => {
  const k = p.settings.scenario, id = p.scenarios[k].objects.filter((o) => o.kind === 'rack')[0].id;
  p.scenarios[k].objects = p.scenarios[k].objects.filter((o) => o.id !== id);
};

async function make() {
  const storage = mem(), nextId = createIdGenerator({ seed: 'pr2' });
  const backups = createBackupRing({ storage, validate: projectValidator, fingerprint, nextId });
  const s = createSession({ store: createProjectStore({ storage, validate: projectValidator }), nextId, today: () => '2026-11-16', backups });
  await s.init();
  await s.save();
  return { s, storage, backups };
}

test('1. 손상 교체: 슬롯 쓰기가 QUOTA로 실패해도 같은 손상 원문이면 재시도할 수 있다', async () => {
  const storage = mem();
  const first = createProjectStore({ storage, validate: validateProject });
  await first.load();
  await first.save(project());
  const ptr = JSON.parse(storage.getItem(first.keys.pointer));
  storage.m.set(first.keys[ptr.active], 'garbage');
  const store = createProjectStore({ storage, validate: validateProject });
  assert.equal((await store.load()).status, 'corrupt');
  storage.failSet = (k) => (k.includes(':slot-') ? quota() : null);
  await assert.rejects(store.save(project(), { replaceCorrupt: true }), (e) => e.code === 'QUOTA');
  assert.ok(storage.getItem(store.keys.protected), '보호 원본은 유지');
  storage.failSet = null;
  assert.equal((await store.save(project(), { replaceCorrupt: true })).state, 'SAVED');
  assert.equal(JSON.parse(storage.getItem(store.keys.protected))[ptr.active], 'garbage');
});

test('1b. 다른 내용의 보호 원본은 여전히 덮어쓰지 않고 교체를 거부한다', async () => {
  const storage = mem();
  const first = createProjectStore({ storage, validate: validateProject });
  await first.load();
  await first.save(project());
  const ptr = JSON.parse(storage.getItem(first.keys.pointer));
  storage.m.set(first.keys[ptr.active], 'garbage');
  storage.m.set(first.keys.protected, '{"other":1}');
  const store = createProjectStore({ storage, validate: validateProject });
  await store.load();
  await assert.rejects(store.save(project(), { replaceCorrupt: true }), (e) => e.stage === 'protected-exists');
  assert.equal(storage.getItem(store.keys.protected), '{"other":1}');
});

test('2. 저장 중 들어온 편집/화면 변경은 SAVED로 가려지지 않는다', async () => {
  const { s: s2 } = await make();
  const p2 = s2.save();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(s2.state.status, 'saving');
  s2.setView({ viewport: { zoom: 4, panX: 0, panY: 0, centerLocked: false } }, { delay: 100000 }); // 저장 예약 지연
  await p2;
  assert.equal(s2.state.status, 'unsaved');
  await s2.flushView(); // 예약된 화면 저장을 바로 실행해 타이머를 남기지 않는다
  assert.equal(s2.state.status, 'saved');
});

test('3. 실패한 저장의 되돌리기가 다른 체크포인트의 백업을 지우지 않는다', async () => {
  const { storage, backups } = await make();
  const base = project();
  const a = await backups.checkpoint(base, '사유 A');
  const mod = structuredClone(base);
  mod.metadata.name = 'B 상태';
  const b = await backups.checkpoint(mod, '사유 B');
  backups.rollback(a.receipt);
  const rows = await backups.list();
  assert.ok(rows.some((r) => r.id === b.id), 'B 백업 유지');
  void storage;
});

test('3b. 단일 편집의 본 저장이 실패해도 편집 직전 백업은 유지된다(편집은 메모리에 남음)', async () => {
  const { s, storage, backups } = await make();
  storage.failSet = (k) => (k.includes(':slot-') ? quota() : null);
  await s.edit('객체 삭제', dropTwo);
  assert.equal(s.state.status, 'error');
  assert.equal((await backups.list()).length, 1);
  void dropOne;
});

test('4. 손상된 백업 링은 격리 키로 옮기고 새 링으로 편집을 계속한다', async () => {
  const { s, storage, backups } = await make();
  storage.m.set(backups.key, 'garbage-ring');
  await s.edit('객체 삭제', dropTwo);
  assert.equal(s.state.status, 'saved');
  assert.equal(storage.getItem(backups.key + ':quarantine'), 'garbage-ring');
  assert.equal((await backups.list()).length, 1);
});

test('5. BEFORE 잠금 중 BEFORE를 바꾸는 실행취소/다시실행은 거부되고, 해제하면 동작한다', async () => {
  const { s } = await make();
  s.setView({ scenario: 'before' }, { delay: 0 });
  await s.edit('이름', (p) => { p.scenarios.before.warehouse.width += 1; });
  const edited = JSON.stringify(s.state.project.scenarios.before);
  s.setView({ beforeLocked: true }, { delay: 0 });
  await assert.rejects(s.undo(), /BEFORE 잠금을 해제한 후 실행 취소\/다시 실행하세요\./);
  assert.equal(JSON.stringify(s.state.project.scenarios.before), edited);
  assert.equal(s.state.canUndo, true);
  assert.equal(s.state.canRedo, false);
  s.setView({ beforeLocked: false }, { delay: 0 });
  await s.undo();
  assert.notEqual(JSON.stringify(s.state.project.scenarios.before), edited);
  assert.equal(s.state.canRedo, true);
});
