// D-070: Excel 업데이트·병합은 사용자가 수정한 랙 필드를 보존하고 Excel 유래 값만 갱신한다. 새 배치는 기본값.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readWorkbook, sheetMatrix } from '../../src/excel/xlsx.js';
import { detectHeaderRow, autoMap, analyzeSheet } from '../../src/excel/analyze.js';
import { baseProposal } from '../../src/autolayout/candidates.js';
import { validateProject } from '../../src/core/project.js';
import { createIdGenerator } from '../../src/core/ids.js';
import { proposalCases } from '../golden/excel-cases.js';

const FILE = 'synthetic-basic.xlsx';
const projectText = fs.readFileSync(new URL('../../fixtures/legacy/v2.4.1-primary.project.json', import.meta.url), 'utf8');
const baseC = proposalCases[0].steps[0].c;
const manualOff = { ...proposalCases.find((c) => c.name.startsWith('병합')).steps[0].c.autoPlacement };

async function analysis(dim) {
  const wb = await readWorkbook(FILE, fs.readFileSync(new URL('../../fixtures/excel/' + FILE, import.meta.url)));
  const sheet = wb.sheets[wb.sheetNames[0]];
  const matrix = sheetMatrix(sheet), headerRow1 = detectHeaderRow(matrix) + 1;
  return analyzeSheet({ matrix, headerRow1, mapping: autoMap(matrix, headerRow1), cell: (a) => sheet.cells.get(a), resolutions: { '7F-A-2': dim } });
}

async function scenario(c2) {
  const nextId = createIdGenerator({ seed: 'keep' });
  let p = validateProject(JSON.parse(projectText));
  const opts = { nextId, filename: FILE, sheet: '자재 목록', missingDelete: new Set() };
  const first = baseProposal(p, await analysis([800, 1850, 2000]), { ...baseC, autoPlacement: manualOff }, opts);
  p.scenarios.after = structuredClone(first.layout);
  p = validateProject(p);
  const tag = { block: 'Z9', type: '팔레트랙', userTag: { a: 1 }, note: '사용자 메모', capacity: 7, quantity: 3, unit: 'EA' };
  const target = p.scenarios.after.objects.find((o) => o.excel?.key === '7F-A-2');
  Object.assign(target, structuredClone(tag));
  const before = structuredClone(target);
  const next = baseProposal(p, await analysis([900, 1850, 2000]), { ...baseC, autoPlacement: manualOff, ...c2 }, opts);
  const out = next.layout.objects.find((o) => o.id === before.id);
  return { before, out, next, tag };
}

for (const [name, c2] of [['update keep', { mode: 'update', keep: 'keep', specPolicy: 'keep' }], ['update reflow', { mode: 'update', keep: 'reflow', specPolicy: 'keep' }], ['merge', { mode: 'merge', specPolicy: 'keep' }]]) {
  test(`${name}: 사용자 수정 필드 보존, Excel 유래 값 갱신, 규격 keep`, async () => {
    const { before, out, tag } = await scenario(c2);
    for (const k of Object.keys(tag)) assert.deepEqual(out[k], tag[k], k);
    assert.equal(out.originalSpec.width, 0.9);
    assert.equal(out.width, before.width); // specPolicy keep: 설계 규격 유지
    assert.equal(out.designSpec.width, before.width);
    assert.equal(out.specificationChanged, true);
    assert.ok(out.excel.shelves.length > 0);
    assert.equal(out.excel.originalRackSpecification.width, 0.9);
  });
}

test('specPolicy source는 설계 규격도 새 Excel 값으로 바꾸되 사용자 필드는 보존', async () => {
  const { out, tag } = await scenario({ mode: 'update', keep: 'reflow', specPolicy: 'source' });
  assert.equal(out.width, 0.9);
  assert.equal(out.block, tag.block);
  assert.equal(out.type, tag.type);
});

test('새 배치(new)는 기본값을 쓴다', async () => {
  const { next, tag } = await scenario({ mode: 'new' });
  const out = next.layout.objects.find((o) => o.excel?.key === '7F-A-2');
  assert.notEqual(out.block, 'Z9'); // 새 배치는 기존처럼 id·메모·수량만 잇고 나머지는 Excel 기본값
  assert.notEqual(out.type, '팔레트랙');
  assert.equal(out.userTag, undefined);
  assert.equal(out.note, tag.note);
});
