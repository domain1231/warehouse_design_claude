// 손상 원본 교체 전 보존(기준본 -protected-original, D-037): 보존 실패·기존 보존본이 있으면 교체 거부.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProjectStore } from '../../src/persistence/storage.js';
import { createProject, validateProject } from '../../src/core/project.js';
import { createIdGenerator } from '../../src/core/ids.js';

const mem = () => { const m = new Map(); return { m, fail: null, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem(k, v) { if (this.fail?.(k)) throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' }); m.set(k, String(v)); }, removeItem: (k) => m.delete(k) }; };
const project = () => validateProject(createProject({ sample: true, nextId: createIdGenerator({ seed: 'sp' }), today: () => '2026-11-16' }));

async function corruptStore() {
  const storage = mem();
  const store = createProjectStore({ storage, validate: validateProject });
  await store.load();
  await store.save(project());
  const ptr = JSON.parse(storage.getItem(store.keys.pointer));
  storage.m.set(store.keys[ptr.active], 'garbage');
  const s2 = createProjectStore({ storage, validate: validateProject });
  assert.equal((await s2.load()).status, 'corrupt');
  return { storage, store: s2, active: ptr.active };
}

test('손상 원본은 일반 저장으로 바뀌지 않는다', async () => {
  const { store } = await corruptStore();
  await assert.rejects(store.save(project()), (e) => e.code === 'CORRUPT');
});

test('교체 확인 시 손상 원본을 보호 키에 원문 그대로 보존한 뒤 저장한다', async () => {
  const { storage, store, active } = await corruptStore();
  const r = await store.save(project(), { replaceCorrupt: true });
  assert.equal(r.state, 'SAVED');
  const kept = JSON.parse(storage.getItem(store.keys.protected));
  assert.equal(kept[active], 'garbage');
  assert.ok(kept.pointer);
});

test('이미 보존본이 있거나 보존 쓰기에 실패하면 교체하지 않는다', async () => {
  const a = await corruptStore();
  a.storage.m.set(a.store.keys.protected, 'older');
  const before = a.storage.getItem(a.store.keys.pointer);
  await assert.rejects(a.store.save(project(), { replaceCorrupt: true }), (e) => e.stage === 'protected-exists');
  assert.equal(a.storage.getItem(a.store.keys.pointer), before);
  assert.equal(a.storage.getItem(a.store.keys.protected), 'older');
  const b = await corruptStore();
  b.storage.fail = (k) => k === b.store.keys.protected;
  const ptr = b.storage.getItem(b.store.keys.pointer);
  await assert.rejects(b.store.save(project(), { replaceCorrupt: true }), (e) => e.code === 'QUOTA');
  assert.equal(b.storage.getItem(b.store.keys.pointer), ptr);
});
