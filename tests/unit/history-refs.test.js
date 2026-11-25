// E6(D-090): 자동 배치 확인 이력(autoPlacement.history)의 배치를 저장 시 배치 스냅샷 참조로 — 크기 감소, 왕복 동일, 지문 일치, 기준본 검증 통과 형태.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { historyProject } from './size-fixture.js';
import { projectValidator } from '../../src/core/session.js';
import { validateLayout } from '../../src/core/project.js';
import { scanLayout } from '../../src/warehouse/constraints.js';
import { packHistoryRefs, packBackupRefs, packProjectRefs, countHistoryRefs, LAYOUT_REF_KEY } from '../../src/core/backup-refs.js';
import { projectJsonText } from '../../src/persistence/project-file.js';

const bytes = (v) => Buffer.byteLength(JSON.stringify(v));
const norm = (p) => JSON.parse(JSON.stringify(projectValidator(structuredClone(p))));
const load = (q) => projectValidator(JSON.parse(JSON.stringify(q)));

test('이력 배치가 같은 배치 스냅샷과 같으면 객체를 비운 참조 배치로 저장: 크기 대폭 감소, 메모리는 그대로', () => {
  const { p } = historyProject({ racks: 300, imports: 2 }); // 로드맵 F7: 이력 2건
  const q = packHistoryRefs(p);
  assert.equal(countHistoryRefs(p), 0);
  assert.equal(countHistoryRefs(q), 2);
  for (const h of q.autoPlacement.history) {
    assert.deepEqual(h.layout.objects, []);
    assert.equal(typeof h.layout[LAYOUT_REF_KEY], 'string');
    validateLayout(structuredClone(h.layout)); // 기준본과 같은 검증(이력마다 유효한 layout 요구) 통과
  }
  const full = bytes(p.autoPlacement.history), small = bytes(q.autoPlacement.history);
  assert.ok(small <= full * 0.05, `${full} → ${small}`); // 로드맵 기준 712KB → 400KB 이하보다 작음
  assert.equal(packHistoryRefs(q), q, '두 번 적용해도 같음');
});

test('왕복 동일 · 읽은 뒤 이력 배치의 검사 지문 = 저장된 지문(기준본 대조 X2와 같은 확인)', () => {
  const { p } = historyProject({ racks: 60, imports: 4 });
  const loaded = load(packProjectRefs(p));
  assert.equal(countHistoryRefs(loaded), 0);
  assert.deepEqual(norm(loaded), norm(p));
  for (const h of loaded.autoPlacement.history) assert.equal(scanLayout(h.layout, loaded).fingerprint, h.fingerprint);
});

test('참조하지 않는 경우: 이력 뒤에 바뀐 스냅샷 · 겹치는 스냅샷 ID', () => {
  const { p } = historyProject({ racks: 20, imports: 2 });
  const q = structuredClone(p);
  q.layoutSnapshots[0].layout.objects[0].x += 0.5;
  const packed = packHistoryRefs(q);
  assert.equal(countHistoryRefs(packed), 1);
  assert.ok(packed.autoPlacement.history[0].layout.objects.length > 0);
  const dup = structuredClone(p);
  dup.layoutSnapshots.push({ ...structuredClone(dup.layoutSnapshots[0]), date: '2026-11-01' });
  assert.ok(packHistoryRefs(dup).autoPlacement.history[0].layout.objects.length > 0);
});

test('참조 스냅샷이 사라진 파일(이전 앱에서 지우고 저장): 열리고, 그 이력은 객체 없는 배치로 남음', () => {
  const { p } = historyProject({ racks: 20, imports: 2 });
  // 이전 앱(차분 저장 이전)이 쓴 파일: 참조만 있고 차분은 없다
  const packed = JSON.parse(JSON.stringify(packHistoryRefs(packBackupRefs(p))));
  const gone = packed.autoPlacement.history[0].layout[LAYOUT_REF_KEY];
  packed.layoutSnapshots = packed.layoutSnapshots.filter((s) => s.id !== gone);
  for (const b of packed.layoutBackups) b.layoutSnapshots = b.layoutSnapshots.filter((s) => s.$ref !== gone);
  const loaded = projectValidator(packed);
  assert.equal(countHistoryRefs(loaded), 1);
  assert.deepEqual(loaded.autoPlacement.history[0].layout.objects, []);
  assert.ok(loaded.autoPlacement.history[1].layout.objects.length > 0);
});

test('저장 형식: 작은 JSON은 이력 참조, 기준본 호환 JSON은 펼침', () => {
  const { p } = historyProject({ racks: 30, imports: 2 });
  assert.ok(projectJsonText(p).includes(`"${LAYOUT_REF_KEY}"`));
  const legacy = projectJsonText(p, 'legacy');
  assert.ok(!legacy.includes(LAYOUT_REF_KEY) && !legacy.includes('"$ref"'));
  assert.equal(legacy, JSON.stringify(p, null, 2));
});
