// D-053: 샘플 표시 자동 해제, 창고 밖 유지 구조물 수.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createObject } from '../../src/core/project.js';
import { createIdGenerator } from '../../src/core/ids.js';
import { applyCommand, deleteObjects } from '../../src/warehouse/commands.js';
import { applyRoom } from '../../src/warehouse/room.js';
import { readExcelConfig, buildProposal, structuresOutside } from '../../src/excel/proposal.js';

const now = () => '2026-11-20T00:00:00.000Z';

test('창고를 다시 만들면 샘플 해제', () => {
  const p = createProject({ nextId: createIdGenerator({ seed: 's' }) });
  assert.equal(p.metadata.sample, true);
  p.editing.allowWarnings = true; // 샘플에는 이미 통로 폭 경고가 있어 차단 정책이면 어떤 편집도 취소된다
  const r = applyRoom(p, { width: 30, height: 20, ceiling: '' }, { nextId: createIdGenerator({ seed: 't' }), now });
  assert.equal(r.ok, true);
  assert.equal(r.project.metadata.sample, false);
});

test('편집 배치를 모두 지우면 샘플 해제, 일부만 지우면 유지', () => {
  const p = createProject({ nextId: createIdGenerator({ seed: 's' }) });
  const ids = p.scenarios[p.settings.scenario].objects.map((o) => o.id);
  const part = applyCommand(p, deleteObjects(ids.slice(0, 1)), { nextId: createIdGenerator({ seed: 'a' }), now });
  assert.equal(part.project.metadata.sample, true);
  const all = applyCommand(p, deleteObjects(ids), { nextId: createIdGenerator({ seed: 'b' }), now });
  assert.equal(all.project.metadata.sample, false);
});

test('새로 만들기 + 구조물 유지: 새 창고 밖 구조물 수를 알린다', () => {
  const ids = createIdGenerator({ seed: 'x' });
  const p = createProject({ sample: false, nextId: ids });
  const l = p.scenarios.after;
  l.warehouse.width = 24; l.warehouse.height = 14;
  l.objects = [createObject('column', 2, 2, 0.4, 0.4, {}, { nextId: ids }), createObject('column', 20, 12, 0.4, 0.4, {}, { nextId: ids })];
  const raw = { building: 'S', floor: '1F', northRotation: '0', columnDirection: 'east', firstRackPosition: 'north', originX: '0.5', originY: '0.5', rotation: '0', columnGap: '1', rackGap: '0.2', wallGap: '0.1', aisleTarget: '1', order: '', emptyW: '1.2', emptyD: '0.5', emptyH: '2', mode: 'new', keep: 'reflow', date: '2026-11-20', source: '가상', recordLayout: true, target: 'after', missingPolicy: 'mark', specPolicy: 'keep', keepManual: true, preserveStructures: true, empty: false, allowWarnings: false, width: '10', depth: '6', autoMode: 'inside' };
  const pr = buildProposal(p, { racks: [] }, readExcelConfig(raw), { nextId: createIdGenerator({ seed: 'y' }), filename: 's', sheet: 's', missingDelete: new Set() });
  assert.equal(structuresOutside(pr.layout), 1); // (20,12) 기둥은 10×6 밖
});
