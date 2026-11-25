// D-094: 기준일 스냅샷 차분 저장 — 차분·적용 왕복(키 순서 포함), 시나리오 왕복 동일, 기준점, 손상 검출, 기준본 호환 JSON.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diff, patch, deepSame, packSnapshotDeltas, expandSnapshotDeltas, countSnapshotDeltas, DELTA_KEY, KEYFRAME_EVERY } from '../../src/core/snapshot-delta.js';
import { usageProject } from './helpers/usage-scenario.js';
import { historyProject } from './size-fixture.js';
import { projectValidator } from '../../src/core/session.js';
import { packProjectRefs } from '../../src/core/backup-refs.js';
import { projectJsonText } from '../../src/persistence/project-file.js';

const rt = (a, b) => { const d = diff(a, b); const r = patch(a, d); assert.equal(JSON.stringify(r), JSON.stringify(b)); return d; };

test('차분·적용 왕복: 객체 키 추가·삭제·순서, ID 배열 추가·삭제·순서, 길이가 같은/다른 배열, 원시값', () => {
  assert.equal(diff({ a: 1 }, { a: 1 }), undefined);
  rt({ a: 1, b: 2 }, { a: 1, b: 3 });
  rt({ a: 1, b: 2 }, { b: 2, a: 1 }); // 순서만 바뀜
  rt({ a: 1, b: 2 }, { a: 1 });
  rt({ a: 1 }, { a: 1, c: { d: [1, 2] } });
  rt({ o: [{ id: 'x', v: 1 }, { id: 'y', v: 2 }] }, { o: [{ id: 'y', v: 2 }, { id: 'x', v: 5 }, { id: 'z', v: 0 }] });
  rt({ o: [{ id: 'x', v: 1 }, { id: 'y', v: 2 }] }, { o: [{ id: 'x', v: 1 }] });
  rt([1, 2, 3], [1, 9, 3]);
  rt([1, 2, 3], [1, 2]);
  rt({ a: null }, { a: 0 });
  rt({ a: 'x' }, { a: { b: 1 } });
  rt({ a: [{ id: 'p' }, { id: 'p' }] }, { a: [{ id: 'p' }] }); // 겹치는 ID는 일반 배열로
  const a = { k: [1, 2] }; patch(a, diff(a, { k: [1, 3] }));
  assert.deepEqual(a, { k: [1, 2] }, '입력은 바뀌지 않음');
  assert.ok(deepSame({ a: 1, b: undefined }, { a: 1 }));
  assert.ok(!deepSame({ a: 1, b: 2 }, { b: 2, a: 1 }), '키 순서도 비교');
});

test('무작위 객체 300쌍 왕복', () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  const gen = (depth) => {
    const r = rnd();
    if (depth > 3 || r < 0.3) return [null, true, 1.5, 'a', 0, -2][Math.floor(rnd() * 6)];
    if (r < 0.55) return Array.from({ length: Math.floor(rnd() * 4) }, () => gen(depth + 1));
    if (r < 0.75) return Array.from({ length: Math.floor(rnd() * 4) }, (_, i) => ({ id: 'i' + Math.floor(rnd() * 6) + i, v: gen(depth + 1) }));
    return Object.fromEntries(Array.from({ length: Math.floor(rnd() * 4) }, () => ['k' + Math.floor(rnd() * 5), gen(depth + 1)]));
  };
  for (let i = 0; i < 300; i++) { const a = gen(0), b = rnd() < 0.5 ? gen(0) : JSON.parse(JSON.stringify(a)); rt(a, b); }
});

test('가상 사용 시나리오: 차분 저장 후 읽으면 원래와 같고(JSON 문자열까지), 기준점은 10개마다', () => {
  const p = usageProject();
  const packed = packSnapshotDeltas(p);
  assert.equal(countSnapshotDeltas(p), 0, '메모리는 그대로');
  const n = countSnapshotDeltas(packed);
  const chains = { 'layoutSnapshots|before': 30, 'layoutSnapshots|after': 40, 'excelSnapshots|before': 30, 'excelSnapshots|after': 10 };
  const expected = Object.values(chains).reduce((m, len) => m + (len - 1 - Math.floor((len - 1) / KEYFRAME_EVERY)), 0);
  assert.equal(n, expected);
  const back = expandSnapshotDeltas(JSON.parse(JSON.stringify(packed)));
  assert.equal(JSON.stringify(back.layoutSnapshots), JSON.stringify(p.layoutSnapshots));
  assert.equal(JSON.stringify(back.excelSnapshots), JSON.stringify(p.excelSnapshots));
  const full = Buffer.byteLength(JSON.stringify(p.layoutSnapshots) + JSON.stringify(p.excelSnapshots));
  const small = Buffer.byteLength(JSON.stringify(packed.layoutSnapshots) + JSON.stringify(packed.excelSnapshots));
  assert.ok(small < full / 4, `${full} → ${small}`);
  const loaded = projectValidator(JSON.parse(projectJsonText(p)));
  assert.equal(JSON.stringify(loaded), JSON.stringify(projectValidator(structuredClone(p))));
});

test('손상 검출: 기준 스냅샷이 없거나 ID가 겹치면 검증 실패(조용히 비우지 않음)', () => {
  const { p } = historyProject({ racks: 10, imports: 4 });
  const packed = JSON.parse(JSON.stringify(packProjectRefs(p)));
  const d = packed.layoutSnapshots.find((s) => s[DELTA_KEY]);
  assert.ok(d, '차분 스냅샷 있음');
  const gone = structuredClone(packed);
  gone.layoutSnapshots = gone.layoutSnapshots.filter((s) => s.id !== d[DELTA_KEY].base);
  assert.throws(() => projectValidator(gone), /스냅샷 차분 오류: layoutSnapshots 기준 .* 없음|백업 참조 오류/);
  const dup = structuredClone(packed);
  const base = dup.layoutSnapshots.find((s) => s.id === d[DELTA_KEY].base);
  dup.layoutSnapshots.push({ ...structuredClone(base), date: '2027-01-01' });
  assert.throws(() => projectValidator(dup), /ID 중복/);
});

test('기준본 호환 JSON은 차분·참조 없이 펼침, 작은 JSON에는 차분', () => {
  const { p } = historyProject({ racks: 10, imports: 3 });
  assert.ok(projectJsonText(p).includes(`"${DELTA_KEY}"`));
  const legacy = projectJsonText(p, 'legacy');
  assert.ok(!legacy.includes(DELTA_KEY));
  assert.equal(legacy, JSON.stringify(p, null, 2));
  assert.equal(projectJsonText(JSON.parse(projectJsonText(p)), 'legacy'), legacy, '차분이 든 객체도 펼쳐서 저장');
});

test('스냅샷 1개뿐이거나 줄어들지 않으면 그대로', () => {
  const { p } = historyProject({ racks: 10, imports: 1 });
  assert.equal(packSnapshotDeltas(p), p);
  const q = structuredClone(p);
  q.layoutSnapshots.push({ ...structuredClone(q.layoutSnapshots[0]), id: 'other', date: '2026-12-01', layout: { warehouse: { width: 5, height: 5, ceiling: 3 }, objects: [] } });
  const packed = packSnapshotDeltas(q);
  assert.ok(!packed.layoutSnapshots[1][DELTA_KEY], '완전히 다른 배치는 차분이 커서 전체로');
});
