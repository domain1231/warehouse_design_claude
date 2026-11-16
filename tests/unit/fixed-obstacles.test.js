// D-047: 로케이션 열 고정의 장애물 회피(가상 자료).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readExcelConfig } from '../../src/excel/proposal.js';
import { buildCandidates } from '../../src/autolayout/candidates.js';
import { createProject, createObject } from '../../src/core/project.js';
import { createIdGenerator } from '../../src/core/ids.js';
import { bounds } from '../../src/geometry/polygons.js';

const rack = (column, n) => ({ key: `1F-${column}-${n}`, floor: '1F', column, rackNumber: n, dimensions: [1000, 500, 2000], shelves: [], issues: [] });
const analysis = { racks: [rack('A', 1), rack('A', 2), rack('A', 3), rack('B', 1), rack('B', 2)] };
const raw = { building: 'SYN', floor: '1F', northRotation: '0', columnDirection: 'east', firstRackPosition: 'north', originX: '0', originY: '0', rotation: '90', columnGap: '0.8', rackGap: '0.2', wallGap: '0.1', aisleTarget: '0.8', order: '', emptyW: '1.2', emptyD: '0.5', emptyH: '2', mode: 'new', keep: 'reflow', date: '2026-11-16', source: '가상', recordLayout: true, target: 'after', missingPolicy: 'mark', specPolicy: 'keep', keepManual: true, preserveStructures: true, empty: false, allowWarnings: false, width: '6', depth: '6', autoMode: 'fixed', fixedAxis: 'column', fixedPairing: 'all', fixedSpacing: 'target' };

function run(withPillar) {
  const ids = createIdGenerator({ seed: 't' });
  const p = createProject({ sample: false, nextId: ids });
  const l = p.scenarios.after;
  l.warehouse.width = 6; l.warehouse.height = 6; l.objects = [];
  // A열(x 0.1~0.6)의 두 번째 랙 자리(y 약 1.3~2.3)에 기둥 0.4m
  if (withPillar) l.objects.push(createObject('column', 0.15, 1.5, 0.4, 0.4, {}, { nextId: ids }));
  const r = buildCandidates(p, analysis, readExcelConfig(raw), { nextId: createIdGenerator({ seed: 'u' }), filename: 's', sheet: 's', missingDelete: new Set() });
  return r;
}

test('기둥과 겹치는 랙은 열 방향으로 밀리고 순서·충돌이 지켜진다', () => {
  const r = run(true), cand = r.candidates[0];
  const y = (k) => bounds(cand.layout.objects.find((o) => o.excel?.key === k)).minY;
  assert.ok(y('1F-A-1') < y('1F-A-2') && y('1F-A-2') < y('1F-A-3'));
  assert.ok(y('1F-A-2') >= 1.9 + 0.1 - 1e-6, `A2 ${y('1F-A-2')}`); // 기둥 끝 1.9 + 이격 0.1
  assert.equal(cand.result.counts.structureCollision, 0);
  assert.equal(cand.result.counts.validInside, 5);
  assert.deepEqual(r.fixed.obstacles.columns, ['A']);
  assert.equal(Number(y('1F-B-1').toFixed(3)), 0.1); // B열은 그대로
});

test('구조물이 없으면 위치 변화 없음', () => {
  const r = run(false);
  assert.equal(r.fixed.obstacles.moved, 0);
});

test('D-048 자동 추천은 구조물이 있으면 실제 배치 결과로 형태를 고른다', () => {
  const ids = createIdGenerator({ seed: 't2' });
  const p = createProject({ sample: false, nextId: ids });
  const l = p.scenarios.after;
  l.warehouse.width = 8; l.warehouse.height = 4; l.objects = [];
  // 가로 띠 모양 보관 불가 구역(y 1.5~2.0): 세로 열은 이 띠를 넘지 못한다
  l.objects.push(createObject('blocked', 0, 1.5, 8, 0.5, {}, { nextId: ids }));
  const a2 = { racks: [rack('A', 1), rack('A', 2), rack('A', 3), rack('B', 1), rack('B', 2), rack('B', 3)] };
  const r = buildCandidates(p, a2, readExcelConfig({ ...raw, width: '8', depth: '4', fixedAxis: 'auto', fixedSpacing: 'max' }), { nextId: createIdGenerator({ seed: 'u2' }), filename: 's', sheet: 's', missingDelete: new Set() });
  assert.ok(r.fixed.trials.length > 1);
  assert.equal(r.fixed.chosen.axis, 'row');
  assert.equal(r.candidates[0].result.counts.validInside, 6);
  assert.equal(r.candidates[0].result.counts.structureCollision, 0);
});
