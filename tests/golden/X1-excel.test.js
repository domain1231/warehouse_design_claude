// X1: Excel 읽기(XLSX·CSV)·머리글 탐지·자동 매핑·분석을 기준본 v2.4.1(SheetJS + EX.analyze) 결과와 대조한다.
// 입력 바이트는 fixtures/excel/(가상 자료, tools/excel-diff.mjs가 기준본 SheetJS로 생성), 기대값은 fixtures/legacy/excel-cases.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { excelCases } from './excel-cases.js';
import { diff, formatDiff, normalize } from './compare.js';
import { readWorkbook, sheetMatrix, WorkbookError } from '../../src/excel/xlsx.js';
import { detectHeaderRow, autoMap, analyzeSheet } from '../../src/excel/analyze.js';

const expected = JSON.parse(fs.readFileSync(new URL('../../fixtures/legacy/excel-cases.json', import.meta.url), 'utf8')).results;

test('X1 대조 자료가 사례 목록과 같다', () => {
  assert.deepEqual(expected.map((r) => r.name), excelCases.map((c) => c.name));
});

for (const c of excelCases) {
  test(`X1 ${c.name}`, async () => {
    const bytes = fs.readFileSync(new URL(`../../fixtures/excel/${c.file}`, import.meta.url));
    const wb = await readWorkbook(c.file, bytes);
    const exp = expected.find((r) => r.name === c.name);
    assert.deepEqual(wb.sheetNames, exp.sheetNames);
    const sheet = wb.sheets[wb.sheetNames[0]];
    const matrix = sheetMatrix(sheet);
    assert.deepEqual(matrix, exp.matrix);
    const headerRow1 = detectHeaderRow(matrix) + 1;
    assert.equal(headerRow1, exp.headerRow1);
    const mapping = { ...autoMap(matrix, headerRow1), ...(c.remap ?? {}) };
    assert.deepEqual(mapping, exp.mapping);
    const analysis = analyzeSheet({ matrix, headerRow1, mapping, cell: (a) => sheet.cells.get(a), resolutions: c.resolutions ?? {} });
    const rows = diff(normalize(exp.analysis), normalize(JSON.parse(JSON.stringify(analysis))), 25);
    assert.equal(rows.length, 0, formatDiff(rows));
  });
}

test('X1 파일 검사: 확장자·크기·ZIP 서명·잘못된 UTF-8', async () => {
  await assert.rejects(() => readWorkbook('a.xls', new Uint8Array(10)), /XLSX 또는 UTF-8 CSV/);
  await assert.rejects(() => readWorkbook('a.xlsx', new Uint8Array(12e6 + 1)), /12MB/);
  await assert.rejects(() => readWorkbook('a.xlsx', new Uint8Array([1, 2, 3, 4, 5])), WorkbookError);
  await assert.rejects(() => readWorkbook('a.csv', new Uint8Array([0xff, 0xfe, 0x41])), TypeError);
});
