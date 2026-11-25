// E8(D-095): 공유용 JSON(이력 제외) — 최신 Excel 기준일·현재 배치·설정만, 다시 불러와 정상, 비교 결론 동일.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { historyProject } from './size-fixture.js';
import { projectValidator } from '../../src/core/session.js';
import { shareProject, SHARE_DROPS } from '../../src/warehouse/share-export.js';
import { compareSummary, purposeCompare } from '../../src/metrics/space.js';
import { projectJsonText } from '../../src/persistence/project-file.js';

test('최신 Excel 기준일 스냅샷만 남기고 이력은 비움, 현재 배치·배치 정보·설정 그대로, 다시 불러와 검증 통과', () => {
  const { p } = historyProject({ racks: 30, imports: 6 });
  p.scenarioMeta.before.sourceInfo = { file: '가상', sheet: 'S', asOf: '2026-10-13', source: '가상', importedAt: '2026-11-25T00:00:00.000Z' };
  p.commandHistory = [{ id: 'c1', type: 'move', targetIds: [], before: null, after: null, time: '2026-11-25T00:00:00.000Z', success: true, reason: '', scenario: 'before' }];
  const { project: s, removed, keepDate } = shareProject(p);
  assert.equal(keepDate.before, '2026-10-13');
  assert.deepEqual(s.layoutSnapshots.map((x) => x.date), ['2026-10-13']);
  assert.deepEqual(s.excelSnapshots.map((x) => x.date), ['2026-10-13']);
  for (const k of SHARE_DROPS) assert.deepEqual(s[k], []);
  assert.deepEqual(s.autoPlacement.history, []);
  assert.equal(removed.layoutSnapshots, 5);
  assert.equal(removed.autoPlacementHistory, 6);
  assert.equal(removed.commandHistory, 1);
  assert.deepEqual(s.scenarios, p.scenarios);
  assert.deepEqual(s.scenarioMeta, p.scenarioMeta);
  assert.deepEqual(s.settings, p.settings);
  assert.equal(p.layoutSnapshots.length, 6, '입력은 바뀌지 않음');
  const loaded = projectValidator(JSON.parse(projectJsonText(projectValidator(s))));
  assert.deepEqual(compareSummary(loaded), compareSummary(p), '비교 화면 결론 동일');
  assert.deepEqual(purposeCompare(loaded), purposeCompare(p), '비교 지표 표 동일');
  assert.ok(Buffer.byteLength(projectJsonText(loaded)) < Buffer.byteLength(projectJsonText(p)));
});

test('최신 Excel 기준일이 없으면 배치별 가장 최근 스냅샷 기준일', () => {
  const { p } = historyProject({ racks: 10, imports: 3 });
  const { project: s, keepDate } = shareProject(p);
  assert.equal(keepDate.before, '2026-10-12');
  assert.equal(keepDate.after, null);
  assert.equal(s.layoutSnapshots.length, 1);
  projectValidator(s);
});
