// F-040: 열 우선 탐색은 탐색 예산(probe 수)으로만 멈추고 사유를 남기며, 같은 예산이면 결과가 같다(D-005, D-023).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { proposalCases } from '../golden/excel-cases.js';
import { readWorkbook, sheetMatrix } from '../../src/excel/xlsx.js';
import { detectHeaderRow, autoMap, analyzeSheet } from '../../src/excel/analyze.js';
import { columnBase, columnSearch, columnStrategies, startRun, stopText, COLUMN_LIMITS } from '../../src/autolayout/column.js';
import { validateProject } from '../../src/core/project.js';
import { createIdGenerator } from '../../src/core/ids.js';

const kase = proposalCases.find((c) => c.name === '열 우선: 좁은 창고(일부 외부 대기)');
const file = new URL('../../fixtures/excel/' + kase.file, import.meta.url);
const projectText = fs.readFileSync(new URL('../../fixtures/legacy/v2.4.1-primary.project.json', import.meta.url), 'utf8');

async function setup() {
  const wb = await readWorkbook(kase.file, fs.readFileSync(file));
  const sheet = wb.sheets[wb.sheetNames[0]];
  const matrix = sheetMatrix(sheet), headerRow1 = detectHeaderRow(matrix) + 1;
  const analysis = analyzeSheet({ matrix, headerRow1, mapping: autoMap(matrix, headerRow1), cell: (a) => sheet.cells.get(a), resolutions: kase.resolutions });
  const project = validateProject(JSON.parse(projectText));
  const c = kase.steps[0].c;
  const base = columnBase(project, analysis, c, { nextId: createIdGenerator({ seed: 'probe' }), filename: kase.file, sheet: '자재 목록', missingDelete: new Set() });
  return { project, c, base };
}
// 남은 예산(probe 수)만 지정해 검색: 이미 쓴 probe 수를 한도에서 뺀다
async function search(remaining) {
  const { project, c, base } = await setup();
  const run = { ...startRun(), probes: remaining === null ? 0 : COLUMN_LIMITS.maxProbes - remaining };
  const layout = columnSearch(structuredClone(base.layout), c, columnStrategies(false)[0][1], { project, run });
  return { run, placed: layout.objects.map((o) => [o.id, o.x, o.y, o.rotation, o.placementMeta?.waiting ?? null]) };
}

test('작은 예산에서 한도에 닿으면 probe-bound와 안내 문구를 남기고 미배치 랙이 생긴다', async () => {
  const r = await search(3);
  assert.equal(r.run.stopReason, 'probe-bound');
  assert.equal(r.run.probes, COLUMN_LIMITS.maxProbes);
  assert.equal(stopText(r.run.stopReason), '전체 후보 공통 탐색 횟수 상한');
  assert.ok(r.placed.some((p) => p[4] === true), '예산 부족으로 외부 대기 랙이 있다');
});

test('같은 예산이면 두 번 실행해도 결과가 완전히 같다', async () => {
  const a = await search(3), b = await search(3);
  assert.deepEqual(a.placed, b.placed);
  assert.deepEqual([a.run.probes, a.run.starts, a.run.stopReason], [b.run.probes, b.run.starts, b.run.stopReason]);
});

test('예산이 충분하면 한도 사유가 없고 더 많이 배치한다', async () => {
  const small = await search(3), full = await search(null);
  assert.equal(full.run.stopReason, '');
  assert.ok(full.run.probes < COLUMN_LIMITS.maxProbes);
  const waiting = (r) => r.placed.filter((p) => p[4] === true).length;
  assert.ok(waiting(full) <= waiting(small));
});
