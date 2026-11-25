// E5(D-089): 배치 백업 안 스냅샷 참조 — 크기 감소, 왕복·복원 결과 동일, 참조 끊김 0건, 기준본 호환 저장.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createIdGenerator } from '../../src/core/ids.js';
import { projectValidator } from '../../src/core/session.js';
import { historyProject } from './size-fixture.js';
import { restoreBackup } from '../../src/warehouse/scenarios.js';
import { packBackupRefs, expandBackupRefs, countBackupRefs, isBackupRef, REF_KEY } from '../../src/core/backup-refs.js';
import { projectJsonText, readProjectFile } from '../../src/persistence/project-file.js';
import { createProjectStore } from '../../src/persistence/storage.js';
import { createBackupRing } from '../../src/persistence/backups.js';

const bytes = (v) => Buffer.byteLength(JSON.stringify(v));
const norm = (p) => JSON.parse(JSON.stringify(projectValidator(structuredClone(p))));
const now = () => '2026-11-25T00:00:00.000Z';

test('11/25 형태: 백업 안 스냅샷이 참조로 바뀌어 layoutBackups가 1/3 이하로 줄고, 펼치면 원래와 같음', () => {
  const { p } = historyProject({ imports: 5 });
  const packed = packBackupRefs(p);
  assert.notEqual(packed, p);
  assert.equal(countBackupRefs(p), 0, '입력(메모리)은 바뀌지 않음');
  // 백업마다 그때까지의 스냅샷 전체(2종)가 들어 있고, 모두 최상위와 같으므로 전부 참조가 된다(3.2MB 한도로 오래된 백업은 이미 빠졌을 수 있음).
  assert.equal(countBackupRefs(packed), p.layoutBackups.reduce((n, b) => n + b.layoutSnapshots.length + b.excelSnapshots.length, 0));
  assert.ok(countBackupRefs(packed) >= 10);
  const full = bytes(p.layoutBackups), small = bytes(packed.layoutBackups);
  assert.ok(small <= full / 3, `${full} → ${small}`); // 로드맵 기준: 2.25MB → 0.7MB 이하(약 1/3)
  assert.deepEqual(norm(JSON.parse(JSON.stringify(packed))), norm(p));
  assert.equal(packBackupRefs(packed), packed, '두 번 적용해도 같음');
});

test('복원 결과 동일: 참조로 저장했다 읽은 프로젝트에서 각 백업을 복원한 결과 = 원래 프로젝트에서 복원한 결과', () => {
  const { p } = historyProject({ racks: 60, imports: 4 });
  const loaded = projectValidator(JSON.parse(JSON.stringify(packBackupRefs(p))));
  assert.equal(countBackupRefs(loaded), 0, '읽은 뒤 메모리에는 참조 없음');
  for (const b of p.layoutBackups) {
    const opts = () => ({ nextId: createIdGenerator({ seed: 'restore' }), now });
    const a = restoreBackup(p, b.id, opts()), c = restoreBackup(loaded, b.id, opts());
    assert.ok(a.ok && c.ok, a.reason || c.reason);
    assert.deepEqual(norm(c.project), norm(a.project));
  }
});

test('참조하지 않는 경우: 바뀐 최상위 스냅샷 · 겹치는 ID · 지워진 스냅샷은 그대로 펼친 채 저장', () => {
  const { p } = historyProject({ racks: 20, imports: 3 });
  const q = structuredClone(p);
  q.layoutSnapshots[0].name += ' (수정)'; // 백업 뒤에 바뀐 스냅샷
  q.excelSnapshots.splice(0, 1); // 지워진 스냅샷
  const packed = packBackupRefs(q);
  const last = packed.layoutBackups.at(-1);
  assert.ok(!isBackupRef(last.layoutSnapshots[0]) && isBackupRef(last.layoutSnapshots[1]));
  assert.ok(!isBackupRef(last.excelSnapshots[0]) && isBackupRef(last.excelSnapshots[1]));
  assert.deepEqual(norm(JSON.parse(JSON.stringify(packed))), norm(q));
  const dup = structuredClone(p);
  dup.layoutSnapshots.push({ ...structuredClone(dup.layoutSnapshots[0]), date: '2026-11-01' }); // 같은 ID 두 번
  assert.ok(!isBackupRef(packBackupRefs(dup).layoutBackups.at(-1).layoutSnapshots[0]));
});

