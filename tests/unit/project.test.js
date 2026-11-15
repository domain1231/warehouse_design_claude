import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createProject, validateProject, assertIndependent, parseLocation, ProjectValidationError } from '../../src/core/project.js';
import { createIdGenerator } from '../../src/core/ids.js';
import { createProjectStore } from '../../src/persistence/storage.js';

const fixtureRaw = fs.readFileSync(new URL('../../fixtures/legacy/v2.4.1-primary.txt', import.meta.url), 'utf8');

test('같은 시드로 만든 프로젝트는 동일하다(결정성)', () => {
  const make = () => createProject({ nextId: createIdGenerator({ seed: 'p' }), today: () => '2026-11-11' });
  assert.deepEqual(make(), make());
});

test('새 프로젝트의 BEFORE/AFTER는 참조를 공유하지 않고, ID는 배치 안에서 고유하다', () => {
  const p = validateProject(createProject());
  assertIndependent(p);
  const ids = p.scenarios.after.objects.map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(p.version, '2.3.6');
  assert.equal(p.scenarios.after.objects.filter((o) => o.kind === 'rack').length, 47);
});

test('참조를 공유하는 BEFORE/AFTER는 거부한다', () => {
  const p = validateProject(createProject());
  p.scenarios.after.objects[0] = p.scenarios.before.objects[0];
  assert.throws(() => assertIndependent(p), ProjectValidationError);
});

test('로케이션 파싱: 건물은 추측하지 않는다', () => {
  assert.deepEqual(parseLocation(' 7f-c-5-3-1 '), { floor: '7F', floorNumber: 7, column: 'C', rackNumber: 5, shelfNumber: 3, position: 1, key: '7F-C-5', shelfKey: '7F-C-5-3', location: '7F-C-5-3-1' });
  assert.equal(parseLocation('B동/7F-C-5-3-1'), null);
  assert.equal(parseLocation('7F-C-0-3-1'), null);
});

test('저장소에 프로젝트 검증을 연결하면 기준본 저장본을 읽고 잘못된 프로젝트 저장을 막는다', async () => {
  const data = new Map([['warehouse-studio-v1', fixtureRaw]]);
  const storage = { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
  const validate = (p) => {
    const v = validateProject(p);
    assertIndependent(v);
    return v;
  };
  const store = createProjectStore({ storage, validate });
  const loaded = await store.load();
  assert.equal(loaded.status, 'loaded');
  const bad = structuredClone(loaded.project);
  bad.settings.policy = 'allow';
  await assert.rejects(() => store.save(bad), { code: 'VALIDATION' });
  assert.equal((await store.save(loaded.project)).state, 'SAVED');
});
