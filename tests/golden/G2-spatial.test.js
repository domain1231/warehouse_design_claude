// G2: 공간 경고(warnings)와 배치 검사(scanLayout)가 기준본 v2.4.1과 일치하는지 검사한다(11케이스, 0–500랙).
// 입력 배치는 기준본 하네스(tools/golden-master.cjs g2.build)와 같은 방식으로 다시 만든다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadScenario, normalizeLikeHarness, diff, formatDiff } from './compare.js';
import { createProject, createObject, validateProject } from '../../src/core/project.js';
import { createIdGenerator } from '../../src/core/ids.js';
import { warnings, scanLayout } from '../../src/warehouse/constraints.js';

const golden = loadScenario('G2');

function build({ count, structures = false, minGap = 0.1, rotation = 0, shift = [0, 0] }) {
  const nextId = createIdGenerator({ seed: 'g2' });
  const p = validateProject(createProject({ sample: false, nextId, today: () => '2026-11-11' }));
  p.metadata.name = 'SYNTHETIC GOLDEN';
  p.settings.scenario = 'after';
  p.settings.minGap = minGap;
  p.settings.policy = 'warn';
  p.editing.allowWarnings = true;
  const make = (kind, x, y, w, d, extra) => createObject(kind, x, y, w, d, extra, { nextId });
  p.scenarios.after.warehouse = { width: 40, height: Math.max(12, Math.ceil(count / 20) * 1.2 + 2), ceiling: 3 };
  p.scenarios.after.objects = Array.from({ length: count }, (_, i) => make('rack', 0.5 + (i % 20) * 1.8 + shift[0], 0.5 + Math.floor(i / 20) * 1.2 + shift[1], 1.2, 0.6, { id: `SYN-R${i}`, code: `SYN-${i}`, height: 2, rotation }));
  if (structures) {
    for (let i = 0; i < 6; i++) {
      p.scenarios.after.objects.push(make('wall', 5 + i * 5, 2, 0.15, 7, { id: `SYN-wall${i}`, code: `SYN-wall${i}` }), make('column', 2 + i * 5, 3, 0.5, 0.5, { id: `SYN-column${i}`, code: `SYN-column${i}` }));
    }
    for (let i = 0; i < 4; i++) p.scenarios.after.objects.push(make('aisle', 4 + i * 8, 1, 1.2, 8, { id: `SYN-aisle${i}`, code: `SYN-aisle${i}` }));
  }
  p.scenarios.before = structuredClone(p.scenarios.after);
  validateProject(p); // 기준본 M.ensure·W.ensure와 같은 보정(placementMeta 등)
  return p;
}

for (const c of golden.data.cases) {
  test(`G2 ${c.id}`, () => {
    const p = build(c.params);
    const layout = p.scenarios.after;
    const before = JSON.stringify(layout);
    const actual = normalizeLikeHarness({
      id: c.id,
      params: c.params,
      warnings: warnings(layout, p),
      scan: scanLayout(layout, p),
      inputUnchanged: JSON.stringify(layout) === before,
    });
    const rows = diff(c, actual, 25);
    assert.equal(rows.length, 0, formatDiff(rows));
  });
}
