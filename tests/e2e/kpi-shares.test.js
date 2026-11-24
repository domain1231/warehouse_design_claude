// D-058·D-059·D-061: 상단 지표 8칸. 면적 사용률·통로 비중은 ① Excel 방식(총면적 = Excel 입력값, 없으면 도면 전체),
// 보관 불가·잔여 비중은 공간 구성 4분해(도면 기준). 값의 출처는 src/metrics/space.js 하나.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '../..');
const meta = JSON.parse(fs.readFileSync(path.join(root, 'dist/build-metadata.json'), 'utf8'));
const fileUrl = pathToFileURL(path.join(root, 'dist', meta.file)).href;
let browser;
before(async () => { browser = await chromium.launch({ headless: true, executablePath: process.env.WAREHOUSE_BROWSER_PATH || undefined }); });
after(async () => { await browser?.close(); });

const kpi = (page) => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#topStats .stat')].map((s) => [s.querySelector('small').textContent, { v: s.querySelector('strong').textContent, sub: s.querySelector('.stat-sub')?.textContent ?? '' }])));
const rows = (page) => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#spaceMetrics .metricline')].map((r) => [r.children[0].textContent, r.children[1].textContent])));

test('상단 지표 8칸: 면적 사용률·통로 비중 ① Excel 방식(총면적 없으면 도면 전체 → 있으면 Excel 총면적), 공간 구성 합 100%', async () => {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  await page.goto(fileUrl);
  await page.waitForFunction(() => window.__warehouseView);
  let k = await kpi(page);
  assert.deepEqual(Object.keys(k), ['전체 창고 면적', '현재 랙 수', '면적 사용률', '통로 비중', '보관 불가 구역 비중', '보관 가능 잔여 비중', '최소 통로 폭', '공간 경고']);
  assert.equal(await page.locator('[data-testid=k-load]').count(), 0);
  const area = Number(k['전체 창고 면적'].v), rackArea = Number((await rows(page))['랙 면적 합계'].replace('㎡', ''));
  // Excel 총면적이 없는 샘플: 도면 전체 기준
  assert.match(k['면적 사용률'].sub, /도면 전체/);
  assert.equal(k['면적 사용률'].v, ((rackArea / area) * 100).toFixed(1));
  assert.equal(Number(k['통로 비중'].v), Number((100 - Number(k['면적 사용률'].v)).toFixed(1)), '통로 비중 ① = 1 − 면적 사용률');
  assert.match(k['통로 비중'].sub, /도면 통로 [\d.]+%/, '② 도면 방식 값도 함께 표시');
  const comp = (await rows(page))['공간 구성'].match(/[\d.]+/g).map(Number);
  assert.ok(Math.abs(comp.reduce((a, b) => a + b, 0) - 100) <= 0.2, `공간 구성 합 ${comp}`);
  assert.equal(Number(k['보관 불가 구역 비중'].v), comp[1]);
  assert.equal(Number(k['보관 가능 잔여 비중'].v), comp[3]);

  // Excel 총면적이 기록된 배치: 그 값을 기준으로
  await page.evaluate(() => window.__warehouseSession.apply('가상 총면적', (P) => {
    const k = P.settings.scenario;
    P.scenarioMeta[k].sourceInfo = { file: '가상.xlsx', sheet: '가상', asOf: '2026-11-01', source: '가상 자료', importedAt: new Date().toISOString(), referenceArea: 500 };
    return { ok: true, project: P };
  }));
  const other = await page.evaluate(() => (window.__warehouseSession.state.project.settings.scenario === 'after' ? 'before' : 'after'));
  const back = await page.evaluate(() => window.__warehouseSession.state.project.settings.scenario);
  await page.locator(`[data-testid=scenario-${other}]`).click();
  await page.locator(`[data-testid=scenario-${back}]`).click();
  await page.waitForFunction(() => /Excel 총면적/.test(document.getElementById('kFootprintSub').textContent));
  k = await kpi(page);
  assert.equal(k['면적 사용률'].v, ((rackArea / 500) * 100).toFixed(1));
  assert.match(k['전체 창고 면적'].sub, /Excel 총면적 500㎡/);
  assert.equal(await page.$eval('#topStats', (n) => getComputedStyle(n).gridTemplateColumns.split(' ').length), 8);
  assert.deepEqual(problems, []);
  await ctx.close();
});
