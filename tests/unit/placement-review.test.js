// Phase 11-4 배치 검토 재현 시험(가상 자료).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readExcelConfig, buildProposal } from '../../src/excel/proposal.js';
import { buildCandidates } from '../../src/autolayout/candidates.js';
import { createProject, createObject } from '../../src/core/project.js';
import { createIdGenerator } from '../../src/core/ids.js';
import { bounds } from '../../src/geometry/polygons.js';

const rack = (column, n) => ({ key: `1F-${column}-${n}`, floor: '1F', column, rackNumber: n, dimensions: [1000, 500, 2000], shelves: [], issues: [] });
const analysis = { racks: [rack('A', 1), rack('A', 2), rack('A', 3), rack('B', 1)] };
const raw = { building: 'SYN', floor: '1F', northRotation: '0', columnDirection: 'east', firstRackPosition: 'north', originX: '0', originY: '0', rotation: '90', columnGap: '0.8', rackGap: '0.2', wallGap: '0.1', aisleTarget: '0.8', order: '', emptyW: '1.2', emptyD: '0.5', emptyH: '2', mode: 'new', keep: 'reflow', date: '2026-11-16', source: '가상', recordLayout: true, target: 'after', missingPolicy: 'mark', specPolicy: 'keep', keepManual: false, preserveStructures: true, empty: false, allowWarnings: false, width: '6', depth: '6', autoMode: 'fixed', fixedAxis: 'column', fixedPairing: 'all', fixedSpacing: 'target' };
const gen = (s) => ({ nextId: createIdGenerator({ seed: s }), filename: 's', sheet: 's', missingDelete: new Set() });

// 1차 배치로 기존 랙을 만든 뒤 기둥을 추가하고 update 로 다시 적용한다.
function seeded() {
  const ids = createIdGenerator({ seed: 't' });
  const p = createProject({ sample: false, nextId: ids });
  const l = p.scenarios.after;
  l.warehouse.width = 6; l.warehouse.height = 6; l.objects = [];
  const first = buildCandidates(p, analysis, readExcelConfig(raw), gen('u'));
  l.objects = first.candidates[0].layout.objects;
  for (const o of l.objects) if (o.kind === 'rack') o.placementMeta = { manualEdited: false, positionLocked: false, waiting: false, editedAt: null };
  return { p, l, ids };
}
const ymin = (layout, k) => bounds(layout.objects.find((o) => o.excel?.key === k)).minY;

test('1. 위치 유지(keep) 랙은 장애물 회피로 밀리지 않는다', () => {
  const { p, l, ids } = seeded();
  const before = Object.fromEntries(['1F-A-1', '1F-A-2', '1F-A-3'].map((k) => [k, ymin(l, k)]));
  l.objects.push(createObject('column', 0.15, before['1F-A-1'] + 0.1, 0.4, 0.4, {}, { nextId: ids })); // A1 자리를 막는 기둥
  const r = buildCandidates(p, analysis, readExcelConfig({ ...raw, mode: 'update', keep: 'keep' }), gen('v'));
  const lay = r.candidates[0].layout;
  assert.equal(ymin(lay, '1F-A-2'), before['1F-A-2']);
  assert.equal(ymin(lay, '1F-A-3'), before['1F-A-3']);
});

test('1b. keepManual 로 보호되는 랙은 열 이동 누적에서 제외된다', () => {
  const { p, l, ids } = seeded();
  const y2 = ymin(l, '1F-A-2');
  l.objects.find((o) => o.excel?.key === '1F-A-2').placementMeta.manualEdited = true;
  l.objects.push(createObject('column', 0.15, ymin(l, '1F-A-1') + 0.1, 0.4, 0.4, {}, { nextId: ids }));
  const r = buildCandidates(p, analysis, readExcelConfig({ ...raw, mode: 'update', keep: 'reflow', keepManual: true }), gen('v'));
  assert.equal(ymin(r.candidates[0].layout, '1F-A-2'), y2);
});

test('3. placementMeta 없는 기존 랙도 buildProposal 이 TypeError 없이 처리한다', () => {
  const { p, l } = seeded();
  for (const o of l.objects) if (o.kind === 'rack') delete o.placementMeta;
  const c = readExcelConfig({ ...raw, mode: 'update', keep: 'keep', keepManual: true });
  assert.doesNotThrow(() => buildProposal(p, analysis, c, gen('w')));
});
