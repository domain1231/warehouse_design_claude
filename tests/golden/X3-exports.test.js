// X3: 내보내기(랙 목록 CSV·이력 CSV·CSV 양식·보고서 SVG = SVG/PNG/인쇄 공통 원본)를 기준본 v2.4.1 결과
// (fixtures/legacy/export-cases.json, tools/export-diff.mjs)와 대조한다. 오늘 날짜는 '<TODAY>'로 치환해 비교한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { detailFixture } from './plan-cases.js';
import { exportCases } from './export-cases.js';
import { tableMeasure } from './label-measure.js';
import { validateProject } from '../../src/core/project.js';
import { setFallbackMeasure } from '../../src/cad/labels.js';
import { historyLayout } from '../../src/warehouse/records.js';
import { rackCsvRows, historyCsvRows, templateCsvRows, reportSvg } from '../../src/exports/report.js';

setFallbackMeasure(tableMeasure);
const expected = JSON.parse(fs.readFileSync(new URL('../../fixtures/legacy/export-cases.json', import.meta.url), 'utf8')).cases;
const projectText = fs.readFileSync(new URL('../../fixtures/legacy/v2.4.1-primary.project.json', import.meta.url), 'utf8');
const TODAY = '2026-11-15';
const sub = (v) => JSON.parse(JSON.stringify(v).split(TODAY).join('<TODAY>'));

test('X3 사례 목록이 기준본 자료와 같다', () => {
  assert.deepEqual(expected.map((c) => c.name), exportCases.map((c) => c.name));
});
for (const c of exportCases) {
  test(`X3 ${c.name}`, () => {
    const p = validateProject(JSON.parse(projectText));
    if (c.fixture) {
      const rk = p.scenarios.after.objects.filter((o) => o.kind === 'rack');
      const f = detailFixture(rk[3].id, rk[4].id);
      rk[3].excel = f.excel;
      p.inventoryHistory = f.inventory;
    }
    p.settings.scenario = c.scenario;
    validateProject(p);
    const exp = expected.find((x) => x.name === c.name);
    const layout = historyLayout(p, c.history || '', 'recorded');
    assert.deepEqual(sub(rackCsvRows(layout)), exp.rackRows, '랙 목록 CSV');
    assert.deepEqual(sub(historyCsvRows(p)), exp.historyRows, '이력 CSV');
    assert.deepEqual(sub(templateCsvRows(layout, TODAY)), exp.template, 'CSV 양식');
    assert.equal(reportSvg(p, { layout, historyDate: c.history || '', today: TODAY }).split(TODAY).join('<TODAY>'), exp.reportSvg, '보고서 SVG');
  });
}
