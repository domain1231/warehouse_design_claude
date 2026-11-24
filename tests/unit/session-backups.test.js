// 세션 + 전체 프로젝트 백업 링: 대량 삭제 전 백업, 백업 실패 시 편집 차단, 저장 실패 시 백업 되돌리기,
// JSON 전체 교체(백업·실행취소·저장 실패 시 전체 취소), 적용 실패 직전 원문(복구 JSON).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, projectValidator } from '../../src/core/session.js';
import { createProjectStore } from '../../src/persistence/storage.js';
import { createBackupRing, REASONS } from '../../src/persistence/backups.js';
import { createIdGenerator } from '../../src/core/ids.js';

function memoryStorage() {
  const data = new Map();
  return { data, failSet: null, getItem: (k) => (data.has(k) ? data.get(k) : null), setItem(k, v) { const e = this.failSet?.(k); if (e) throw e; data.set(k, String(v)); }, removeItem: (k) => data.delete(k) };
}
const quota = () => Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
async function make() {
  const storage = memoryStorage(), nextId = createIdGenerator({ seed: 'sb' });
  const backups = createBackupRing({ storage, validate: projectValidator, fingerprint: (p) => JSON.stringify({ ...p, persistence: undefined }), nextId });
  const s = createSession({ store: createProjectStore({ storage, validate: projectValidator }), nextId, today: () => '2026-11-15', backups });
  await s.init();
  await s.save();
  return { s, storage, backups };
}
const dropTwo = (p) => {
  const k = p.settings.scenario, racks = p.scenarios[k].objects.filter((o) => o.kind === 'rack').slice(0, 2).map((o) => o.id);
  p.scenarios[k].objects = p.scenarios[k].objects.filter((o) => !racks.includes(o.id));
};

test('객체 2개 이상 삭제 전에 전체 프로젝트를 백업하고, 1개 삭제는 백업하지 않는다', async () => {
  const { s, backups } = await make();
  const before = s.state.project;
  await s.edit('객체 삭제', dropTwo);
  const rows = await backups.list();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].reason, REASONS.bulkDelete);
  assert.equal(rows[0].project.scenarios.after.objects.length, before.scenarios.after.objects.length);
  await s.edit('이름', (p) => { p.metadata.name = '바뀜'; });
  assert.equal((await backups.list()).length, 1);
});

test('백업 저장이 실패하면 편집을 적용하지 않는다', async () => {
  const { s, storage } = await make();
  const before = JSON.stringify(s.state.project);
  storage.failSet = (k) => (k.endsWith(':project-backups') ? quota() : null);
  await assert.rejects(s.edit('객체 삭제', dropTwo), /프로젝트 백업 실패/);
  assert.equal(JSON.stringify(s.state.project), before);
  assert.equal(s.state.canUndo, false);
});

test('본 저장이 실패해도 편집은 메모리에 남으므로 편집 직전 백업은 유지한다', async () => {
  const { s, storage, backups } = await make();
  storage.failSet = (k) => (k.includes(':slot-') ? quota() : null);
  await s.edit('객체 삭제', dropTwo);
  assert.equal(s.state.status, 'error');
  assert.equal((await backups.list()).length, 1);
  assert.equal(s.state.canUndo, true);
});

test('JSON 전체 교체: 현재 프로젝트 백업 → 교체 → 실행취소로 복귀, 저장 실패면 전체 취소', async () => {
  const { s, storage, backups } = await make();
  const old = JSON.stringify(s.state.project.metadata);
  const data = structuredClone(s.state.project);
  data.metadata.name = '불러온 프로젝트';
  assert.deepEqual(await s.replaceProject(data, 'JSON test.json'), { ok: true });
  assert.equal(s.state.project.metadata.name, '불러온 프로젝트');
  assert.equal((await backups.list()).at(-1).reason, 'JSON test.json 적용 전');
  await s.undo();
  assert.equal(JSON.stringify(s.state.project.metadata), old);
  const n = (await backups.list()).length;
  storage.failSet = (k) => (k.includes(':slot-') ? quota() : null);
  data.metadata.name = '실패할 교체';
  const r = await s.replaceProject(data, 'JSON fail.json');
  assert.equal(r.ok, false);
  assert.equal(JSON.stringify(s.state.project.metadata), old);
  assert.equal((await backups.list()).length, n);
  const bad = await s.replaceProject({ nope: true }, 'JSON bad.json');
  assert.equal(bad.ok, false);
});

test('적용 실패(전체 취소) 직전 원문을 복구 JSON으로 제공한다', async () => {
  const { s } = await make();
  assert.equal(s.recoveryText(), null);
  const before = s.state.project;
  await s.apply('시험 적용', (p) => ({ ok: false, project: p, reason: '실패 주입' }));
  assert.equal(s.state.lastFailure.reason, '실패 주입');
  assert.equal(s.recoveryText(), JSON.stringify(before));
});
