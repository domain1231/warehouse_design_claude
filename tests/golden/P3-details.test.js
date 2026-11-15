// P3: 랙 상세 인포그래픽(SVG·요약·자재 상세)과 재고 기록 조회를 기준본 v2.4.1 결과(fixtures/legacy/plan-cases.json details)와 대조한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { detailFixture, detailViews } from './plan-cases.js';
import { validateProject } from '../../src/core/project.js';
import { rackInfoSvg, rackSummary, itemDetail, filteredShelves } from '../../src/warehouse/rackinfo.js';
import { inventoryRows } from '../../src/warehouse/records.js';

const expected = JSON.parse(fs.readFileSync(new URL('../../fixtures/legacy/plan-cases.json', import.meta.url), 'utf8')).details;
function load() {
  const p = validateProject(JSON.parse(fs.readFileSync(new URL('../../fixtures/legacy/v2.4.1-primary.project.json', import.meta.url), 'utf8')));
  const rk = p.scenarios.after.objects.filter((o) => o.kind === 'rack');
  const fx = detailFixture(rk[3].id, rk[4].id);
  rk[3].excel = fx.excel;
  p.inventoryHistory = fx.inventory;
  return { p: validateProject(p), rack: p.scenarios.after.objects.filter((o) => o.kind === 'rack')[3] };
}

test('P3 상세 요약 9항목', () => {
  const { rack } = load();
  assert.deepEqual(rackSummary(rack).map(([k, v]) => `${k}: ${v}`), expected.summary);
});

for (const v of detailViews) {
  test(`P3 인포그래픽 SVG·자재 상세: ${v.name}`, () => {
    const { rack } = load();
    const exp = expected.svgs.find((s) => s.name === v.name);
    assert.equal(rackInfoSvg(rack, { shelfOrder: v.shelfOrder, info: v.info }), exp.svg);
    const chosen = filteredShelves(rack, { shelf: '', search: '' }).flatMap((s) => s.items).find((i) => i.location === v.info.item);
    assert.deepEqual(chosen ? itemDetail(chosen) : [], exp.detail);
  });
}

for (const scope of ['current', 'all', 'legacy']) {
  test(`P3 재고 기록 조회: ${scope}`, () => {
    const { p } = load();
    const rows = inventoryRows(p, { scope }).map((r) => [r.scenario, r.date, r.rack, r.amount, r.ratio, r.source]);
    assert.deepEqual(rows, expected.inventory.find((x) => x.scope === scope).rows);
  });
}
