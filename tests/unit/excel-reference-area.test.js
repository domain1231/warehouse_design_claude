// Excel 적용 시 sourceInfo.referenceArea 보관(D-061)과 referenceAreaOf 조회를 검사한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readWorkbook, sheetMatrix } from '../../src/excel/xlsx.js';
import { detectHeaderRow, autoMap, analyzeSheet } from '../../src/excel/analyze.js';
import { applyExcelProposal } from '../../src/excel/apply.js';
import { baseProposal } from '../../src/autolayout/candidates.js';
import { warnings as spatialWarnings } from '../../src/warehouse/constraints.js';
import { validateProject } from '../../src/core/project.js';
import { createIdGenerator } from '../../src/core/ids.js';
import { referenceAreaOf } from '../../src/metrics/space.js';
import { proposalCases } from '../golden/excel-cases.js';

const FILE = 'synthetic-basic.xlsx';
const projectText = fs.readFileSync(new URL('../../fixtures/legacy/v2.4.1-primary.project.json', import.meta.url), 'utf8');

async function applyWith(referenceArea) {
  const nextId = createIdGenerator({ seed: 'ref-area' });
  const project = validateProject(JSON.parse(projectText));
  const wb = await readWorkbook(FILE, fs.readFileSync(new URL('../../fixtures/excel/' + FILE, import.meta.url)));
  const sheet = wb.sheets[wb.sheetNames[0]];
  const matrix = sheetMatrix(sheet);
  const headerRow1 = detectHeaderRow(matrix) + 1;
  const analysis = analyzeSheet({ matrix, headerRow1, mapping: autoMap(matrix, headerRow1), cell: (a) => sheet.cells.get(a), resolutions: { '7F-A-2': [800, 1850, 2000] } });
  if (referenceArea === undefined) delete analysis.referenceArea; else analysis.referenceArea = referenceArea;
  const proposal = baseProposal(project, analysis, proposalCases[0].steps[0].c, { nextId, filename: FILE, sheet: '자재 목록', missingDelete: new Set() });
  proposal.warnings = spatialWarnings(proposal.layout, project);
  const r = applyExcelProposal(project, proposal, { filename: FILE, sheet: '자재 목록', analysis, acknowledged: true }, { nextId, now: () => '2026-11-15T00:00:00.000Z' });
  return { r, target: proposal.config.target };
}

test('referenceArea 130.5는 sourceInfo에 저장되고 검증을 통과하며 referenceAreaOf가 돌려준다', async () => {
  const { r, target } = await applyWith(130.5);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.project.scenarioMeta[target].sourceInfo.referenceArea, 130.5);
  assert.doesNotThrow(() => validateProject(structuredClone(r.project)));
  assert.equal(referenceAreaOf(r.project, target), 130.5);
});

for (const [label, v] of [['null', null], ['없음', undefined]]) {
  test(`referenceArea ${label}이면 sourceInfo.referenceArea가 없고 referenceAreaOf는 null`, async () => {
    const { r, target } = await applyWith(v);
    assert.equal(r.ok, true, r.reason);
    assert.equal(r.project.scenarioMeta[target].sourceInfo.referenceArea, undefined);
    assert.equal(referenceAreaOf(r.project, target), null);
  });
}
