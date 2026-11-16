import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject, validateProject } from '../../src/core/project.js';
import { createIdGenerator } from '../../src/core/ids.js';
import { scanLayout } from '../../src/warehouse/constraints.js';
import { violationRows, violationListHtml, violationStatus, VIOLATION_HEAD } from '../../src/warehouse/violations.js';

const mk = () => validateProject(createProject({ sample: true, nextId: createIdGenerator({ seed: 'viol' }), today: () => '2026-11-16' }));

test('위반 없는 랙은 행에 없고 헤더 4개가 기준본과 같다', () => {
  const p = mk(), l = p.scenarios[p.settings.scenario];
  const r = scanLayout(l, p);
  const { rows } = violationRows(r);
  assert.deepEqual(rows.map((x) => x.id), r.rows.filter((x) => x.issues.length).map((x) => x.id));
  const html = violationListHtml(r, p);
  assert.ok(html.startsWith('<table class="w-table w-violations">'));
  for (const h of VIOLATION_HEAD) assert.ok(html.includes(`<th>${h}</th>`));
  assert.equal((html.match(/data-w-rack=/g) || []).length, rows.length);
});

test('경계를 벗어난 랙은 경계 초과 행·미해결, 검토 표시면 검토 중', () => {
  const p = mk(), k = p.settings.scenario, l = p.scenarios[k];
  const rack = l.objects.find((o) => o.kind === 'rack');
  rack.x = l.warehouse.width + 5;
  const r = scanLayout(l, p);
  const row = violationRows(r).rows.find((x) => x.id === rack.id);
  assert.ok(row);
  assert.match(violationListHtml(r, p), new RegExp(`data-w-rack="${rack.id}"[^]*?경계 초과`));
  assert.equal(violationStatus(row, p), '미해결');
  p.autoPlacement.reviewNotes[k][rack.id] = 'review';
  assert.equal(violationStatus(row, p), '검토 중');
  assert.equal(violationStatus({ id: 'x', issues: [] }, p), '해결');
});

test('열 모드는 50행 페이징·이슈/대상 8개 제한', () => {
  const issue = { type: 'rackCollision', text: 't', targets: Array.from({ length: 12 }, (_, i) => ({ code: 'c', id: String(i) })) };
  const rows = Array.from({ length: 120 }, (_, i) => ({ id: 'r' + i, code: 'R' + i, excess: {}, issues: Array(10).fill(issue) }));
  const a = violationRows({ column: {}, rows }, 1);
  assert.equal(a.rows.length, 50);
  assert.equal(a.rows[0].id, 'r50');
  assert.equal(a.rows[0].issues.length, 8);
  assert.equal(a.rows[0].issues[0].targets.length, 8);
  assert.equal(violationRows({ column: {}, rows }, 99).page, 2);
});
