// G4: 자동 배치(후보 생성·열 우선)를 기준본 Golden Master G4와 대조한다.
// 입력: 가상 재고 목록 fixtures/excel/sample-inventory.xlsx(56랙·343위치), 빈 프로젝트, 창고 30x20·10x10, 방식 inside·order·aisle·column(줄바꿈 없음·있음).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadScenario, diff, formatDiff, normalizeLikeHarness } from './compare.js';
import { readWorkbook, sheetMatrix } from '../../src/excel/xlsx.js';
import { detectHeaderRow, autoMap, analyzeSheet } from '../../src/excel/analyze.js';
import { rackKey } from '../../src/excel/proposal.js';
import { buildCandidates } from '../../src/autolayout/candidates.js';
import { createProject, validateProject } from '../../src/core/project.js';
import { createIdGenerator } from '../../src/core/ids.js';

const scenario = loadScenario('G4');
const file = 'sample-inventory.xlsx';
const baseConfig = {
  building: 'SYNTHETIC', floor: '7F', originX: 0.1, originY: 0.1, northRotation: 0, columnDirection: 'east', firstRackPosition: 'north',
  columnGap: 0.6, rackGap: 0.2, rotation: 90, wallGap: 0.1, aisleTarget: 1.2, order: '', perColumnSettings: {}, empty: false, emptyW: 1, emptyD: 0.6, emptyH: 2,
  mode: 'new', keep: 'keep', date: '2026-11-01', source: '가상 자료', recordLayout: false, target: 'after', missingPolicy: 'mark', specPolicy: 'keep',
};

async function analysis() {
  const wb = await readWorkbook(file, fs.readFileSync(new URL('../../fixtures/excel/' + file, import.meta.url)));
  const sheet = wb.sheets[wb.sheetNames[0]];
  const matrix = sheetMatrix(sheet);
  const headerRow1 = detectHeaderRow(matrix) + 1;
  return analyzeSheet({ matrix, headerRow1, mapping: autoMap(matrix, headerRow1), cell: (a) => sheet.cells.get(a) });
}

const parse = (id) => { const [size, mode, wrap] = id.split('/'); const [w, d] = size.split('x').map(Number); return { w, d, mode, wrap: wrap === 'wrap' }; };

function project(nextId) {
  return validateProject(createProject({ sample: false, nextId, today: () => '2026-11-15' }));
}

// 재구축본 객체 ID를 기준본 기록 형식(Excel Key)으로 바꿔 같은 모양으로 만든다.
function record(b, run, w, d) {
  const keys = new Map(b.candidates.flatMap((v) => v.layout.objects).map((o) => [o.id, rackKey(o)]));
  const re = new RegExp([...keys.keys()].map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
  const fix = (v) => JSON.parse(JSON.stringify(v).replace(re, (m) => keys.get(m)));
  return {
    id: run.id, mode: run.mode, allowWrap: run.allowWrap, choice: b.choice, warehouse: { width: w, height: d },
    lastRun: b.run ? { candidates: b.run.candidates, probes: b.run.probes, starts: b.run.starts, stopReason: b.run.stopReason } : null,
    candidates: b.candidates.map((v) => fix({
      name: v.name, column: v.result.column ?? null, columnDistance: v.columnDistance ?? null, columnRotations: v.columnRotations ?? null,
      counts: v.result.counts, footprint: v.result.footprint, manualMoved: v.manualMoved, moved: v.moved, orderLoss: v.orderLoss, warehouseArea: v.result.warehouseArea, warnings: v.result.warnings,
      objects: v.layout.objects.filter((o) => o.kind === 'rack').map((o) => ({ code: o.code, depth: o.depth, key: rackKey(o), rotation: o.rotation, waiting: o.placementMeta?.waiting ?? false, width: o.width, x: o.x, y: o.y })).sort((x, y) => (x.code < y.code ? -1 : x.code > y.code ? 1 : 0)),
      rows: v.result.rows,
    })),
  };
}

for (const run of scenario.data.runs) {
  test(`G4 ${run.id}`, async () => {
    const { w, d, mode, wrap } = parse(run.id);
    const nextId = createIdGenerator({ seed: 'g4' });
    const p = project(nextId);
    const c = { ...baseConfig, width: w, depth: d, autoPlacement: { mode, keepManual: false, allowRotation: false, allowWarnings: true, preserveStructures: mode === 'column', allowWrap: wrap, externalDirection: 'right' } };
    const b = buildCandidates(p, await analysis(), c, { nextId, filename: file, sheet: 'SYNTHETIC' });
    const act = record(b, run, w, d);
    const rows = diff(normalizeLikeHarness(run), normalizeLikeHarness(act), 25);
    assert.equal(rows.length, 0, formatDiff(rows));
  });
}
