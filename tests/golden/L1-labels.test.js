// L1: 랙·ZONE 라벨(F-019)을 기준본 v2.4.1 결과(fixtures/legacy/label-cases.json, tools/label-diff.mjs)와 대조한다.
// 대조 대상: 도면 SVG의 g.v-labels 전체(순서·속성·글자·외부 라벨·표식), Q.parts, V.fullLabel.
// 기준본 값은 DOM outerHTML이므로 빈 요소 표기(<x/> ↔ <x></x>)만 맞춰 비교한다. 숫자·속성 순서는 그대로 비교한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { detailFixture } from './plan-cases.js';
import { labelCases } from './label-cases.js';
import { validateProject } from '../../src/core/project.js';
import { buildScene } from '../../src/cad/scene.js';
import { viewBox } from '../../src/cad/camera.js';
import { rackLabelParts, rackFullLabel, setFallbackMeasure } from '../../src/cad/labels.js';
import { tableMeasure } from './label-measure.js';

setFallbackMeasure(tableMeasure); // 기준본 canvas 폭 대신 같은 글꼴의 Chrome 측정 표(tools/label-metrics.mjs)

const expected = JSON.parse(fs.readFileSync(new URL('../../fixtures/legacy/label-cases.json', import.meta.url), 'utf8')).cases;
const norm = (s) => s.replace(/<([a-zA-Z]+)((?:\s[^<>]*?)?)\s*\/>/g, '<$1$2></$1>');

function load(input) {
  const p = validateProject(JSON.parse(fs.readFileSync(new URL('../../fixtures/legacy/v2.4.1-primary.project.json', import.meta.url), 'utf8')));
  p.settings.scenario = 'after';
  const rk = p.scenarios.after.objects.filter((o) => o.kind === 'rack');
  assert.equal(rk[3].id, input.excelRack);
  rk[3].excel = detailFixture(rk[3].id, rk[4].id).excel;
  p.inventoryHistory = input.inventory;
  p.rackLabels = structuredClone(input.rackLabels);
  p.viewport = structuredClone(input.viewport);
  return validateProject(p);
}

test('L1 사례 목록이 기준본 자료와 같다', () => {
  assert.deepEqual(expected.map((c) => c.name), labelCases.map((c) => c.name));
});

for (const c of expected) {
  test(`L1 ${c.name}`, () => {
    const p = load(c.input);
    const layout = p.scenarios.after;
    const racks = layout.objects.filter((o) => o.kind === 'rack');
    assert.deepEqual(racks.map((o) => ({ id: o.id, ...rackLabelParts(o, p, 'after') })), c.parts, 'Q.parts');
    assert.deepEqual(racks.map((o) => rackFullLabel(o, p, 'after')), c.fullLabels, 'V.fullLabel');
    const v = viewBox(p.viewport, layout.warehouse, c.input.size);
    const { svg } = buildScene(layout, p, { scope: 'after', selected: new Set(c.input.selected), pixelsPerMeter: c.input.size.w / v.w, size: c.input.size });
    const labels = svg.match(/<g class="v-labels"[\s\S]*?<\/g>/g) || [];
    assert.deepEqual(labels.map(norm), c.labels.map(norm));
  });
}
