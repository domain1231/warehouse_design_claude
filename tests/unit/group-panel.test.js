// 선택 정보 패널 계산(기준본 50 M.groupPanel·60·90) 단위 검사
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createObject, validateProject } from '../../src/core/project.js';
import { createIdGenerator } from '../../src/core/ids.js';
import { applyCommand, active, setLimit, setAspectLock, setAisleField, setReviewMark, LIMIT_COMMAND } from '../../src/warehouse/commands.js';
import { groupStats, selectedCsvRows, recentCommands, GROUP_BUTTONS, SELECTED_CSV_NAME } from '../../src/warehouse/group-panel.js';
import { placementLines, aisleInfoLines, parseScope, scopeText, dimsText } from '../../src/warehouse/inspector-info.js';
import { GROUP_ACTIONS } from '../../src/warehouse/commands.js';

const nextId = createIdGenerator({ seed: 'gp' });
function base() {
  const p = validateProject(createProject({ sample: false, nextId }));
  const l = p.scenarios.after;
  l.warehouse = { width: 20, height: 10, ceiling: 3 };
  l.objects = [
    createObject('rack', 1, 1, 2, 1, { id: 'A', code: 'R-1', capacity: 10 }, { nextId }),
    createObject('rack', 5, 4, 1, 3, { id: 'B', code: 'R-2', rotation: 90, unit: 'EA' }, { nextId }),
    createObject('aisle', 8, 1, 6, 1.5, { id: 'AI', code: '통로' }, { nextId }),
    createObject('door', 0, 0, 1, 1, { id: 'D', code: '문 1' }, { nextId }),
  ];
  p.settings.scenario = 'after';
  p.editing.allowWarnings = true;
  return validateProject(p);
}
const run = (p, mutate) => applyCommand(p, mutate, { nextId, command: 'x' });

test('GROUP_BUTTONS 12개 키가 GROUP_ACTIONS와 같다', () => {
  assert.equal(GROUP_BUTTONS.length, 12);
  assert.deepEqual(GROUP_BUTTONS.map((b) => b[0]).sort(), GROUP_ACTIONS.map((a) => a[0]).sort());
});

test('groupStats: 회전 외곽 합집합 상자·면적·경고·단위별 최대', () => {
  const p = base(), racks = active(p).objects.filter((o) => o.kind === 'rack');
  const s = groupStats(racks, [{ key: 'pair:A:B', ids: ['A'] }, { key: 'aisle-x', ids: ['B', 'AI'] }, { key: 'gap:C', ids: ['Z'] }], new Set(['A', 'B']));
  // B는 1x3을 90° 회전 → 외접 x 4..7, y 5..6 / A는 x 1..3, y 1..2 → 외곽 6 x 5
  assert.ok(Math.abs(s.width - 6) < 1e-9 && Math.abs(s.depth - 5) < 1e-9);
  assert.equal(s.area, 5);
  assert.equal(s.spaceWarnings, 2);
  assert.equal(s.aisleWarnings, 1);
  assert.deepEqual(s.units, [{ unit: 'BOX', capacity: 10, known: 1, total: 1 }, { unit: 'EA', capacity: 0, known: 0, total: 1 }]);
});

test('selectedCsvRows: 저장 좌표를 반올림 없이 그대로 내보낸다', () => {
  const rows = selectedCsvRows([{ id: 'A', code: 'R', x: 1.2345, y: 2, rotation: 0, width: 1, depth: 2, height: 2 }]);
  assert.deepEqual(rows[0], ['id', 'code', 'x', 'y', 'rotation', 'width', 'depth', 'height']);
  assert.deepEqual(rows[1], ['A', 'R', 1.2345, 2, 0, 1, 2, 2]);
  assert.equal(SELECTED_CSV_NAME, 'selected_rack_positions.csv');
});

test('recentCommands: 최신 8개를 최신 순으로', () => {
  const h = Array.from({ length: 12 }, (_, i) => ({ i }));
  assert.deepEqual(recentCommands(h).map((x) => x.i), [11, 10, 9, 8, 7, 6, 5, 4]);
});

