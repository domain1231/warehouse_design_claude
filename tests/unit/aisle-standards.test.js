// C5: 통로 종류별 기준 폭과 설정 경고. 저장된 값은 바꾸지 않는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createObject } from '../../src/core/project.js';
import { createIdGenerator } from '../../src/core/ids.js';
import { aisleStandard, aisleSettingIssues } from '../../src/warehouse/aisles.js';
import { spaceMetrics } from '../../src/metrics/space.js';

const nextId = createIdGenerator({ seed: 'c5' });
const aisle = (aisleType, minWidth, extra = {}, w = 1, d = 6) => createObject('aisle', 1, 1, w, d, { aisleType, minWidth, targetWidth: minWidth, ...extra }, { nextId });
const layout = (...objects) => ({ warehouse: { width: 20, height: 10, ceiling: 0 }, objects });

const R = (t, minWidth, enabled = true) => ({ [t]: { minWidth, targetWidth: minWidth, enabled } });
const MAIN = '메인 이동 통로';
const def = { [MAIN]: { minWidth: 1, targetWidth: 1.2, enabled: true } };

test('aisleStandard: max(통로 최소, 사용자 종류 기준 최소), 사용 안 함이면 통로 최소', () => {
  const a = aisleStandard({ aisleType: MAIN, minWidth: 0.5 }, def);
  assert.deepEqual([a.standard, a.source], [1, 'rule']);
  assert.equal(aisleStandard({ aisleType: MAIN, minWidth: 0.5 }, R(MAIN, 1.5)).standard, 1.5);
  assert.equal(aisleStandard({ aisleType: MAIN, minWidth: 0.5 }, R(MAIN, 1.5, false)).standard, 0.5);
  const o = aisleStandard({ aisleType: '작업자 이동 통로', minWidth: 0.8 }, R('작업자 이동 통로', 1));
  assert.deepEqual([o.standard, o.recommended], [1, null]);
});

test('aisleSettingIssues: 주통로 기준 1.0m 미만만, 사용 안 함·다른 종류 제외', () => {
  const l = layout(aisle(MAIN, 0.5), aisle(MAIN, 1.0), aisle(MAIN, 0.5, { warningsEnabled: false }), aisle('작업자 이동 통로', 0.5));
  const r = aisleSettingIssues(l, R(MAIN, 0.5));
  assert.equal(r.length, 1);
  assert.equal(r[0].id, l.objects[0].id);
  assert.match(r[0].text, /하한 1\.0m/);
  assert.equal(r[0].spatial, false);
  assert.equal(aisleSettingIssues(layout(aisle(MAIN, 0.5)), R(MAIN, 1.2)).length, 0);
  assert.equal(aisleSettingIssues(layout(aisle(MAIN, 0.5, { warningsEnabled: false })), R(MAIN, 0.5)).length, 0);
});

test('spaceMetrics: 종류 기준이 통로 폭보다 크면 aisleBelowStandard, 낮추면 설정 경고만', () => {
  const m = spaceMetrics(layout(aisle(MAIN, 1.0)), { aisleRules: R(MAIN, 1.2) });
  assert.equal(m.aisleBelowStandard, 1);
  assert.equal(m.minAisle.standard, 1.2);
  assert.equal(m.minAisle.standardLabel, '주통로');
  const n = spaceMetrics(layout(aisle(MAIN, 0.8)), { aisleRules: R(MAIN, 0.8) });
  assert.equal(n.aisleBelowStandard, 0);
  assert.equal(n.aisleSettingIssues, 1);
});
