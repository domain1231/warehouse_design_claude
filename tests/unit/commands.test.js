// 편집 명령 세부 규칙(기준본 대조 E1이 다루지 않는 경계)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createObject, validateProject } from '../../src/core/project.js';
import { createIdGenerator } from '../../src/core/ids.js';
import { applyCommand, applyMove, setDimension, isMmInput, alignmentGuides, nextCode, addObjectAt, active, changedIds } from '../../src/warehouse/commands.js';
import { addMm, snapToStep, roundMm } from '../../src/geometry/tolerance.js';
import { createSession, projectValidator } from '../../src/core/session.js';
import { createProjectStore } from '../../src/persistence/storage.js';

const now = () => '2026-11-15T00:00:00.000Z';
function base({ allowWarnings = true } = {}) {
  const nextId = createIdGenerator({ seed: 'cmd' });
  const p = validateProject(createProject({ sample: false, nextId }));
  const l = p.scenarios.after;
  l.warehouse = { width: 20, height: 10, ceiling: 3 };
  l.objects = [
    createObject('rack', 2, 2, 1, 0.5, { id: 'A', code: 'R-001' }, { nextId }),
    createObject('rack', 5, 2, 1, 0.5, { id: 'B', code: 'R-002' }, { nextId }),
    createObject('rack', 8, 2, 1, 0.5, { id: 'C', code: 'R-003' }, { nextId }),
  ];
  p.editing.allowWarnings = allowWarnings;
  p.settings.scenario = 'after';
  return { p: validateProject(p), nextId };
}

test('mm 연산: 1mm 단위끼리는 정수 mm 덧셈, 그 외 값은 소수 12자리 정리로 보존, 스냅·반올림', () => {
  assert.equal(addMm(0.1, 0.2), 0.3);
  assert.equal(addMm(1.2345678, 0.01), 1.2445678);
  assert.equal(snapToStep(1.2345, 0.01), 1.23);
  assert.equal(snapToStep(1.235, 0.05), 1.25);
  assert.equal(roundMm(0.12345), 0.123);
  assert.equal(isMmInput('1.234'), true);
  assert.equal(isMmInput('1.2345'), false);
  assert.equal(isMmInput(''), false);
  assert.equal(isMmInput('abc'), false);
});

test('명령: 입력 프로젝트는 바뀌지 않고, 성공하면 바뀐 객체만 기록·수동 편집 표시', () => {
  const { p, nextId } = base();
  const snapshot = JSON.stringify(p);
  const r = applyCommand(p, (d, l) => { l.objects[0].x = 3; }, { nextId, now });
  assert.equal(JSON.stringify(p), snapshot);
  assert.equal(r.ok, true);
  assert.deepEqual([...r.ids], ['A']);
  const log = r.project.commandHistory.at(-1);
  assert.deepEqual([log.type, log.success, log.scenario, log.targetIds], ['객체 수정', true, 'after', ['A']]);
  assert.equal(active(r.project).objects[0].placementMeta.manualEdited, true);
  // 기하가 바뀌지 않는 편집은 기록하지 않는다
  const r2 = applyCommand(r.project, (d, l) => { l.objects[0].note = '메모'; }, { nextId, now });
  assert.equal(r2.project.commandHistory.length, r.project.commandHistory.length);
});

test('명령: 위치 잠금 랙 변경 거부, 경고 허용 끔이면 새 충돌은 전체 취소(선택 객체만 실패 기록)', () => {
  const { p, nextId } = base({ allowWarnings: false });
  active(p).objects[0].placementMeta.positionLocked = true;
  const locked = applyCommand(p, (d, l) => { l.objects[0].x = 3; }, { nextId, now, selection: ['A', 'zzz'] });
  assert.equal(locked.ok, false);
  assert.match(locked.reason, /R-001 · 위치 잠금/);
  assert.deepEqual(locked.project.commandHistory.at(-1).targetIds, ['A']);
  assert.equal(active(locked.project).objects[0].x, 2);
  const hit = applyCommand(p, (d, l) => { l.objects[1].x = 2.5; }, { nextId, now });
  assert.equal(hit.ok, false);
  assert.match(hit.reason, /충돌/);
  assert.equal(applyCommand(p, (d, l) => { l.objects[1].x = 2.5; }, { nextId, now, overrideAllow: true }).ok, true);
});

test('명령: 설정의 정책을 바꾸면 경고 허용이 따라가고, 새 통로는 통로 기준값을 받는다', () => {
  const { p, nextId } = base({ allowWarnings: false });
  p.settings.policy = 'block';
  const r = applyCommand(p, (d) => { d.settings.policy = 'warn'; }, { nextId, now });
  assert.equal(r.project.editing.allowWarnings, true);
  p.aisleRules['자재 운반 통로'] = { minWidth: 1.4, targetWidth: 1.8, enabled: false };
  const a = applyCommand(p, (d, l) => { l.objects.push(createObject('aisle', 1, 5, 6, 2, { id: 'N', code: '통로 001', aisleType: '자재 운반 통로' }, { nextId })); }, { nextId, now });
  const n = active(a.project).objects.find((o) => o.id === 'N');
  assert.deepEqual([n.minWidth, n.targetWidth, n.warningsEnabled, n.clearanceAxis], [1.4, 1.8, false, 'auto']);
});

