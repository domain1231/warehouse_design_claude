// 2-슬롯 저장소 단위 검사. 메모리 저장소에 단계별 실패를 주입한다.
// 명세 33.5 SV01–SV05, SV08, SV11, SV12 및 다중 탭 보호(F-037)에 대응한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createProjectStore, LEGACY_KEY } from '../../src/persistence/storage.js';
import { unpackStored } from '../../src/persistence/zip.js';

const root = path.resolve(import.meta.dirname, '../..');
const legacyRaw = fs.readFileSync(path.join(root, 'fixtures/legacy/v2.4.1-primary.txt'), 'utf8');
const legacyProject = JSON.parse(fs.readFileSync(path.join(root, 'fixtures/legacy/v2.4.1-primary.project.json'), 'utf8'));

function memoryStorage() {
  const data = new Map();
  const s = {
    data,
    sets: 0,
    failSet: null, // (key) => Error | null
    corruptRead: null, // (key, value) => value
    onSet: null,
    getItem(k) {
      const v = data.has(k) ? data.get(k) : null;
      return s.corruptRead ? s.corruptRead(k, v) : v;
    },
    setItem(k, v) {
      const e = s.failSet?.(k);
      if (e) throw e;
      s.sets++;
      data.set(k, String(v));
      s.onSet?.(k);
    },
    removeItem(k) {
      data.delete(k);
    },
  };
  return s;
}

const quota = () => Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
const project = (name, extra = {}) => ({ version: '2.3.6', metadata: { name }, scenarios: { before: { objects: [] }, after: { objects: [] } }, ...extra });
let clock = 0;
const now = () => new Date(Date.UTC(2026, 10, 11, 0, 0, clock++)).toISOString();
const store = (storage, opts = {}) => createProjectStore({ storage, now, ...opts });
const snapshot = (s) => JSON.stringify([...s.data.entries()].sort());

test('빈 저장소: load → empty, 저장하면 SAVED/리비전 1, 새 인스턴스에서 그대로 복원(SV01·SV02·SV11)', async () => {
  const s = memoryStorage();
  const a = store(s);
  assert.equal((await a.load()).status, 'empty');
  const r = await a.save(project('P1'));
  assert.equal(r.state, 'SAVED');
  assert.equal(r.revision, 1);
  const loaded = await store(s).load();
  assert.equal(loaded.status, 'loaded');
  assert.equal(loaded.source, 'slot-a');
  assert.equal(loaded.project.metadata.name, 'P1');
  assert.deepEqual(loaded.project.persistence, r.persistence);
});

test('저장 전 load 필수', async () => {
  await assert.rejects(() => store(memoryStorage()).save(project('X')), { code: 'STATE' });
});

test('입력 프로젝트를 변경하지 않는다', async () => {
  const s = memoryStorage();
  const a = store(s);
  await a.load();
  const p = project('P1');
  const before = JSON.stringify(p);
  await a.save(p);
  assert.equal(JSON.stringify(p), before);
});

test('슬롯을 번갈아 쓰고 직전 저장본(last-good)을 보존한다', async () => {
  const s = memoryStorage();
  const a = store(s);
  await a.load();
  await a.save(project('P1'));
  const r2 = await a.save(project('P2'));
  assert.equal(r2.slot, 'b');
  assert.equal(r2.revision, 2);
  assert.equal((await a.lastGood()).metadata.name, 'P1');
  const r3 = await a.save(project('P3'));
  assert.equal(r3.slot, 'a');
  assert.equal((await a.lastGood()).metadata.name, 'P2');
});

test('내용이 같으면 저장하지 않는다(SV03)', async () => {
  const s = memoryStorage();
  const a = store(s);
  await a.load();
  await a.save(project('P1'));
  const sets = s.sets;
  const r = await a.save(project('P1'));
  assert.equal(r.state, 'UNCHANGED');
  assert.equal(s.sets, sets);
  // 다시 load한 인스턴스에서도 무변경 판정
  const b = store(s);
  await b.load();
  assert.equal((await b.save(project('P1'))).state, 'UNCHANGED');
  assert.equal(s.sets, sets);
});

