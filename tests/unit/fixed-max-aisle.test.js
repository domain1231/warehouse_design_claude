// D-050: 통로 최대 폭 상한(가상 자료).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseAisle, recommend } from '../../src/autolayout/fixed-columns.js';
import { readExcelConfig } from '../../src/excel/proposal.js';
import { buildCandidates } from '../../src/autolayout/candidates.js';
import { createProject } from '../../src/core/project.js';
import { createIdGenerator } from '../../src/core/ids.js';
import { bounds } from '../../src/geometry/polygons.js';

const ev = (aMax, meets = true) => ({ aMax, fits: true, meetsTarget: meets });

test('chooseAisle: 고르게 나눌 때만 상한 적용', () => {
  assert.equal(chooseAisle(ev(8.8), 0.8, 'max', 1.5), 1.5);
  assert.equal(chooseAisle(ev(1.2), 0.8, 'max', 1.5), 1.2);
  assert.equal(chooseAisle(ev(8.8), 0.8, 'target', 1.5), 0.8);
  assert.equal(chooseAisle(ev(8.8), 0.8, 'max'), 8.8); // 상한 없음 = 이전 동작
});

test('recommend: 상한을 넘는 통로는 같은 값으로 보고 형태 순서로 고른다', () => {
  const shapes = [{ name: 'a', ev: ev(3.0) }, { name: 'b', ev: ev(5.0) }];
  assert.equal(recommend(shapes).name, 'b');
  assert.equal(recommend(shapes, 1.5).name, 'a');
});

const rack = (column, n) => ({ key: `1F-${column}-${n}`, floor: '1F', column, rackNumber: n, dimensions: [1000, 500, 2000], shelves: [], issues: [] });
const raw = (o) => ({ building: 'S', floor: '1F', northRotation: '0', columnDirection: 'east', firstRackPosition: 'north', originX: '0', originY: '0', rotation: '90', columnGap: '0.8', rackGap: '0.2', wallGap: '0.1', aisleTarget: '0.8', order: '', emptyW: '1.2', emptyD: '0.5', emptyH: '2', mode: 'new', keep: 'reflow', date: '2026-11-20', source: '가상', recordLayout: true, target: 'after', missingPolicy: 'mark', specPolicy: 'keep', keepManual: true, preserveStructures: true, empty: false, allowWarnings: false, width: '10', depth: '6', autoMode: 'fixed', fixedAxis: 'column', fixedPairing: 'all', fixedSpacing: 'max', ...o });

test('넓은 창고: 통로는 상한까지만, 남는 공간은 끝 벽 쪽', () => {
  const p = createProject({ sample: false, nextId: createIdGenerator({ seed: 'm' }) });
  p.scenarios.after.warehouse.width = 10; p.scenarios.after.warehouse.height = 6; p.scenarios.after.objects = [];
  const r = buildCandidates(p, { racks: [rack('A', 1), rack('B', 1)] }, readExcelConfig(raw({ fixedMaxAisle: '1.5' })), { nextId: createIdGenerator({ seed: 'n' }), filename: 's', sheet: 's', missingDelete: new Set() });
  const x = (k) => bounds(r.candidates[0].layout.objects.find((o) => o.excel?.key === k));
  assert.equal(Number((x('1F-B-1').minX - x('1F-A-1').maxX).toFixed(3)), 1.5);
  assert.equal(r.fixed.maxAisle, 1.5);
  assert.equal(r.candidates[0].layout.autoPlacementRules.fixedColumns.maxAisle, 1.5);
});

test('입력 검사: 범위와 통로 목표 이상', () => {
  assert.throws(() => readExcelConfig(raw({ fixedMaxAisle: '0.1' })), /0.3~50m/);
  assert.throws(() => readExcelConfig(raw({ fixedMaxAisle: '0.7' })), /통로 목표 폭 이상/);
  assert.equal(readExcelConfig(raw({ fixedMaxAisle: '' })).autoPlacement.fixedColumns.maxAisle, undefined);
});
