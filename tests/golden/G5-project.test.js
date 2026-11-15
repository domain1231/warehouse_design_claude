// G5: 프로젝트 모델(샘플·빈 프로젝트)이 기준본 v2.4.1의 validateProject(makeProject())와 일치하는지 검사한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadScenario, normalizeLikeHarness, diff, formatDiff } from './compare.js';
import { createProject, validateProject } from '../../src/core/project.js';
import { createIdGenerator } from '../../src/core/ids.js';

const golden = loadScenario('G5');
const idPattern = /t-g5-[0-9a-z]{6}/;

for (const kind of ['sample', 'empty']) {
  test(`G5 ${kind} 프로젝트가 기준본과 일치한다`, () => {
    const p = validateProject(createProject({ sample: kind === 'sample', nextId: createIdGenerator({ seed: 'g5' }), today: () => '2026-11-11' }));
    const actual = normalizeLikeHarness(JSON.parse(JSON.stringify(p)), { idPattern, extraDrop: golden.droppedKeys });
    const rows = diff(golden.data[kind], actual, 30);
    assert.equal(rows.length, 0, formatDiff(rows));
  });
}
