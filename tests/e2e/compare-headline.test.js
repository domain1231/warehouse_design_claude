// D1(D-078): 비교 화면 맨 위 결론 문장·KPI 카드 4개·개선/악화 표시(가상 GT-EMPTY 배치를 상태에 넣어 확인).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { openSyntheticCompare } from './compare-helpers.js';
let browser;
before(async () => { browser = await chromium.launch({ headless: true, executablePath: process.env.WAREHOUSE_BROWSER_PATH || undefined }); });
after(async () => { await browser?.close(); });
test('결론 문장·KPI 카드 4개·표의 개선 ▲/중립 표시', async () => {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  await openSyntheticCompare(page);
  const head = await page.locator('[data-testid=compare-conclusion]').innerText();
  assert.match(head, /^평균 용적률 \+\d+\.\d%p, 빈 랙 12대 확보, 보관 가능 공간 \+\d+\.\d%p$/);
  assert.equal(await page.locator('[data-testid=compare-warning]').count(), 0);
  const kpis = page.locator('[data-testid=compare-kpis] [data-kpi]');
  assert.deepEqual(await kpis.evaluateAll((els) => els.map((e) => e.dataset.kpi)), ['M3', 'M4', 'M8', 'M12']);
  assert.match(await kpis.nth(0).innerText(), /평균 용적률[\s\S]*→[\s\S]*▲ \+\d+\.\d%p 개선/);
  assert.equal(await page.locator('tr[data-metric=M3]').getAttribute('data-trend'), 'better');
  assert.match(await page.locator('tr[data-metric=M3] td:nth-child(3)').innerText(), /^▲ \+/);
  assert.equal(await page.locator('tr[data-metric=M6]').getAttribute('data-trend'), 'neutral');
  assert.doesNotMatch(await page.locator('tr[data-metric=M6] td:nth-child(3)').innerText(), /[▲▼]/);
  const green = await page.locator('tr[data-metric=M3] .r-trend').evaluate((e) => getComputedStyle(e).color);
  assert.equal(green, 'rgb(79, 209, 139)');
  assert.deepEqual(problems, []);
  await ctx.close();
});
