// Q1: 정렬 가이드 그룹·가까운 거리 표시(기준본 80 Q.guideSvg + Q.nearest·Q.closest)를 기준본 결과
// (fixtures/legacy/guide-cases.json, tools/guide-diff.mjs)와 대조한다. 화면 배율 u는 기록값을 그대로 쓴다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { guideCases } from './guide-cases.js';
import { validateProject } from '../../src/core/project.js';
import { buildScene } from '../../src/cad/scene.js';

const expected = JSON.parse(fs.readFileSync(new URL('../../fixtures/legacy/guide-cases.json', import.meta.url), 'utf8')).cases;
const projectText = fs.readFileSync(new URL('../../fixtures/legacy/v2.4.1-primary.project.json', import.meta.url), 'utf8');
const norm = (s) => s.replace(/<([a-zA-Z]+)((?:\s[^<>]*?)?)\s*\/>/g, '<$1$2></$1>');

test('Q1 사례 목록이 기준본 자료와 같다', () => {
  assert.deepEqual(expected.map((c) => c.name), guideCases.map((c) => c.name));
});
for (const c of guideCases) {
  test(`Q1 ${c.name}`, () => {
    const exp = expected.find((x) => x.name === c.name);
    const p = validateProject(JSON.parse(projectText));
    p.settings.scenario = 'after';
    if (c.guides === false) p.precision.guides = false;
    if (exp.layout) p.scenarios.after = exp.layout;
    validateProject(p);
    const { svg } = buildScene(p.scenarios.after, p, { scope: 'after', selected: new Set(exp.selected), pixelsPerMeter: exp.u, guides: [] });
    const m = svg.match(/<g class="q-guide"[\s\S]*?<\/g>/);
    assert.equal(m ? norm(m[0]) : null, exp.guide === null ? null : norm(exp.guide));
  });
}
