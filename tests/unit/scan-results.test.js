// 파생 검사 결과 재계산(F-041): 불러올 때 저장된 결과가 현재 배치와 다르면 다시 계산하고, 열 우선 배치도 지문으로 비교한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../src/autolayout/column.js';
import { createSession, projectValidator, storeScanResults } from '../../src/core/session.js';
import { createProjectStore } from '../../src/persistence/storage.js';
import { createIdGenerator } from '../../src/core/ids.js';
import { scanLayout } from '../../src/warehouse/constraints.js';

const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const make = (storage) => createSession({ store: createProjectStore({ storage, validate: projectValidator }), nextId: createIdGenerator({ seed: 'scan' }), today: () => '2026-11-15' });

test('불러올 때 오래된 검사 결과를 현재 배치 기준으로 다시 계산한다', async () => {
  const storage = memory();
  const s = make(storage);
  await s.init();
  await s.save();
  const fresh = s.state.project.autoPlacement.results.after;
  // 저장된 결과를 다른 지문으로 바꿔 저장소에 직접 기록(외부 편집·이전 버전 상황)
  const stale = structuredClone(s.state.project);
  stale.autoPlacement.results.after = { ...fresh, fingerprint: 'stale:0', counts: { ...fresh.counts, total: 999 } };
  const store = createProjectStore({ storage, validate: (p) => p });
  await store.load();
  await store.save(stale, { force: true });
  const s2 = make(storage);
  await s2.init();
  assert.equal(s2.state.project.autoPlacement.results.after.fingerprint, fresh.fingerprint);
  assert.equal(s2.state.project.autoPlacement.results.after.counts.total, fresh.counts.total);
});

test('열 우선 배치도 검사 결과를 저장한다(지문이 같으면 유지)', async () => {
  const s = make(memory());
  await s.init();
  const p = structuredClone(s.state.project);
  p.scenarios.after.autoPlacementRules = { mode: 'column', wallGap: 0.1, rackGap: 0.2, columnGap: 0.6, aisleTarget: 1.2, columnOptions: { allowWrap: false, keepManual: true, allowRotation: false, externalDirection: 'right', northRotation: 0, columnDirection: 'east', firstRackPosition: 'north', order: '', first: {} } };
  const v = projectValidator(p);
  storeScanResults(v);
  const r = v.autoPlacement.results.after;
  assert.ok(r.column, '열 진단 포함');
  assert.equal(r.fingerprint, scanLayout(v.scenarios.after, v).fingerprint);
  const keep = r.checkedAt;
  storeScanResults(v);
  assert.equal(v.autoPlacement.results.after.checkedAt, keep);
});
