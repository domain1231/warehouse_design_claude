// S1: G2가 다루지 않는 공간검사 유형(벽·외벽 이격, 설계 간격, 출입문, 다각형 통로, 목표 폭, 적재·천장, 대기 등)을
// 기준본 v2.4.1 결과(fixtures/legacy/spatial-cases.json, tools/spatial-diff.mjs로 생성)와 대조한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeLikeHarness, diff, formatDiff } from './compare.js';
import { spatialCases } from './spatial-cases.js';
import { createProject, createObject, validateProject } from '../../src/core/project.js';
import { createIdGenerator } from '../../src/core/ids.js';
import { warnings, scanLayout } from '../../src/warehouse/constraints.js';

const expected = JSON.parse(fs.readFileSync(new URL('../../fixtures/legacy/spatial-cases.json', import.meta.url), 'utf8')).results;

function build(c) {
  const nextId = createIdGenerator({ seed: 's1' });
  const p = validateProject(createProject({ sample: false, nextId, today: () => '2026-11-11' }));
  p.settings.scenario = 'after';
  p.settings.minGap = c.minGap;
  p.settings.policy = 'warn';
  p.locationLayout.wallGap = c.wallGap;
  const l = p.scenarios.after;
  l.warehouse = { ...c.warehouse };
  l.objects = c.objects.map(([kind, x, y, w, d, extra]) => createObject(kind, x, y, w, d, structuredClone(extra), { nextId }));
  if (c.rules) l.autoPlacementRules = { ...c.rules };
  if (c.layoutWallGap !== undefined) l.wallGap = c.layoutWallGap;
  p.scenarios.before = structuredClone(l);
  return validateProject(p);
}

test('S1 대조 자료가 사례 목록과 같다', () => {
  assert.deepEqual(expected.map((r) => r.name), spatialCases.map((c) => c.name));
});

for (const c of spatialCases) {
  test(`S1 ${c.name}`, () => {
    const p = build(c);
    const layout = p.scenarios.after;
    const actual = normalizeLikeHarness({ name: c.name, warnings: warnings(layout, p), scan: scanLayout(layout, p) });
    const rows = diff(expected.find((r) => r.name === c.name), actual, 25);
    assert.equal(rows.length, 0, formatDiff(rows));
  });
}
