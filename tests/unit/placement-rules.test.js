// D-057: 자동 배치 기준 기록이 없는 배치(예전 Excel 적용·JSON 불러오기)의 기준 편집. 가상 자료만 사용.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveRules, setPlacementRule, setWallGap, wallGapOf } from '../../src/warehouse/placement-rules.js';

const legacy = () => ({
  importHistory: [{ date: '2026-11-01', keys: [] }],
  locationLayout: { columnGap: 0.6, rackGap: 0.2, wallGap: 0.1, aisleTarget: 1.2 },
  scenarioMeta: { before: {}, after: {} },
  scenarios: { before: { objects: [] }, after: { objects: [] } },
});

test('기록이 없으면 Excel 입력값을 미적용 값으로 보여준다', () => {
  const p = legacy();
  assert.deepEqual(effectiveRules(p, p.scenarios.after, 'after'), { applied: false, values: { columnGap: 0.6, rackGap: 0.2, wallGap: 0.1, aisleTarget: 1.2 } });
});

test('시나리오별 Excel 입력값이 프로젝트 값보다 우선, 배치의 wallGap이 있으면 그 값', () => {
  const p = legacy();
  p.scenarioMeta.after.locationLayout = { columnGap: 0.7, rackGap: 0.3, wallGap: 0.15, aisleTarget: 1.5 };
  p.scenarios.after.wallGap = 0.25;
  assert.deepEqual(effectiveRules(p, p.scenarios.after, 'after').values, { columnGap: 0.7, rackGap: 0.3, wallGap: 0.25, aisleTarget: 1.5 });
  assert.equal(effectiveRules(p, p.scenarios.before, 'before').values.rackGap, 0.2);
});

test('Excel 불러오기 이력이 없으면 null(입력란 비활성, 기본 입력값만 있는 샘플·직접 작성 배치)', () => {
  const p = legacy();
  p.importHistory = [];
  assert.equal(effectiveRules(p, p.scenarios.after, 'after'), null);
  assert.throws(() => setPlacementRule(p, 'after', 'rackGap', 0.3), /Excel 불러오기 후/);
});

test('처음 고치면 현재 배치에만 기록이 생기고 나머지는 Excel 입력값으로 채운다(BEFORE 불변)', () => {
  const p = legacy();
  setPlacementRule(p, 'after', 'wallGap', 0.05);
  assert.deepEqual(p.scenarios.after.autoPlacementRules, { mode: 'order', columnGap: 0.6, rackGap: 0.2, wallGap: 0.05, aisleTarget: 1.2 });
  assert.equal(p.scenarios.after.wallGap, 0.05);
  assert.equal(p.scenarios.before.autoPlacementRules, undefined);
  assert.equal(effectiveRules(p, p.scenarios.after, 'after').applied, true);
  setPlacementRule(p, 'after', 'rackGap', 0.3);
  assert.equal(p.scenarios.after.autoPlacementRules.rackGap, 0.3);
  assert.equal(p.scenarios.after.autoPlacementRules.wallGap, 0.05);
});

test('기록이 이미 있으면 그대로 고친다', () => {
  const p = legacy();
  p.scenarios.after.autoPlacementRules = { mode: 'aisle', columnGap: 1, rackGap: 0.4, wallGap: 0.2, aisleTarget: 2 };
  setPlacementRule(p, 'after', 'columnGap', 0.8);
  assert.deepEqual(p.scenarios.after.autoPlacementRules, { mode: 'aisle', columnGap: 0.8, rackGap: 0.4, wallGap: 0.2, aisleTarget: 2 });
});

test('setWallGap: 기준·Excel 이력이 없으면 layout.wallGap만 기록(기준 기록은 만들지 않는다)', () => {
  const p = legacy();
  p.importHistory = [];
  setWallGap(p, 'after', 0.4);
  assert.equal(p.scenarios.after.wallGap, 0.4);
  assert.equal(p.scenarios.after.autoPlacementRules, undefined);
  assert.equal(p.scenarios.before.wallGap, undefined);
});

test('setWallGap: 기록이 있으면 기준·layout.wallGap 모두 갱신', () => {
  const p = legacy();
  p.scenarios.after.autoPlacementRules = { mode: 'aisle', columnGap: 1, rackGap: 0.4, wallGap: 0.2, aisleTarget: 2 };
  setWallGap(p, 'after', 0.3);
  assert.equal(p.scenarios.after.autoPlacementRules.wallGap, 0.3);
  assert.equal(p.scenarios.after.wallGap, 0.3);
  const q = legacy();
  setWallGap(q, 'after', 0.05);
  assert.equal(q.scenarios.after.autoPlacementRules.wallGap, 0.05);
});

test('wallGapOf: 배치 값 → 프로젝트 값 → 0', () => {
  const p = legacy();
  assert.equal(wallGapOf(p, p.scenarios.after), 0.1);
  p.scenarios.after.wallGap = 0.3;
  assert.equal(wallGapOf(p, p.scenarios.after), 0.3);
  assert.equal(wallGapOf({}, {}), 0);
});
