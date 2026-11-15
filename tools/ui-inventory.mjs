// 기준본 v2.4.1 UI 목록 자료 생성(Phase 9b-0, D-032): 전체 DOM 컨트롤·섹션 제목과 선택 상태별 컨트롤을 기록한다.
// 사용: BASELINE_REPO=../warehouse_design WAREHOUSE_BROWSER_PATH=<chrome> node tools/ui-inventory.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { collectUi, collectStates } from '../tests/e2e/ui-inventory.js';

const baseline = process.env.BASELINE_REPO;
if (!baseline) {
  console.error('BASELINE_REPO=<기준본 저장소 경로>를 지정하세요.');
  process.exit(2);
}
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { stem } = require(path.join(baseline, 'tools/version.cjs'));
const browser = await chromium.launch({ executablePath: process.env.WAREHOUSE_BROWSER_PATH || undefined });
const page = await (await browser.newContext({ offline: true, viewport: { width: 1600, height: 1000 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(pathToFileURL(path.join(baseline, 'dist', stem + '.html')).href);
await page.waitForSelector('#vStorage', { state: 'visible' });
await page.waitForTimeout(800);
const select = (pg, st) => pg.evaluate((st) => {
  const l = P.scenarios[P.settings.scenario].objects, racks = l.filter((o) => o.kind === 'rack');
  const pick = st === 'rack1' ? [racks[0]] : st === 'rack2' ? [racks[0], racks[1]] : [l.find((o) => o.kind === st)];
  selected = new Set(pick.filter(Boolean).map((o) => o.id));
  renderAll();
}, st);
const clear = (pg) => pg.evaluate(() => { selected = new Set(); renderAll(); });
const all = await page.evaluate(collectUi, true);
const states = await collectStates(page, select, clear);
await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
const out = { source: `warehouse_design ${stem}`, viewport: '1600x1000', all, states };
fs.writeFileSync(new URL('../fixtures/legacy/ui-inventory.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
console.log('all', all.length, Object.entries(states).map(([k, v]) => `${k} ${v.length}`).join(' · '));