test('설계 치수: 비율 고정이면 다른 변도 비례, 크기 제한 밖은 거부, 규격 이력은 500개 유지', () => {
  const { p, nextId } = base();
  active(p).objects[0].resizeConstraints.aspectLocked = true;
  const r = applyCommand(p, setDimension('A', 'width', '2'), { nextId, now });
  const o = active(r.project).objects[0];
  assert.deepEqual([o.width, o.depth], [2, 1]);
  assert.equal(r.project.specificationHistory.at(-1).type, 'design-only');
  assert.equal(applyCommand(p, setDimension('B', 'depth', '600'), { nextId, now }).reason, '설정된 최소·최대 크기를 벗어났습니다.');
  p.specificationHistory = Array.from({ length: 500 }, (_, i) => ({ id: `h${i}`, time: now(), rackId: 'A', code: 'R-001', scenario: 'after', type: 'design-only', before: { width: 1, depth: 1, height: 2 }, after: { width: 1, depth: 1, height: 2 }, source: 's' }));
  const capped = applyCommand(p, setDimension('B', 'width', '1.1'), { nextId, now });
  assert.equal(capped.project.specificationHistory.length, 500);
  assert.equal(capped.project.specificationHistory[0].id, 'h1');
});

test('명령 기록은 200개를 넘지 않는다', () => {
  let { p, nextId } = base();
  for (let i = 0; i < 205; i++) p = applyCommand(p, (d, l) => { l.objects[2].y = 2 + (i % 2) * 0.01; }, { nextId, now }).project;
  assert.equal(p.commandHistory.length, 200);
});

test('추가: 창고 밖 클릭은 무시, 표시 코드는 빈 번호부터', () => {
  const { p, nextId } = base();
  assert.equal(addObjectAt(p, 'rack', { x: -1, y: 2 }, { nextId }), null);
  assert.equal(nextCode(active(p), 'rack'), 'R-004');
  assert.equal(nextCode(active(p), 'column'), '기둥 001');
});

test('이동: 움직이지 않으면 기록 없음, 경고 허용 끔이면 겹침 이동은 실패 기록', () => {
  const { p, nextId } = base({ allowWarnings: false });
  assert.equal(applyMove(p, ['A'], 0, 0, { nextId, now }).moved, false);
  const r = applyMove(p, ['A'], 3, 0, { nextId, now });
  assert.equal(r.ok, false);
  assert.equal(r.project.commandHistory.at(-1).type, '객체 이동');
  const ok = applyMove(p, ['A', 'B'], 0, 1, { nextId, now });
  assert.equal(ok.project.commandHistory.at(-1).type, '그룹 이동');
  assert.deepEqual(active(ok.project).objects.slice(0, 2).map((o) => o.y), [3, 3]);
});

test('정렬 가이드: 허용 거리 안의 외곽선 후보, 스냅+흡착일 때만 이동량 보정, 균등 간격', () => {
  const { p } = base();
  const l = active(p);
  const B = l.objects[1];
  // B를 A·C 사이 가운데에서 0.02m 오른쪽으로: 균등 간격 후보 -0.02
  let g = alignmentGuides(p, l, [B], 0.02, 0, 100);
  assert.equal(g.dx, 0.02); // 흡착 꺼짐
  assert.ok(g.guides.some((x) => x.type === 'equal-x' && Math.abs(x.delta + 0.02) < 1e-9));
  p.precision.guideSnap = true;
  g = alignmentGuides(p, l, [B], 0.02, 0, 100);
  assert.equal(g.dx, 0);
  // 화면 배율이 작으면 허용 거리(6px)가 0.04m로 제한
  g = alignmentGuides(p, l, [B], 0.05, 0, 1);
  assert.equal(g.dx, 0.05);
  p.precision.guides = false;
  assert.deepEqual(alignmentGuides(p, l, [B], 0.02, 0, 100), { dx: 0.02, dy: 0, guides: [] });
});

test('바뀐 객체: 추가·삭제·기하 변경·창고 크기 변경(전체)', () => {
  const a = { warehouse: { width: 1 }, objects: [{ id: 'x', kind: 'rack', x: 0 }, { id: 'y', kind: 'rack', x: 0 }] };
  assert.deepEqual([...changedIds(a, { warehouse: { width: 1 }, objects: [{ id: 'x', kind: 'rack', x: 1 }, { id: 'z', kind: 'rack', x: 0 }] })].sort(), ['x', 'y', 'z']);
  assert.deepEqual([...changedIds(a, { warehouse: { width: 2 }, objects: a.objects })].sort(), ['x', 'y']);
});

test('세션 apply: 성공은 실행취소 가능, 실패는 기록만 남기고 실행취소 없음, 둘 다 저장, 실행취소는 이전 상태 전체로', async () => {
  const data = new Map();
  const storage = { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
  const s = createSession({ store: createProjectStore({ storage, validate: projectValidator }), nextId: createIdGenerator({ seed: 'ap' }), today: () => '2026-11-15', now });
  await s.init();
  await s.edit('경고 허용 끔', (p) => { p.editing.allowWarnings = false; });
  const racks = () => active(s.state.project).objects.filter((o) => o.kind === 'rack');
  const [a, b] = racks();
  const ok = await s.apply('이동', (p, ctx) => applyMove(p, [a.id], 0.1, 0, ctx));
  assert.equal(ok.ok, true);
  assert.equal(s.state.status, 'saved');
  const fail = await s.apply('겹침', (p, ctx) => applyMove(p, [a.id], b.x - a.x, b.y - a.y, ctx));
  assert.equal(fail.ok, false);
  assert.equal(s.state.project.commandHistory.at(-1).success, false);
  await s.undo(); // 실패는 실행취소 기록이 없으므로 성공한 이동이 되돌아간다
  assert.equal(racks()[0].x, a.x);
  // 기준본 실행취소는 이동 전 전체 상태로 돌아가므로 그 뒤의 실패 기록도 함께 사라진다
  assert.deepEqual(s.state.project.commandHistory, []);
});
