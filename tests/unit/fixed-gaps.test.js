// D-046: 로케이션 열 고정의 누락 번호 빈자리.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readExcelConfig } from '../../src/excel/proposal.js';
import { buildCandidates } from '../../src/autolayout/candidates.js';
import { createProject } from '../../src/core/project.js';
import { createIdGenerator } from '../../src/core/ids.js';
import { bounds } from '../../src/geometry/polygons.js';

// 가상 자료: A열 1~3번, B열 2~3번(1번 누락). 랙 1.0×0.5m.
const rack = (column, n) => ({ key: `1F-${column}-${n}`, floor: '1F', column, rackNumber: n, dimensions: [1000, 500, 2000], shelves: [], issues: [] });
const analysis = { racks: [rack('A', 1), rack('A', 2), rack('A', 3), rack('B', 2), rack('B', 3)] };
const raw = (gaps) => ({ building: 'SYN', floor: '1F', northRotation: '0', columnDirection: 'east', firstRackPosition: 'north', originX: '0', originY: '0', rotation: '90', columnGap: '0.8', rackGap: '0.2', wallGap: '0.1', aisleTarget: '0.8', order: '', emptyW: '1.2', emptyD: '0.5', emptyH: '2', mode: 'new', keep: 'reflow', date: '2026-11-16', source: '가상', recordLayout: true, target: 'after', missingPolicy: 'mark', specPolicy: 'keep', keepManual: true, preserveStructures: true, empty: false, allowWarnings: false, width: '6', depth: '6', autoMode: 'fixed', fixedAxis: 'column', fixedPairing: 'all', fixedSpacing: 'target', fixedGaps: gaps });
function layout(gaps) {
  const c = readExcelConfig(raw(gaps));
  const p = createProject({ sample: false, nextId: createIdGenerator({ seed: 't' }) });
  p.scenarios.after.warehouse.width = 6; p.scenarios.after.warehouse.height = 6;
  const r = buildCandidates(p, analysis, c, { nextId: createIdGenerator({ seed: 'u' }), filename: 's', sheet: 's', missingDelete: new Set() });
  const y = (key) => bounds(r.candidates[0].layout.objects.find((o) => o.excel?.key === key)).minY;
  return { y, r };
}

test('당겨 붙임: B2가 북쪽 벽에 붙는다', () => {
  const { y, r } = layout('pack');
  assert.equal(Number(y('1F-B-2').toFixed(3)), 0.1);
  assert.deepEqual(r.fixed.missing, ['B1']);
});

test('빈자리 비워 둠: B2가 A2와 같은 줄에 온다', () => {
  const { y } = layout('keep');
  assert.equal(Number(y('1F-B-2').toFixed(3)), Number(y('1F-A-2').toFixed(3)));
  assert.equal(Number(y('1F-B-3').toFixed(3)), Number(y('1F-A-3').toFixed(3)));
});
