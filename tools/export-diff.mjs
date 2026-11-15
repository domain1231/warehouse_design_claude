// 내보내기 대조 자료 생성(Phase 10): 기준본 v2.4.1 rackRows·historyRows·CSV 양식·reportSvg 결과를 기록한다.
// 사용: BASELINE_REPO=../warehouse_design WAREHOUSE_BROWSER_PATH=<chrome> node tools/export-diff.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { detailFixture } from '../tests/golden/plan-cases.js';
import { exportCases } from '../tests/golden/export-cases.js';

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
for (const c of exportCases) {
  cases.push(await page.evaluate(({ text, c, fx }) => {
    P = JSON.parse(text);
    M.ensure(P);
    W.ensure(P);
    if (c.fixture) {
      const rk = P.scenarios.after.objects.filter((o) => o.kind === 'rack');
      const f = new Function('return ' + fx)()(rk[3].id, rk[4].id);
      rk[3].excel = f.excel;
      P.inventoryHistory = f.inventory;
    }
    P.settings.scenario = c.scenario;
    validateProject(P);
    $('historyMode').value = 'recorded';
    setHistory(c.history || '');
    const t = today(), sub = (v) => JSON.parse(JSON.stringify(v).split(t).join('<TODAY>'));
    const out = { name: c.name, rackRows: sub(rackRows()), historyRows: sub(historyRows()), template: sub([['date', 'rackId', 'capacity', 'quantity', 'unit', 'source'], ...active().objects.filter((o) => o.kind === 'rack').map((o) => [today(), o.id, '', '', o.unit, '사용자 입력'])]), reportSvg: reportSvg().split(t).join('<TODAY>') };
    setHistory('');
    return out;
  }, { text: projectText, c, fx: detailFixture.toString() }));
}
await browser.close();
if (errors.length) throw new Error('기준본 페이지 오류: ' + errors.join('\n'));
fs.writeFileSync(new URL('../fixtures/legacy/export-cases.json', import.meta.url), JSON.stringify({ baseline: 'domain1231/warehouse_design@d7b1e696 (v2.4.1 일반본)', generator: 'tools/export-diff.mjs', cases }, null, 1) + '\n');
for (const c of cases) console.log(`${c.name}: 랙 ${c.rackRows.length - 1}행 · 이력 ${c.historyRows.length - 1}행 · SVG ${c.reportSvg.length}자`);
