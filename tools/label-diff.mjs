// 랙·ZONE 라벨 대조 자료 생성(Phase 5c): 기준본 v2.4.1 일반본 scene()의 g.v-labels, Q.parts, V.fullLabel.
// 사용: BASELINE_REPO=../warehouse_design WAREHOUSE_BROWSER_PATH=<chrome> node tools/label-diff.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { detailFixture } from '../tests/golden/plan-cases.js';
import { labelCases } from '../tests/golden/label-cases.js';

const baseline = process.env.BASELINE_REPO;
if (!baseline) {
  console.error('BASELINE_REPO=<기준본 저장소 경로>를 지정하세요.');
  process.exit(2);
}
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { stem } = require(path.join(baseline, 'tools/version.cjs'));
const projectText = fs.readFileSync(new URL('../fixtures/legacy/v2.4.1-primary.project.json', import.meta.url), 'utf8');
const browser = await chromium.launch({ executablePath: process.env.WAREHOUSE_BROWSER_PATH || undefined });
const context = await browser.newContext();
await context.setOffline(true);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(pathToFileURL(path.join(baseline, 'dist', stem + '.html')).href);
await page.waitForSelector('#vStorage', { state: 'visible' });

const cases = await page.evaluate(({ text, cases, fixtureSrc }) => {
  const makeFixture = new Function('return ' + fixtureSrc)();
  return cases.map((c) => {
    P = JSON.parse(text);
    M.ensure(P);
    W.ensure(P);
    P.settings.scenario = 'after';
    const rk = P.scenarios.after.objects.filter((o) => o.kind === 'rack');
    const fx = makeFixture(rk[3].id, rk[4].id);
    rk[3].excel = fx.excel;
    P.inventoryHistory = fx.inventory;
    Object.assign(P.rackLabels, c.labels || {});
    validateProject(P);
    const racks = display().objects.filter((o) => o.kind === 'rack');
    for (const [i, name] of Object.entries(c.zone || {})) P.rackLabels.zoneNames.after[Q.parts(racks[i]).key] = name;
    selected = new Set(racks.slice(0, c.select || 0).map((o) => o.id));
    P.editing.selectedRackIds = [...selected];
    P.editing.selectionScenario = 'after';
    M.size = () => ({ w: c.size.w, h: c.size.h });
    M.center(true);
    for (const f of c.zoom || []) zoom(f);
    const host = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    host.innerHTML = scene(display());
    return {
      name: c.name,
      input: { viewport: { ...P.viewport }, size: c.size, rackLabels: JSON.parse(JSON.stringify(P.rackLabels)), selected: [...selected], excelRack: rk[3].id, inventory: fx.inventory },
      labels: [...host.querySelectorAll('g.v-labels')].map((g) => g.outerHTML),
      parts: racks.map((o) => ({ id: o.id, ...Q.parts(o) })),
      fullLabels: racks.map((o) => V.fullLabel(o)),
    };
  });
}, { text: projectText, cases: labelCases, fixtureSrc: detailFixture.toString() });
await browser.close();
if (errors.length) throw new Error('기준본 페이지 오류: ' + errors.join('\n'));
const out = { baseline: 'domain1231/warehouse_design@d7b1e696 (v2.4.1 일반본)', generator: 'tools/label-diff.mjs', cases };
fs.writeFileSync(new URL('../fixtures/legacy/label-cases.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log(cases.map((c) => `${c.name}: 라벨 ${c.labels.length}개 [${[...new Set(c.labels.map((l) => /data-label-fallback="(\w+)"/.exec(l)?.[1]))].join(',')}]`).join('\n'));
