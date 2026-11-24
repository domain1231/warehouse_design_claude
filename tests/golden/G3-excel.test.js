// G3: 가상 재고 목록(fixtures/excel/sample-inventory.csv·xlsx, 56랙·139단·343위치) 분석과 랙 생성을 기준본 Golden Master G3와 대조한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadScenario, diff, formatDiff, normalize } from './compare.js';
import { readWorkbook, sheetMatrix } from '../../src/excel/xlsx.js';
import { detectHeaderRow, autoMap, analyzeSheet } from '../../src/excel/analyze.js';
import { generateRacks } from '../../src/excel/proposal.js';
import { createIdGenerator } from '../../src/core/ids.js';

const scenario = loadScenario('G3');
const config = {
  building: 'SYNTHETIC', floor: '7F', width: 30, depth: 20, originX: 1, originY: 1, northRotation: 0, columnDirection: 'east', firstRackPosition: 'north',
  columnGap: 0.6, rackGap: 0.2, rotation: 90, wallGap: 0.1, aisleTarget: 1.2, order: '', perColumnSettings: {}, empty: false, emptyW: 1, emptyD: 0.6, emptyH: 2, date: '2026-11-01',
};
// 기준본 기록 형식: 랙 객체에서 뽑은 평면 필드, 로케이션 문자열 순으로 정렬.
const flat = (o) => ({
  block: o.block, building: o.excel.building, capacity: o.capacity, code: o.code, column: o.excel.column, depth: o.depth, floor: o.excel.floor, height: o.height,
  key: `excel|${o.excel.building}|${o.excel.key}`, kind: o.kind, materials: o.excel.shelves.flatMap((s) => s.items).length, provenance: o.provenance, quantity: o.quantity,
  rackNumber: o.excel.rackNumber, rotation: o.rotation, shelves: o.excel.shelves.length, type: o.type, unit: o.unit, width: o.width, x: o.x, y: o.y,
});

for (const [kind, file] of [['csv', 'sample-inventory.csv'], ['xlsx', 'sample-inventory.xlsx']]) {
  test(`G3 ${kind}: 분석·랙 생성`, async () => {
    const wb = await readWorkbook(file, fs.readFileSync(new URL('../../fixtures/excel/' + file, import.meta.url)));
    const sheet = wb.sheets[wb.sheetNames[0]];
    const matrix = sheetMatrix(sheet);
    const headerRow1 = detectHeaderRow(matrix) + 1;
    const analysis = analyzeSheet({ matrix, headerRow1, mapping: autoMap(matrix, headerRow1), cell: (a) => sheet.cells.get(a) });
    const racks = generateRacks(analysis, config, { nextId: createIdGenerator({ seed: 'g3' }), filename: file, sheet: wb.sheetNames[0] }).map(flat).sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
    const act = { analysis: JSON.parse(JSON.stringify(analysis)), generated: racks };
    const rows = diff(normalize(scenario.data[kind]), normalize(act), 25);
    assert.equal(rows.length, 0, formatDiff(rows));
  });
}
