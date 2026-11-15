import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createSession, projectValidator } from '../../src/core/session.js';
import { createProjectStore, LEGACY_KEY } from '../../src/persistence/storage.js';
import { createIdGenerator } from '../../src/core/ids.js';

const legacyRaw = fs.readFileSync(new URL('../../fixtures/legacy/v2.4.1-primary.txt', import.meta.url), 'utf8');

function memoryStorage(init = []) {
  const data = new Map(init);
  return {
    data,
    failSet: null,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem(k, v) {
      const e = this.failSet?.(k);
      if (e) throw e;
      data.set(k, String(v));
    },
    removeItem: (k) => data.delete(k),
  };
}
const quota = () => Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
const make = (storage, seed = 's') => createSession({ store: createProjectStore({ storage, validate: projectValidator }), nextId: createIdGenerator({ seed }), today: () => '2026-11-11' });

test('빈 저장소: 샘플로 시작(unsaved), 편집하면 자동 저장되어 saved', async () => {
  const s = make(memoryStorage());
  const v = await s.init();
  assert.equal(v.source, 'new');
  assert.equal(v.status, 'unsaved');
  await s.edit('이름 변경', (p) => { p.metadata.name = 'A'; });
  assert.equal(s.state.status, 'saved');
  assert.equal(s.state.project.persistence.revision, 1);
});

test('편집 → 새 세션에서 복원, 실행취소·다시 실행도 저장된다', async () => {
  const storage = memoryStorage();
  const s = make(storage);
  await s.init();
  await s.edit('이름', (p) => { p.metadata.name = 'A'; });
  await s.edit('이름', (p) => { p.metadata.name = 'B'; });
  await s.undo();
  assert.equal(s.state.project.metadata.name, 'A');
  assert.equal((await make(storage).init()).project.metadata.name, 'A');
  await s.redo();
  assert.equal((await make(storage).init()).project.metadata.name, 'B');
});

test('검증에 실패한 편집은 적용·기록·저장하지 않는다', async () => {
  const storage = memoryStorage();
  const s = make(storage);
  await s.init();
  await s.edit('이름', (p) => { p.metadata.name = 'A'; });
  const before = JSON.stringify(s.state.project);
  const snapshot = JSON.stringify([...storage.data]);
  await assert.rejects(() => s.edit('잘못된 정책', (p) => { p.settings.policy = 'allow'; }));
  assert.equal(JSON.stringify(s.state.project), before);
  assert.equal(JSON.stringify([...storage.data]), snapshot);
  await s.undo();
  assert.equal(s.state.project.metadata.name, '자재창고 배치 검토 · 샘플');
});

test('저장 공간 부족: error/QUOTA, 편집은 메모리에 유지, 기존 저장본 보존, 재시도 성공', async () => {
  const storage = memoryStorage();
  const s = make(storage);
  await s.init();
  await s.edit('이름', (p) => { p.metadata.name = 'A'; });
  storage.failSet = (k) => (k.includes(':slot-') ? quota() : null);
  await s.edit('이름', (p) => { p.metadata.name = 'B'; });
  assert.equal(s.state.status, 'error');
  assert.equal(s.state.error.code, 'QUOTA');
  assert.equal(s.state.project.metadata.name, 'B');
  assert.equal((await make(storage).init()).project.metadata.name, 'A');
  storage.failSet = null;
  const r = await s.save();
  assert.equal(r.state, 'SAVED');
  assert.equal((await make(storage).init()).project.metadata.name, 'B');
});

test('다른 탭이 먼저 저장하면 CONFLICT, 확인(force) 후에만 덮어쓴다', async () => {
  const storage = memoryStorage();
  const a = make(storage, 'a');
  await a.init();
  await a.edit('이름', (p) => { p.metadata.name = 'BASE'; });
  const b = make(storage, 'b');
  await b.init();
  await a.edit('이름', (p) => { p.metadata.name = 'A-1'; });
  const event = { key: 'warehouse-layout-v2:pointer', newValue: storage.data.get('warehouse-layout-v2:pointer') };
  assert.equal(b.handleStorageEvent(event), true);
  assert.match(b.state.notice, /다른 탭/);
  assert.equal(a.handleStorageEvent(event), false);
  await b.edit('이름', (p) => { p.metadata.name = 'B-1'; });
  assert.equal(b.state.error.code, 'CONFLICT');
  assert.equal((await make(storage).init()).project.metadata.name, 'A-1');
  await b.save({ force: true });
  assert.equal(b.state.status, 'saved');
  assert.equal(b.state.notice, '');
  assert.equal((await make(storage).init()).project.metadata.name, 'B-1');
});

test('기준본 저장본으로 시작하면 안내를 보이고, 저장해도 기준본 키는 그대로다', async () => {
  const storage = memoryStorage([[LEGACY_KEY, legacyRaw]]);
  const s = make(storage);
  const v = await s.init();
  assert.equal(v.source, 'legacy');
  assert.match(v.notice, /기준본/);
  await s.save();
  assert.equal(storage.data.get(LEGACY_KEY), legacyRaw);
  assert.equal((await make(storage).init()).source, 'slot-a');
});

test('손상된 저장본: 보호하고 교체 확인 없이는 저장하지 않는다', async () => {
  const storage = memoryStorage([['warehouse-layout-v2:pointer', 'not json']]);
  const s = make(storage);
  const v = await s.init();
  assert.equal(v.status, 'error');
  assert.equal(v.error.code, 'CORRUPT');
  const r = await s.save();
  assert.equal(r.state, 'FAILED');
  assert.equal(storage.data.get('warehouse-layout-v2:pointer'), 'not json');
  assert.equal((await s.save({ replaceCorrupt: true })).state, 'SAVED');
});
