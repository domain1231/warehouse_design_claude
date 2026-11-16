// 편집 직렬화: 백업(비동기 압축) 중 들어온 다른 편집이 같은 원본에서 출발해 한쪽이 사라지면 안 된다(잃어버린 갱신 방지).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, projectValidator } from '../../src/core/session.js';
import { createProjectStore } from '../../src/persistence/storage.js';
import { createBackupRing } from '../../src/persistence/backups.js';
import { createIdGenerator } from '../../src/core/ids.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
async function make() {
  const storage = mem(), nextId = createIdGenerator({ seed: 'cc' });
  const ring = createBackupRing({ storage, validate: projectValidator, fingerprint: (p) => JSON.stringify({ ...p, persistence: undefined }), nextId });
  let release;
  const gate = new Promise((r) => { release = r; });
  const slow = { ...ring, checkpoint: async (...a) => { await gate; return ring.checkpoint(...a); } }; // 백업이 오래 걸리는 상황
  const s = createSession({ store: createProjectStore({ storage, validate: projectValidator }), nextId, today: () => '2026-11-16', backups: slow });
  await s.init();
  await s.save();
  return { s, release };
}
const dropTwo = (p) => {
  const k = p.settings.scenario, ids = p.scenarios[k].objects.filter((o) => o.kind === 'rack').slice(0, 2).map((o) => o.id);
  p.scenarios[k].objects = p.scenarios[k].objects.filter((o) => !ids.includes(o.id));
};

test('백업 대기 중 들어온 편집도 사라지지 않는다(편집 직렬화)', async () => {
  const { s, release } = await make();
  const n0 = s.state.project.scenarios.after.objects.length;
  const a = s.edit('객체 삭제', dropTwo); // 백업 사유(2개 이상 삭제) → 대기
  const b = s.edit('이름', (p) => { p.metadata.name = '동시 편집'; });
  release();
  await Promise.all([a, b]);
  assert.equal(s.state.project.scenarios.after.objects.length, n0 - 2, '삭제 유지');
  assert.equal(s.state.project.metadata.name, '동시 편집', '이름 변경 유지');
  await s.undo();
  assert.equal(s.state.project.scenarios.after.objects.length, n0 - 2, '실행취소 1단계는 이름만 되돌림');
  assert.notEqual(s.state.project.metadata.name, '동시 편집');
});

test('백업 대기 중 화면 상태(배율) 변경도 유지된다', async () => {
  const { s, release } = await make();
  const a = s.edit('객체 삭제', dropTwo);
  s.setView({ viewport: { zoom: 2.5, panX: 1, panY: 2, centerLocked: false } }, { delay: 0 });
  release();
  await a;
  assert.equal(s.state.project.viewport.zoom, 2.5);
});
