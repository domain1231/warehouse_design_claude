// D-039: '랙 번호 + 높이 활용률' 라벨(displayMode occupancy + ratioSource height). 높이 활용률은 재고가 아니므로 재고 비율과 섞지 않는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject, validateProject } from '../../src/core/project.js';
import { createIdGenerator } from '../../src/core/ids.js';
import { rackLabelsSvg } from '../../src/cad/labels.js';
import { heightUtilization } from '../../src/warehouse/appearance.js';
import { detailFixture } from '../golden/plan-cases.js';

const measure = (t, f) => t.length * f * 0.6;
function setup(ratioSource) {
  const p = validateProject(createProject({ sample: true, nextId: createIdGenerator({ seed: 'lh' }), today: () => '2026-11-16' }));
  const racks = p.scenarios[p.settings.scenario].objects.filter((o) => o.kind === 'rack');
  racks[0].excel = detailFixture(racks[0].id, racks[1].id).excel;
  p.rackLabels.displayMode = 'occupancy';
  if (ratioSource === 'height') p.rackLabels.ratioSource = 'height';
  return { p: validateProject(p), rack: racks[0] };
}
const svgOf = (p) => JSON.stringify(rackLabelsSvg(p.scenarios[p.settings.scenario], p, { pixelsPerMeter: 400, measure, fillOf: () => '#53596a' }));

test('높이 기준이면 높이 활용률(또는 높이 미확인)을 표시하고 재고 문구를 쓰지 않는다', () => {
  const { p, rack } = setup('height');
  const h = heightUtilization(rack, p.settings.heightPolicy);
  const svg = svgOf(p);
  assert.ok(h === null ? svg.includes('높이 미확인') : svg.includes('높이 '), '높이 문구');
  assert.ok(svg.includes('높이 미확인'), 'Excel 없는 랙은 높이 미확인');
  assert.ok(!svg.includes('재고 미확인'));
});

test('기본(재고 기준)은 기존 실제 적재율 라벨 그대로', () => {
  const { p } = setup('inventory');
  const svg = svgOf(p);
  assert.ok(svg.includes('재고 미확인'));
  assert.ok(!svg.includes('높이 '));
});

test('라벨 비율 기준 값 검증: height만 저장, 없으면 재고 기준(v2.4.1과 같은 모양)', () => {
  const { p } = setup('height');
  const bad = structuredClone(p);
  bad.rackLabels.ratioSource = 'volume';
  assert.throws(() => validateProject(bad), /랙 라벨 설정 오류/);
  const old = structuredClone(p);
  delete old.rackLabels.ratioSource;
  assert.equal(validateProject(old).rackLabels.ratioSource, undefined);
});
