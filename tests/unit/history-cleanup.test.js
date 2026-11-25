// E4(D-091): 이력 정리 — 최근 N개 보존, 현재 배치·최신 Excel 기준일 보호(삭제 0), 백업 안 복사본·자동 배치 이력 함께 정리, 크기 감소.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { historyProject } from './size-fixture.js';
import { projectValidator } from '../../src/core/session.js';
import { packProjectRefs, isBackupRef } from '../../src/core/backup-refs.js';
import { planCleanup, historySizes, DEFAULT_KEEP, CLEANUP_COMMAND } from '../../src/warehouse/history-cleanup.js';

const dates = (list, k = 'before') => list.filter((s) => s.scenario === k).map((s) => s.date).sort();

test('기본값: 보존 10개, 명령 이름', () => {
  assert.equal(DEFAULT_KEEP, 10);
  assert.equal(CLEANUP_COMMAND, '이력 정리');
});

test('기준일 14개 → 최근 10개만 보존, 최신 Excel 기준일·현재 배치는 그대로, 결과는 검증 통과', () => {
  const { p } = historyProject({ racks: 30, imports: 14 });
  p.scenarioMeta.before.sourceInfo = { file: '가상', sheet: 'S', asOf: '2026-10-11', source: '가상', importedAt: '2026-11-25T00:00:00.000Z' }; // 최신 Excel 기준일이 오래된 날짜인 경우
  const all = dates(p.layoutSnapshots);
  const { project: q, removed, changed } = planCleanup(p, { keep: 10 });
  assert.ok(changed);
  const keptExpected = [...new Set([...all.slice(-10), '2026-10-11'])].sort();
  assert.deepEqual(dates(q.layoutSnapshots), keptExpected);
  assert.deepEqual(dates(q.excelSnapshots), keptExpected);
  assert.equal(removed.layoutSnapshots, all.length - keptExpected.length);
  assert.equal(removed.excelSnapshots, all.length - keptExpected.length);
  assert.ok(dates(q.layoutSnapshots).includes(all.at(-1)), '가장 최근 기준일 보존');
  assert.deepEqual(q.scenarios, p.scenarios, '현재 BEFORE·AFTER 배치 그대로');
  assert.deepEqual(q.scenarioMeta, p.scenarioMeta);
  assert.deepEqual(q.inventoryHistory, p.inventoryHistory, '재고 이력은 정리하지 않음');
  assert.deepEqual(q.importHistory, p.importHistory);
  projectValidator(structuredClone(q));
  assert.notEqual(q, p);
  assert.equal(p.layoutSnapshots.length, all.length, '입력은 바뀌지 않음');
});

test('배치 백업 안 복사본도 보존 기준일만 남겨, 저장 시 모두 참조가 되어 크기가 줄어듦 · 자동 배치 이력 최근 10건', () => {
  const { p } = historyProject({ racks: 30, imports: 14 });
  const { project: q, removed } = planCleanup(p, { keep: 10 });
  const kept = new Set(q.layoutSnapshots.map((s) => s.date));
  for (const b of q.layoutBackups) for (const s of b.layoutSnapshots) assert.ok(kept.has(s.date));
  assert.ok(removed.backupSnapshots > 0);
  for (const b of packProjectRefs(q).layoutBackups) for (const s of [...b.layoutSnapshots, ...b.excelSnapshots]) assert.ok(isBackupRef(s), '남은 백업 안 스냅샷은 모두 참조');
  assert.equal(q.autoPlacement.history.length, 10);
  assert.deepEqual(q.autoPlacement.history, p.autoPlacement.history.slice(-10));
  assert.ok(historySizes(q).total < historySizes(p).total);
});

test('명령 이력 비우기는 선택, 정리할 것이 없으면 그대로', () => {
  const { p } = historyProject({ racks: 10, imports: 3 });
  p.commandHistory = [{ id: 'c1', type: 'move', targetIds: [], before: null, after: null, time: '2026-11-25T00:00:00.000Z', success: true, reason: '', scenario: 'before' }];
  const none = planCleanup(p, { keep: 10 });
  assert.equal(none.changed, false);
  assert.equal(none.project, p);
  const c = planCleanup(p, { keep: 10, clearCommands: true });
  assert.equal(c.removed.commandHistory, 1);
  assert.deepEqual(c.project.commandHistory, []);
  for (const keep of [0, -1, 1.5, NaN]) assert.throws(() => planCleanup(p, { keep }), /1 이상의 정수/);
});

test('항목별 크기 표: 저장 상태(참조 반영) 기준, 재고 이력·참고 도면은 표시만', () => {
  const { p } = historyProject({ racks: 10, imports: 2 });
  const s = historySizes(p);
  assert.deepEqual(s.rows.map((r) => r.key), ['layoutSnapshots', 'excelSnapshots', 'autoPlacementHistory', 'layoutBackups', 'commandHistory', 'inventoryHistory', 'background']);
  assert.equal(s.rows[0].count, 2);
  assert.equal(s.total, Buffer.byteLength(JSON.stringify(packProjectRefs(p))));
});
