// X2: Excel 배치안(생성 → 기존 랙 매칭·규격·누락 정책 → 보호 랙·구조물·배치 규칙)을 기준본 v2.4.1 W.base 결과와 대조한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { proposalCases } from './excel-cases.js';
import { diff, formatDiff, normalizeLikeHarness } from './compare.js';
import { readWorkbook, sheetMatrix } from '../../src/excel/xlsx.js';
import { detectHeaderRow, autoMap, analyzeSheet } from '../../src/excel/analyze.js';
import { buildProposal } from '../../src/excel/proposal.js';
import { applyExcelProposal } from '../../src/excel/apply.js';
import { warnings as spatialWarnings, scanLayout } from '../../src/warehouse/constraints.js';
import { validateProject } from '../../src/core/project.js';
import { createIdGenerator } from '../../src/core/ids.js';

const expected = JSON.parse(fs.readFileSync(new URL('../../fixtures/legacy/excel-cases.json', import.meta.url), 'utf8')).proposals;
const ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|t-[A-Za-z0-9_-]+-[0-9a-z]{6}/;
const bytes = fs.readFileSync(new URL('../../fixtures/excel/synthetic-basic.xlsx', import.meta.url));
const projectText = fs.readFileSync(new URL('../../fixtures/legacy/v2.4.1-primary.project.json', import.meta.url), 'utf8');

async function analysisWith(resolutions) {
  const wb = await readWorkbook('synthetic-basic.xlsx', bytes);
  const sheet = wb.sheets[wb.sheetNames[0]];
  const matrix = sheetMatrix(sheet);
  const headerRow1 = detectHeaderRow(matrix) + 1;
  return analyzeSheet({ matrix, headerRow1, mapping: autoMap(matrix, headerRow1), cell: (a) => sheet.cells.get(a), resolutions });
}

test('X2 대조 자료가 사례 목록과 같다', () => {
  assert.deepEqual(expected.map((r) => r.name), proposalCases.map((c) => c.name));
});

for (const c of proposalCases) {
  test(`X2 ${c.name}`, async () => {
    const nextId = createIdGenerator({ seed: 'x2' });
    let p = validateProject(JSON.parse(projectText));
    let last = null, a = null;
    const out = [];
    for (const step of c.steps) {
      if (step === 'commit') {
        p.scenarios[last.config.target] = structuredClone(last.layout);
        p = validateProject(p);
        continue;
      }
      if (step === 'apply') {
        last.warnings = spatialWarnings(last.layout, p);
        const r = applyExcelProposal(p, last, { filename: 'synthetic-basic.xlsx', sheet: '자재 목록', analysis: JSON.parse(JSON.stringify(a)), acknowledged: true }, { nextId, now: () => '2026-11-15T00:00:00.000Z' });
        if (r.ok) p = validateProject(r.project);
        const { scenarios, scenarioMeta, locationLayout, layoutBackups, layoutRevisions, importHistory, excelSnapshots, layoutSnapshots, editing, settings, metadata, autoPlacement } = JSON.parse(JSON.stringify(p));
        out.push({ applied: r.ok, project: { scenarios, scenarioMeta, locationLayout, layoutBackups, layoutRevisions, importHistory, excelSnapshots, layoutSnapshots, selection: [editing.selectedRackIds, editing.selectionScenario], scenario: settings.scenario, sample: metadata.sample, autoSettings: autoPlacement.settings, autoHistory: autoPlacement.history.map((h) => ({ ...h, fingerprint: h.fingerprint === scanLayout(h.layout, p).fingerprint })) } });
        continue;
      }
      a = await analysisWith(step.resolutions ?? c.resolutions);
      if (step.dropRack) a.racks = a.racks.filter((x) => x.key !== step.dropRack);
      if (step.onlyRacks) a.racks = a.racks.filter((x) => step.onlyRacks.includes(x.key) || x.key === step.dropRack);
      if (step.editItem) a.racks[0].shelves[0].items[0].itemName = '변경된 품목명';
      const missingDelete = new Set(step.deleteMissing ? p.scenarios[step.c.target].objects.filter((o) => o.excel?.key === step.dropRack).map((o) => o.id) : []);
      try {
        last = buildProposal(p, a, step.c, { nextId, filename: 'synthetic-basic.xlsx', sheet: '자재 목록', missingDelete });
        out.push({ layout: last.layout, changes: last.changes, missing: last.missing.map((o) => o.id), generatedKeys: last.generatedKeys });
      } catch (e) {
        out.push({ error: e.message });
      }
    }
    const dropTime = (v) => JSON.parse(JSON.stringify(v, (k, x) => (k === 'importedAt' ? undefined : x)));
    const exp = normalizeLikeHarness(dropTime(expected.find((r) => r.name === c.name).steps), { idPattern: ID });
    const act = normalizeLikeHarness(dropTime(out), { idPattern: ID });
    const rows = diff(exp, act, 25);
    assert.equal(rows.length, 0, formatDiff(rows));
  });
}
