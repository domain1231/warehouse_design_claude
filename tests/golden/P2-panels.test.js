// P2: 통계·범례·랙 목록(검색·필터·정렬)·도면 흐림을 기준본 v2.4.1 결과(fixtures/legacy/plan-cases.json panels)와 대조한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { listCases } from './plan-cases.js';
import { normalize, diff, formatDiff } from './compare.js';
import { validateProject } from '../../src/core/project.js';
import { metrics } from '../../src/warehouse/metrics.js';
import { rackRows, legend } from '../../src/warehouse/racklist.js';
import { buildScene } from '../../src/cad/scene.js';

const expected = JSON.parse(fs.readFileSync(new URL('../../fixtures/legacy/plan-cases.json', import.meta.url), 'utf8')).panels;
const load = () => validateProject(JSON.parse(fs.readFileSync(new URL('../../fixtures/legacy/v2.4.1-primary.project.json', import.meta.url), 'utf8')));

for (const k of ['before', 'after']) {
  test(`P2 통계 ${k}: 면적·랙·점유율·구역 면적·잔여 면적·단위별 적재·경고`, () => {
    const p = load();
    const rows = diff(normalize(expected.stats[k]), normalize(metrics(p.scenarios[k], p)), 25);
    assert.equal(rows.length, 0, formatDiff(rows));
  });
}

test('P2 범례: 제목과 항목 문구(적재 기준 범위 포함)', () => {
  const p = load();
  const l = legend(p.settings);
  assert.deepEqual([l.title, ...l.items.map((i) => i.text)], expected.legendText);
});

test('P2 대조 자료가 목록 사례와 같다', () => {
  assert.deepEqual(expected.lists.map((r) => r.name), listCases.map((c) => c.name));
});

for (const c of listCases) {
  test(`P2 랙 목록 ${c.name}`, () => {
    const p = load();
    const view = { ...p.panels.view, ...c };
    const l = p.scenarios[p.settings.scenario];
    const rows = rackRows(l, view);
    const exp = expected.lists.find((r) => r.name === c.name);
    assert.deepEqual(rows.map((r) => r.id), exp.ids);
    assert.deepEqual(rows.map((r) => r.text), exp.texts);
    const svg = buildScene(l, p, { filter: view }).svg;
    const dim = [...svg.matchAll(/<g data-id="([^"]*)" opacity="0.2"/g)].map((m) => m[1]);
    assert.deepEqual(dim, exp.dim);
  });
}
