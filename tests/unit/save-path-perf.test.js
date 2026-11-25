// D-096: 저장 경로 성능 개선의 동작 보존 — 대기 저장 합치기, 구조 비교, 줄인 형식 비교.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, projectValidator } from '../../src/core/session.js';
import { createProjectStore } from '../../src/persistence/storage.js';
import { createIdGenerator } from '../../src/core/ids.js';
import { deepSame } from '../../src/core/json-equal.js';
import { historyProject } from './size-fixture.js';

const now = () => '2026-11-25T00:00:00.000Z';
function setup() {
  const data = new Map();
  const storage = { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
  const store = createProjectStore({ storage, validate: projectValidator });
  let calls = 0;
  const realSave = store.save;
  store.save = (p, o) => { calls++; return realSave(p, o); };
  const s = createSession({ store, nextId: createIdGenerator({ seed: 'perf' }), today: () => '2026-11-25', now });
  return { s, store, calls: () => calls };
}
const rename = (name) => (p) => ({ ok: true, project: { ...p, metadata: { ...p.metadata, name } } });

test('연속 편집: 시작 전 대기 저장은 하나로 합쳐지고 마지막 상태가 저장됨', async () => {
  const { s, store, calls } = setup();
  await s.init();
  const before = calls();
  const runs = [s.apply('a', rename('A')), s.apply('b', rename('B')), s.apply('c', rename('C')), s.apply('d', rename('D'))];
  await Promise.all(runs);
  const n = calls() - before;
  assert.ok(n >= 1 && n < 4, `저장 ${n}회`);
  assert.equal(s.state.status, 'saved');
  const loaded = await store.load();
  assert.equal((loaded.project ?? loaded).metadata.name, 'D');
});

test('강제 저장은 합치지 않음', async () => {
  const { s, calls } = setup();
  await s.init();
  const before = calls();
  await Promise.all([s.save(), s.save({ force: true }), s.save()]);
  assert.equal(calls() - before, 2, '일반 저장 1(합침) + 강제 1 — 마지막 일반 저장은 강제보다 먼저 대기하던 것과 합쳐짐');
});

test('바뀐 것이 없는 편집은 저장하지 않음(구조 비교)', async () => {
  const { s, calls } = setup();
  await s.init();
  const before = calls();
  const r = await s.apply('같음', (p) => ({ ok: true, project: { ...p } }));
  assert.equal(r.changed, false);
  assert.equal(calls() - before, 0);
});

test('deepSame = JSON 문자열 일치와 같은 판정', () => {
  const pairs = [[{ a: 1, b: [1, { c: 2 }] }, { a: 1, b: [1, { c: 2 }] }], [{ a: 1, b: 2 }, { b: 2, a: 1 }], [{ a: 1, u: undefined }, { a: 1 }], [[1, 2], [1, 2, 3]], [{ a: null }, { a: 0 }], [{ a: '1' }, { a: 1 }], [0, -0]];
  for (const [x, y] of pairs) assert.equal(deepSame(x, y), JSON.stringify(x) === JSON.stringify(y), JSON.stringify([x, y]));
  const { p } = historyProject({ racks: 10, imports: 2 });
  assert.ok(deepSame(p, structuredClone(p)));
});

test('저장 후 다시 저장하면 UNCHANGED(줄인 형식 비교), 바뀌면 SAVED', async () => {
  const { s, store } = setup();
  await s.init();
  const { p } = historyProject({ racks: 10, imports: 3 });
  const v = projectValidator(p);
  assert.equal((await store.save(v)).state, 'SAVED');
  assert.equal((await store.save(v)).state, 'UNCHANGED');
  assert.equal((await store.save({ ...v, metadata: { ...v.metadata, name: '바뀜' } })).state, 'SAVED');
});