for (const stage of ['slot', 'pointer']) {
  test(`${stage} 쓰기 QuotaExceededError: 안전한 실패, 기존 저장본 보존(SV04·SV05)`, async () => {
    const s = memoryStorage();
    const a = store(s);
    await a.load();
    await a.save(project('P1'));
    const before = s.data.get(a.keys.pointer);
    s.failSet = (k) => ((stage === 'slot' ? k.includes(':slot-') : k === a.keys.pointer) ? quota() : null);
    await assert.rejects(() => a.save(project('P2')), (e) => e.code === 'QUOTA' && e.stage === `${stage}-write` && e.cause.name === 'QuotaExceededError');
    assert.equal(s.data.get(a.keys.pointer), before);
    assert.equal((await store(s).load()).project.metadata.name, 'P1');
    // 저장 실패 후 재시도 성공(SV12)
    s.failSet = null;
    const r = await a.save(project('P2'));
    assert.equal(r.state, 'SAVED');
    assert.equal((await store(s).load()).project.metadata.name, 'P2');
  });
}

test('슬롯 읽기 확인 불일치: VERIFY, 포인터 그대로', async () => {
  const s = memoryStorage();
  const a = store(s);
  await a.load();
  await a.save(project('P1'));
  const before = s.data.get(a.keys.pointer);
  s.corruptRead = (k, v) => (k.endsWith(':slot-b') && v ? v + ' ' : v);
  await assert.rejects(() => a.save(project('P2')), { code: 'VERIFY', stage: 'slot-readback' });
  s.corruptRead = null;
  assert.equal(s.data.get(a.keys.pointer), before);
  assert.equal((await store(s).load()).project.metadata.name, 'P1');
});

test('포인터 읽기 확인 불일치: 이전 포인터로 되돌린다', async () => {
  const s = memoryStorage();
  const a = store(s);
  await a.load();
  await a.save(project('P1'));
  const before = s.data.get(a.keys.pointer);
  let armed = false;
  s.onSet = (k) => {
    if (k === a.keys.pointer) armed = true;
  };
  s.corruptRead = (k, v) => (armed && k === a.keys.pointer && v !== before ? 'garbage' : v);
  await assert.rejects(() => a.save(project('P2')), { code: 'VERIFY', stage: 'pointer-readback' });
  s.corruptRead = null;
  s.onSet = null;
  assert.equal(s.data.get(a.keys.pointer), before);
  assert.equal((await store(s).load()).project.metadata.name, 'P1');
});

test('검증 실패: 아무것도 쓰지 않는다', async () => {
  const s = memoryStorage();
  const validate = (p) => {
    if (p.metadata.name === 'BAD') throw new Error('invalid');
    return p;
  };
  const a = store(s, { validate });
  await a.load();
  await a.save(project('P1'));
  const snap = snapshot(s);
  await assert.rejects(() => a.save(project('BAD')), { code: 'VALIDATION' });
  assert.equal(snapshot(s), snap);
});

test('다른 탭이 먼저 저장하면 덮어쓰지 않고, 확인(force) 시에만 덮어쓴다(F-037)', async () => {
  const s = memoryStorage();
  const tabA = store(s);
  const tabB = store(s);
  await tabA.load();
  await tabA.save(project('BASE'));
  await tabB.load();
  await tabA.save(project('A-1'));
  const afterA = snapshot(s);
  await assert.rejects(() => tabB.save(project('B-1')), { code: 'CONFLICT', stage: 'concurrency' });
  assert.equal(snapshot(s), afterA);
  const r = await tabB.save(project('B-1'), { force: true });
  assert.equal(r.state, 'SAVED');
  assert.equal(r.revision, 3);
  assert.equal((await tabB.lastGood()).metadata.name, 'A-1');
  // 이제 A가 오래된 탭
  await assert.rejects(() => tabA.save(project('A-2')), { code: 'CONFLICT' });
});

