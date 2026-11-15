// H1: 과거 날짜 조회 배치(기록 배치 우선/현재 배치+과거 재고, Excel 스냅숏, 원본 규격)와 상태 문구를
// 기준본 v2.4.1 display()·historyStatus 결과(fixtures/legacy/history-cases.json, tools/history-diff.mjs)와 대조한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { detailFixture } from './plan-cases.js';
import { historyFixture, historyCases } from './history-cases.js';
import { validateProject } from '../../src/core/project.js';
import { historyLayout, historyStatusText } from '../../src/warehouse/records.js';

const expected = JSON.parse(fs.readFileSync(new URL('../../fixtures/legacy/history-cases.json', import.meta.url), 'utf8')).cases;
const projectText = fs.readFileSync(new URL('../../fixtures/legacy/v2.4.1-primary.project.json', import.meta.url), 'utf8');

test('H1 사례 목록이 기준본 자료와 같다', () => {
  assert.deepEqual(expected.map((c) => c.name), historyCases.map((c) => c.name));
});
for (const c of historyCases) {
  test(`H1 ${c.name}`, () => {
    const p = validateProject(JSON.parse(projectText));
    const rk = p.scenarios.after.objects.filter((o) => o.kind === 'rack');
    const fx = detailFixture(rk[3].id, rk[4].id);
    rk[3].excel = fx.excel;
    p.inventoryHistory = fx.inventory;
    const h = historyFixture(p.scenarios.after, rk[3].id, fx.excel);
    p.layoutSnapshots = h.layoutSnapshots;
    p.excelSnapshots = h.excelSnapshots;
    p.settings.scenario = c.scenario || 'after';
    validateProject(p);
    const d = historyLayout(p, c.date, c.mode);
    const exp = expected.find((x) => x.name === c.name);
    const pick = (o) => ({ id: o.id, x: o.x, y: o.y, capacity: o.capacity, quantity: o.quantity, unit: o.unit, source: o.source, hasRecord: o.hasRecord, excel: o.excel, originalSpec: o.originalSpec, designSpec: o.designSpec, specificationChanged: o.specificationChanged });
    assert.deepEqual(JSON.parse(JSON.stringify(d.objects.map(pick))), exp.objects);
    assert.equal(d.layoutRecorded, exp.layoutRecorded);
    assert.equal(historyStatusText(p, c.date, d), exp.status);
  });
}
