// 과거 날짜 조회 대조 자료 생성(Phase 7b): 기준본 v2.4.1 display()(00·40·60 래퍼)와 historyStatus 문구를 기록한다.
// 사용: BASELINE_REPO=../warehouse_design WAREHOUSE_BROWSER_PATH=<chrome> node tools/history-diff.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { detailFixture } from '../tests/golden/plan-cases.js';
import { historyFixture, historyCases } from '../tests/golden/history-cases.js';

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
const page = await (await browser.newContext({ offline: true })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(pathToFileURL(path.join(baseline, 'dist', stem + '.html')).href);
await page.waitForSelector('#vStorage', { state: 'visible' });
const cases = [];
for (const c of historyCases) {
  cases.push(await page.evaluate(({ text, c, fx1, fx2 }) => {
    const detail = new Function('return ' + fx1)(), hist = new Function('return ' + fx2)();
    P = JSON.parse(text);
    M.ensure(P);
    W.ensure(P);
    const rk = P.scenarios.after.objects.filter((o) => o.kind === 'rack');
    const fx = detail(rk[3].id, rk[4].id);
    rk[3].excel = fx.excel;
    P.inventoryHistory = fx.inventory;
    const h = hist(P.scenarios.after, rk[3].id, fx.excel);
    P.layoutSnapshots = h.layoutSnapshots;
    P.excelSnapshots = h.excelSnapshots;
    P.settings.scenario = c.scenario || 'after';
    validateProject(P);
    $('historyMode').value = c.mode;
    setHistory(c.date);
    const d = display();
    const pick = (o) => ({ id: o.id, x: o.x, y: o.y, capacity: o.capacity, quantity: o.quantity, unit: o.unit, source: o.source, hasRecord: o.hasRecord, excel: o.excel, originalSpec: o.originalSpec, designSpec: o.designSpec, specificationChanged: o.specificationChanged });
    const out = { name: c.name, objects: JSON.parse(JSON.stringify(d.objects.map(pick))), layoutRecorded: d.layoutRecorded, status: $('historyStatus').textContent };
    setHistory('');
    return out;
  }, { text: projectText, c, fx1: detailFixture.toString(), fx2: historyFixture.toString() }));
}
await browser.close();
if (errors.length) throw new Error('기준본 페이지 오류: ' + errors.join('\n'));
fs.writeFileSync(new URL('../fixtures/legacy/history-cases.json', import.meta.url), JSON.stringify({ baseline: 'domain1231/warehouse_design@d7b1e696 (v2.4.1 일반본)', generator: 'tools/history-diff.mjs', cases }, null, 1) + '\n');
for (const c of cases) console.log(`${c.name}: ${c.status}`);
