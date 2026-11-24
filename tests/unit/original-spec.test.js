// F-017: 원본 규격(originalSpec)과 설계 규격(designSpec)은 편집·크기 조절·복제를 거쳐도 섞이지 않고, 다르면 차이 표시·안내가 나온다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createObject, validateProject } from '../../src/core/project.js';
import { createIdGenerator } from '../../src/core/ids.js';
import { applyCommand, setDimension, applyResize, duplicateObjects, active } from '../../src/warehouse/commands.js';
import { specWarning } from '../../src/warehouse/rackinfo.js';

const now = () => '2026-11-24T00:00:00.000Z';
function base() {
  const nextId = createIdGenerator({ seed: 'spec' });
  const p = validateProject(createProject({ sample: false, nextId }));
  p.scenarios.after.warehouse = { width: 20, height: 10, ceiling: 3 };
  p.scenarios.after.objects = [createObject('rack', 2, 2, 1, 0.5, { id: 'A', code: 'R-001' }, { nextId })];
  p.editing.allowWarnings = true;
  p.settings.scenario = 'after';
  return { p: validateProject(p), nextId };
}
const rack = (p, id = 'A') => active(p).objects.find((o) => o.id === id);

test('등록 직후 원본=설계이고 차이 표시가 없다', () => {
  const { p } = base();
  const o = rack(p);
  assert.deepEqual({ w: o.originalSpec.width, d: o.originalSpec.depth }, { w: 1, d: 0.5 });
  assert.deepEqual(o.designSpec, { width: 1, depth: 0.5, height: o.height ?? null });
  assert.equal(o.specificationChanged, false);
});

test('설계 치수 편집·크기 조절은 원본 규격을 바꾸지 않고 차이 표시를 켠다', () => {
  const { p, nextId } = base();
  const origin = structuredClone(rack(p).originalSpec);
  let r = applyCommand(p, setDimension('A', 'width', 1.2), { nextId, now });
  assert.ok(r.ok, r.reason);
  assert.deepEqual(rack(r.project).originalSpec, origin);
  assert.equal(rack(r.project).designSpec.width, 1.2);
  assert.equal(rack(r.project).specificationChanged, true);
  r = applyCommand(r.project, applyResize('A', { width: 1.5, depth: 0.7 }), { nextId, now });
  assert.ok(r.ok, r.reason);
  assert.deepEqual(rack(r.project).originalSpec, origin);
  assert.deepEqual([rack(r.project).designSpec.width, rack(r.project).designSpec.depth], [1.5, 0.7]);
  assert.equal(r.project.specificationHistory.at(-1).type, 'design-only');
  // 설계를 원본 값으로 되돌리면 차이 표시도 꺼진다
  r = applyCommand(r.project, applyResize('A', { width: 1, depth: 0.5 }), { nextId, now });
  assert.equal(rack(r.project).specificationChanged, false);
});

test('복제본은 원본 규격을 복사하되 참조를 공유하지 않는다', () => {
  const { p, nextId } = base();
  let r = applyCommand(p, applyResize('A', { width: 1.3 }), { nextId, now });
  const { ids, mutate } = duplicateObjects([rack(r.project)], { nextId });
  r = applyCommand(r.project, mutate, { nextId, now });
  assert.ok(r.ok, r.reason);
  const copy = rack(r.project, ids[0]), src = rack(r.project);
  assert.deepEqual(copy.originalSpec, src.originalSpec);
  assert.notEqual(copy.originalSpec, src.originalSpec);
  assert.equal(copy.specificationChanged, true);
  copy.originalSpec.width = 9;
  assert.equal(src.originalSpec.width, 1);
});

test('차이 안내 문구: Excel 원본은 실제 설비 확인 안내, 등록 당시 설계값은 실측 미확인 안내', () => {
  const { p } = base();
  const o = structuredClone(rack(p));
  assert.match(specWarning(o), /등록 당시 설계 규격과 다릅니다.*미확인/);
  o.originalSpec.origin = 'excel';
  assert.match(specWarning(o), /Excel 원본 규격과 다릅니다.*실제 설비 변경 여부/);
});
