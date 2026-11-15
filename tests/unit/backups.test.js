// 전체 프로젝트 백업 링: 사유·내용 중복 생략, 최신 3개, 압축 용량 한도, 쓰기 후 읽기 검증 실패 복구, Quota, 영수증 되돌리기, 백업 사유 판정.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject, validateProject } from '../../src/core/project.js';
import { createIdGenerator } from '../../src/core/ids.js';
import { createBackupRing, checkpointReason, REASONS, BACKUP_TARGET } from '../../src/persistence/backups.js';

const memory = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
};
const fingerprint = (p) => JSON.stringify({ ...p, persistence: undefined });
const setup = (extra = {}) => {
  const nextId = createIdGenerator({ seed: 'backup' }), storage = memory();
  const p = validateProject(createProject({ sample: true, nextId, today: () => '2026-11-15' }));
  const ring = createBackupRing({ storage, validate: (x) => validateProject(x), fingerprint, nextId, now: () => '2026-11-15T00:00:00.000Z', ...extra });
  return { p, ring, storage };
};

test('같은 사유·같은 내용은 새로 만들지 않고, 최신 3개만 보관한다', async () => {
  const { p, ring } = setup();
  const a = await ring.checkpoint(p, REASONS.before);
  assert.equal((await ring.checkpoint(p, REASONS.before)).id, a.id);
  for (let i = 0; i < 4; i++) {
    p.metadata.name = '이름 ' + i;
    await ring.checkpoint(p, REASONS.bulkDelete);
  }
  const rows = await ring.list();
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.project.metadata.name), ['이름 1', '이름 2', '이름 3']);
  assert.equal(rows[0].target, BACKUP_TARGET);
});

test('압축 용량 한도를 넘으면 오래된 백업부터 지우고, 하나도 못 넣으면 오류', async () => {
  const { p, ring } = setup({ maxBytes: 20000 });
  await ring.checkpoint(p, '1');
  p.metadata.name = '둘';
  await ring.checkpoint(p, '2');
  assert.ok((await ring.list()).length >= 1);
  const tiny = setup({ maxBytes: 100 });
  await assert.rejects(tiny.ring.checkpoint(tiny.p, '1'), (e) => e.code === 'BACKUP_LIMIT');
});

test('쓰기 후 읽기 불일치·Quota면 이전 원문을 유지한다', async () => {
  const { p, ring, storage } = setup();
  await ring.checkpoint(p, '처음');
  const before = storage.getItem(ring.key);
  const set = storage.setItem;
  let n = 0;
  storage.setItem = (k, v) => set(k, n++ === 0 ? v.slice(0, -4) + 'AAAA' : v); // 첫 쓰기만 손상
  p.metadata.name = '변경';
  await assert.rejects(ring.checkpoint(p, '두번째'));
  storage.setItem = set;
  assert.equal(storage.getItem(ring.key), before);
  storage.setItem = () => { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; };
  await assert.rejects(ring.checkpoint(p, '세번째'), (e) => e.code === 'QUOTA');
  storage.setItem = set;
  assert.equal(storage.getItem(ring.key), before);
});

test('영수증으로 되돌리면 checkpoint 전 상태가 된다', async () => {
  const { p, ring, storage } = setup();
  const r = await ring.checkpoint(p, '처음');
  ring.rollback(r.receipt);
  assert.equal(storage.getItem(ring.key), null);
});

test('백업 사유: 객체 2개 이상 삭제, BEFORE 변경, 복원 명령', () => {
  const { p } = setup();
  p.settings.scenario = 'after';
  const q = structuredClone(p);
  q.scenarios.after.objects = q.scenarios.after.objects.slice(2);
  assert.equal(checkpointReason(p, q, '객체 삭제'), REASONS.bulkDelete);
  const one = structuredClone(p);
  one.scenarios.after.objects = one.scenarios.after.objects.slice(1);
  assert.equal(checkpointReason(p, one, '객체 삭제'), null);
  assert.equal(checkpointReason(p, structuredClone(p), '저장된 배치 복원'), REASONS.restore);
  const b = structuredClone(p);
  b.settings.scenario = 'before';
  const b2 = structuredClone(b);
  b2.scenarios.before.warehouse.width += 1;
  assert.equal(checkpointReason(b, b2, '객체 수정'), REASONS.before);
});