test('저장(압축) 도중 다른 탭이 저장하면 포인터 교체 직전에 중단한다', async () => {
  const s = memoryStorage();
  const tabA = store(s);
  await tabA.load();
  await tabA.save(project('BASE'));
  const pointerKey = tabA.keys.pointer;
  s.onSet = (k) => {
    if (k.includes(':slot-')) s.data.set(pointerKey, s.data.get(pointerKey).replace('"revision":1', '"revision":7'));
  };
  await assert.rejects(() => tabA.save(project('A-1')), { code: 'CONFLICT', stage: 'concurrency-final' });
  s.onSet = null;
});

test('isExternalChange: 다른 탭의 포인터 변경만 감지한다', async () => {
  const s = memoryStorage();
  const tabA = store(s);
  const tabB = store(s);
  await tabA.load();
  await tabB.load();
  await tabA.save(project('A-1'));
  const event = { key: tabA.keys.pointer, newValue: s.data.get(tabA.keys.pointer) };
  assert.equal(tabA.isExternalChange(event), false);
  assert.equal(tabB.isExternalChange(event), true);
  assert.equal(tabB.isExternalChange({ key: 'other', newValue: 'x' }), false);
});

test('같은 저장소의 동시 저장 요청은 순서대로 처리된다', async () => {
  const s = memoryStorage();
  const a = store(s);
  await a.load();
  const [r1, r2] = await Promise.all([a.save(project('P1')), a.save(project('P2'))]);
  assert.deepEqual([r1.revision, r2.revision], [1, 2]);
  assert.equal((await store(s).load()).project.metadata.name, 'P2');
});

test('기준본 v2.4.1 저장본을 읽고, 저장해도 기준본 키는 바꾸지 않는다(SV10, D-006)', async () => {
  const s = memoryStorage();
  s.data.set(LEGACY_KEY, legacyRaw);
  const a = store(s);
  const loaded = await a.load();
  assert.equal(loaded.status, 'loaded');
  assert.equal(loaded.source, 'legacy');
  assert.deepEqual(loaded.project, legacyProject);
  const r = await a.save(loaded.project);
  assert.equal(r.state, 'SAVED');
  assert.equal(r.revision, legacyProject.persistence.revision + 1);
  assert.equal(s.data.get(LEGACY_KEY), legacyRaw);
  const again = await store(s).load();
  assert.equal(again.source, 'slot-a');
  const { persistence: p1, ...restA } = again.project;
  const { persistence: p2, ...restB } = legacyProject;
  assert.deepEqual(restA, restB);
});

test('저장 원문은 기준본과 같은 압축 형식이다(되돌림 호환)', async () => {
  const s = memoryStorage();
  const a = store(s);
  await a.load();
  await a.save(project('P1'));
  const raw = s.data.get(a.keys.a);
  assert.equal(JSON.parse(raw).format, 'warehouse-backup-zip-v1');
  assert.equal(JSON.parse(await unpackStored(raw)).metadata.name, 'P1');
});

test('활성 슬롯 손상: corrupt로 보고하고 저장을 보호, 명시적 교체만 허용', async () => {
  const s = memoryStorage();
  const a = store(s);
  await a.load();
  await a.save(project('P1'));
  await a.save(project('P2'));
  s.data.set(a.keys.b, '{"format":"warehouse-backup-zip-v1","data":"AAAA"}');
  const b = store(s);
  const r = await b.load();
  assert.equal(r.status, 'corrupt');
  assert.equal(r.error.code, 'CORRUPT');
  assert.equal(r.lastGoodAvailable, true);
  assert.equal((await b.lastGood()).metadata.name, 'P1');
  const snap = snapshot(s);
  await assert.rejects(() => b.save(project('P3')), { code: 'CORRUPT', stage: 'protected' });
  assert.equal(snapshot(s), snap);
  assert.equal((await b.save(project('P3'), { replaceCorrupt: true })).state, 'SAVED');
});
