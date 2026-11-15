// Excel 적용 트랜잭션: 실패 시 전체 취소(입력 프로젝트 불변), 백업 한도·재사용, BEFORE/AFTER 독립성.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject, validateProject } from '../../src/core/project.js';
import { createIdGenerator } from '../../src/core/ids.js';
import { runTransaction, backupTarget } from '../../src/excel/apply.js';

const setup = () => {
  const nextId = createIdGenerator({ seed: 'apply' });
  return { nextId, now: () => '2026-11-15T00:00:00.000Z', p: validateProject(createProject({ sample: true, nextId, today: () => '2026-11-15' })) };
};

test('다른 편집안을 바꾸면 전체 취소하고 입력 프로젝트를 그대로 돌려준다', () => {
  const { p, nextId, now } = setup();
  const text = JSON.stringify(p);
  const r = runTransaction(p, 'after', '시험', (d) => { d.scenarios.before.warehouse.width += 1; }, { nextId, now });
  assert.equal(r.ok, false);
  assert.match(r.reason, /다른 편집안 변경/);
  assert.equal(r.project, p);
  assert.equal(JSON.stringify(p), text);
});

test('검증에 실패해도 전체 취소', () => {
  const { p, nextId, now } = setup();
  const r = runTransaction(p, 'after', '시험', (d) => { d.scenarios.after.objects.push({ id: 'bad' }); }, { nextId, now });
  assert.equal(r.ok, false);
  assert.equal(r.project, p);
});

test('BEFORE/AFTER 참조 공유를 거부한다', () => {
  const { p, nextId, now } = setup();
  const r = runTransaction(p, 'after', '시험', (d) => { d.scenarios.after.warehouse = d.scenarios.before.warehouse; }, { nextId, now });
  assert.equal(r.ok, false);
});

test('성공: 대상 백업·수정 이력·선택 해제, 같은 내용·사유의 연속 백업은 재사용, 최대 6개', () => {
  const { p, nextId, now } = setup();
  const r = runTransaction(p, 'after', '시험', (d) => { d.scenarios.after.warehouse.width += 1; }, { nextId, now });
  assert.equal(r.ok, true);
  assert.equal(r.project.layoutBackups.length, 1);
  assert.equal(r.project.layoutBackups[0].layout.warehouse.width, p.scenarios.after.warehouse.width, '백업은 적용 전 상태');
  assert.equal(r.project.layoutRevisions.at(-1).backupId, r.backupId);
  assert.deepEqual(r.project.editing.selectedRackIds, []);
  const q = structuredClone(r.project);
  const id1 = backupTarget(q, 'after', '반복', { nextId, now });
  assert.equal(backupTarget(q, 'after', '반복', { nextId, now }), id1);
  for (let i = 0; i < 8; i++) {
    q.scenarios.after.warehouse.width += 1;
    backupTarget(q, 'after', '반복', { nextId, now });
  }
  assert.equal(q.layoutBackups.length, 6);
});