test('placementLines·dimsText·aisleInfoLines 문구', () => {
  const o = { placementMeta: { manualEdited: null, waiting: false } };
  assert.deepEqual(placementLines(o, { excess: {}, issues: [] }, false, () => '경계 내부'), ['수동 편집: 이전 자료 · 미확인 / 일반 위치', '경계 내부', '위반 없음 · 해결']);
  assert.equal(placementLines({ placementMeta: { manualEdited: true, waiting: true } }, { excess: {}, issues: [{ text: 'a' }, { text: 'b' }] }, true, () => 'e')[2], 'a / b · 검토 중');
  assert.equal(placementLines({ placementMeta: { manualEdited: false } }, { excess: {}, issues: [{ text: 'a' }] }, false, () => 'e')[2], 'a · 미해결');
  assert.equal(dimsText({ width: 0.8, depth: 1.85, height: null }), '0.8m × 1.85m × 미확인');
  assert.equal(dimsText(null), '미확인');
  const c = { enabled: true, axis: 'y', width: 1.05, min: 1.2, shortage: 0.15, obstacles: [1, 2, 3], partial: false, connected: null };
  assert.deepEqual(aisleInfoLines(c), ['검사 사용 · 단면 Y', '확보 1.05m / 최소 1.2m', '부족 0.15m / 침범 3개', '모든 랙·고정물 검사', '연결: 미지정·연결성 미검증']);
});

test('parseScope·scopeText: 랙 번호 ↔ ID, 없는 번호는 null', () => {
  const l = active(base());
  assert.deepEqual(parseScope('R-1, R-2', l.objects), ['A', 'B']);
  assert.deepEqual(parseScope('', l.objects), []);
  assert.equal(parseScope('R-1,없음', l.objects), null);
  assert.equal(scopeText({ scopeIds: ['B', 'A', 'zz'] }, l.objects), 'R-2,R-1,zz');
});

test('통로 설정·검토 표시·크기 제한 명령: 적용·실행 기록·실패 시 원본 보존', () => {
  const p = base();
  const a = run(p, setAisleField('AI', 'clearanceAxis', 'x'));
  assert.ok(a.ok);
  assert.equal(active(a.project).objects.find((o) => o.id === 'AI').clearanceAxis, 'x');
  assert.equal(active(p).objects.find((o) => o.id === 'AI').clearanceAxis, undefined);
  const b = run(a.project, setAisleField('AI', 'scopeIds', ['A']));
  assert.deepEqual(active(b.project).objects.find((o) => o.id === 'AI').scopeIds, ['A']);
  assert.ok(run(b.project, setAisleField('AI', 'linkedDoorId', 'D')).ok);
  assert.throws(() => setAisleField('AI', 'x', 1)(p, active(p)));
  const bad = run(p, setAisleField('AI', 'clearanceAxis', 'z'));
  assert.equal(bad.ok, false);
  const r = run(p, setReviewMark('A', true));
  assert.equal(r.project.autoPlacement.reviewNotes.after.A, 'review');
  assert.equal(run(r.project, setReviewMark('A', false)).project.autoPlacement.reviewNotes.after.A, undefined);
  const lim = applyCommand(p, setLimit('A', 'maxWidth', 0.01), { nextId, command: LIMIT_COMMAND });
  assert.equal(lim.ok, false); // 최대 폭이 최소 폭(0.05m)보다 작으면 검증이 거부한다
  assert.equal(active(p).objects.find((o) => o.id === 'A').resizeConstraints.maxWidth, 500);
  assert.ok(run(p, setLimit('A', 'minWidth', 0.5)).ok);
  assert.equal(run(p, setLimit('A', 'minWidth', 0)).ok, false);
  assert.equal(active(run(p, setAspectLock('A', true)).project).objects[0].resizeConstraints.aspectLocked, true);
});