test('참조가 끊긴 파일은 검증 실패(조용히 비우지 않음)', () => {
  const { p } = historyProject({ racks: 10, imports: 2 });
  const packed = JSON.parse(JSON.stringify(packBackupRefs(p)));
  const broken = structuredClone(packed);
  broken.layoutSnapshots = broken.layoutSnapshots.filter((s) => s.id !== broken.layoutBackups[1].layoutSnapshots[0][REF_KEY]);
  broken.layoutSnapshots.push({ ...structuredClone(packed.layoutSnapshots[1]), id: 'other', date: '2026-11-02' });
  assert.throws(() => projectValidator(broken), /백업 참조 오류: layoutSnapshots .* 없음/);
  const dup = structuredClone(packed);
  dup.layoutSnapshots.push({ ...structuredClone(packed.layoutSnapshots[0]), date: '2026-11-03' });
  assert.throws(() => projectValidator(dup), /ID 중복/);
});

test('저장 형식: 작은·읽기 쉬운 JSON은 참조, 기준본 호환 JSON은 참조 없이 펼침(들여쓰기) — 세 형식 모두 다시 열면 같음', async () => {
  const { p } = historyProject({ racks: 30, imports: 3 });
  const io = { readText: (f) => f.text(), readBytes: async (f) => new Uint8Array(await f.arrayBuffer()), parse: JSON.parse };
  const texts = Object.fromEntries(['compact', 'pretty', 'legacy'].map((f) => [f, projectJsonText(p, f)]));
  assert.ok(texts.compact.includes('"$ref"') && texts.pretty.includes('"$ref"'));
  assert.ok(!texts.legacy.includes('"$ref"'));
  assert.equal(texts.legacy, JSON.stringify(p, null, 2), '기준본 호환 = 이전(E4 이전) 읽기 쉬운 JSON과 같은 원문');
  assert.equal(projectJsonText(JSON.parse(texts.compact), 'legacy'), texts.legacy, '참조가 든 객체도 펼쳐서 저장');
  for (const t of Object.values(texts)) assert.deepEqual(norm(await readProjectFile(new Blob([t]), io)), norm(p));
  assert.ok(texts.compact.length < JSON.stringify(p).length);
});

test('브라우저 저장(슬롯)·프로젝트 백업 링도 참조로 쓰고, 읽으면 원래와 같음', async () => {
  const { p, nextId } = historyProject({ racks: 30, imports: 3 });
  const mem = new Map();
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k), key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; } };
  const store = createProjectStore({ storage, prefix: 'e5', validate: projectValidator, now });
  await store.load();
  const r = await store.save(p);
  assert.equal(r.state ?? 'SAVED', 'SAVED');
  const raw = [...mem.entries()].find(([k]) => k.includes(':slot-'))[1];
  const { unpackStored } = await import('../../src/persistence/zip.js');
  assert.ok((await unpackStored(raw)).includes('"$ref"'));
  const back = await store.load();
  const project = back.project ?? back;
  assert.deepEqual(norm(project), norm({ ...p, persistence: project.persistence }));
  const ring = createBackupRing({ storage, prefix: 'e5', validate: projectValidator, fingerprint: (q) => JSON.stringify(q.scenarios), nextId, now });
  await ring.checkpoint(p, '가상 시험');
  const rows = await ring.list();
  assert.deepEqual(norm(rows.at(-1).project), norm(p));
  assert.ok((await unpackStored(ring.raw())).includes('"$ref"'));
});

test('참조 없는 기존 파일(v2.4.1·이전 시험판)은 그대로 읽힘', () => {
  const { p } = historyProject({ racks: 10, imports: 2 });
  const legacy = JSON.parse(JSON.stringify(p));
  assert.equal(countBackupRefs(legacy), 0);
  assert.deepEqual(norm(expandBackupRefs(structuredClone(legacy))), norm(p));
});
