// 공간검사 대조 자료 생성: tests/golden/spatial-cases.js의 배치를 기준본 v2.4.1에서 warnings·W.scan으로 검사하고
// 하네스와 같은 방식으로 정규화해 fixtures/legacy/spatial-cases.json에 기록한다.
// 사용: BASELINE_REPO=../warehouse_design WAREHOUSE_BROWSER_PATH=<chrome> node tools/spatial-diff.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spatialCases } from '../tests/golden/spatial-cases.js';
import { normalizeLikeHarness } from '../tests/golden/compare.js';

const baseline = process.env.BASELINE_REPO;
if (!baseline) {
  console.error('BASELINE_REPO=<기준본 저장소 경로>를 지정하세요. 기준본 일반본(pnpm build:normal)이 필요합니다.');
  process.exit(2);
}
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { stem } = require(path.join(baseline, 'tools/version.cjs'));

const browser = await chromium.launch({ executablePath: process.env.WAREHOUSE_BROWSER_PATH || undefined });
const context = await browser.newContext();
await context.setOffline(true);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(pathToFileURL(path.join(baseline, 'dist', stem + '.html')).href);
await page.waitForSelector('#vStorage', { state: 'visible' });

const results = await page.evaluate((cases) => cases.map((c) => {
  P = makeProject(false);
  P.metadata.sample = false;
  P.settings.scenario = 'after';
  P.settings.minGap = c.minGap;
  P.settings.policy = 'warn';
  P.locationLayout.wallGap = c.wallGap;
  const l = P.scenarios.after;
  l.warehouse = { ...c.warehouse };
  l.objects = c.objects.map(([kind, x, y, w, d, extra]) => object(kind, x, y, w, d, JSON.parse(JSON.stringify(extra))));
  if (c.rules) l.autoPlacementRules = { ...c.rules };
  if (c.layoutWallGap !== undefined) l.wallGap = c.layoutWallGap;
  P.scenarios.before = clone(l);
  W.cache.clear();
  M.ensure(P);
  W.ensure(P);
  validateProject(P);
  const layout = P.scenarios.after;
  const ws = warnings(layout);
  W.cache.clear();
  const scan = W.scan(layout);
  return { name: c.name, warnings: JSON.parse(JSON.stringify(ws)), scan: JSON.parse(JSON.stringify(scan)) };
}), spatialCases);
await browser.close();
if (errors.length) {
  console.error('page errors', errors);
  process.exit(1);
}
const out = new URL('../fixtures/legacy/spatial-cases.json', import.meta.url);
fs.writeFileSync(out, JSON.stringify({ baseline: 'v2.4.1 normal build', note: 'SYNTHETIC; regenerate with tools/spatial-diff.mjs when cases change', results: results.map((r) => normalizeLikeHarness(r)) }, null, 1) + '\n');
console.log(results.map((r) => `${r.name}: ${r.warnings.length} warnings, validInside ${r.scan.counts.validInside}/${r.scan.counts.total}`).join('\n'));
