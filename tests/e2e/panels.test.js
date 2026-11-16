// 실제 브라우저(file://, 오프라인) Phase 4: 통계·경고 목록·랙 목록(검색·필터·정렬)·범례·패널 접기.
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
before(async () => {
  browser = await chromium.launch({ headless: true, executablePath: process.env.WAREHOUSE_BROWSER_PATH || undefined });
});
after(async () => {
  await browser?.close();
});
async function open(viewport = { width: 1400, height: 900 }) {
  const ctx = await browser.newContext({ offline: true, viewport });
  const page = await ctx.newPage();
  page.problems = [];
  page.on('pageerror', (e) => page.problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && page.problems.push(`console: ${m.text()}`));
  page.on('request', (r) => !/^(file|data|blob):/.test(r.url()) && page.problems.push(`network: ${r.url()}`));
  await page.goto(fileUrl);
  await page.waitForFunction(() => window.__warehouseView && document.querySelector('[data-testid=plan] g[data-id]'));
  return { ctx, page };
}
const saved = (page) => page.waitForFunction(() => document.querySelector('[data-testid=status]').dataset.state === 'saved');

test('통계·범례: 샘플 배치의 면적·랙 수·경고 수, 범례 6항목과 적재 기준 범위', async () => {
  const { ctx, page } = await open();
  const p = await page.evaluate(() => window.__warehouseSession.state.project);
  const racks = p.scenarios.after.objects.filter((o) => o.kind === 'rack').length;
  assert.equal(await page.locator('[data-testid=k-racks]').textContent(), `${racks}`);
  assert.match(await page.locator('[data-testid=k-area]').textContent(), /^\d+(\.\d+)?$/);
  const warnCount = await page.locator('[data-testid=warnings-section] li').count();
  assert.equal(await page.locator('[data-testid=k-warnings]').textContent(), `${warnCount}`);
  assert.equal(await page.locator('[data-testid=legend] span').count(), 6);
  assert.match(await page.locator('[data-testid=legend]').textContent(), /보통 \(50% 이상 ~ 90% 미만\)/);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('경고 목록 클릭: 관련 객체를 선택하고 그 영역으로 화면 이동', async () => {
  const { ctx, page } = await open();
  await page.locator('[data-testid=bottom-toggle]').click(); // 하단 패널은 기본으로 접혀 있다
  const first = page.locator('[data-testid=warnings-section] li').first();
  await first.click();
  const v = await page.evaluate(() => window.__warehouseView);
  assert.ok(v.selected.length >= 1);
  assert.equal(v.viewport.centerLocked, false);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('랙 목록: 검색·필터는 목록을 줄이고 도면에서 나머지를 흐리며, 정렬·행 클릭 선택, 새로고침 후 필터 유지', async () => {
  const { ctx, page } = await open();
  await page.locator('[data-testid=bottom-toggle]').click(); // 하단 패널은 기본으로 접혀 있다
  const total = await page.locator('[data-testid=rack-list] [data-rack]').count();
  assert.ok(total > 10);
  await page.locator('[data-testid=rack-search]').fill('b-7');
  await page.waitForFunction((n) => document.querySelectorAll('[data-testid=rack-list] [data-rack]').length < n, total);
  const shown = await page.locator('[data-testid=rack-list] [data-rack]').count();
  assert.equal(await page.locator('[data-testid=bottom-summary-racks]').textContent(), `${total}개`); // 기준본: 요약은 필터와 무관한 전체 랙 수
  const dimmed = await page.locator('[data-testid=plan] g[data-id][opacity="0.2"]').count();
  assert.equal(dimmed, total - shown);
  await page.locator('[data-testid=rack-sort]').selectOption('codeDesc');
  await page.waitForFunction(() => {
    const t = [...document.querySelectorAll('[data-testid=rack-list] [data-rack]')].map((r) => r.textContent);
    return t.length > 1 && t[0].localeCompare(t[1], 'ko', { numeric: true }) > 0;
  });
  const row = page.locator('[data-testid=rack-list] [data-rack]').first();
  const id = await row.getAttribute('data-rack');
  await row.click();
  assert.deepEqual(await page.evaluate(() => window.__warehouseView.selected), [id]);
  await saved(page);
  await page.reload();
  await page.waitForFunction(() => window.__warehouseView && document.querySelector('[data-testid=rack-list] [data-rack]'));
  assert.equal(await page.locator('[data-testid=rack-search]').inputValue(), 'b-7');
  assert.equal(await page.locator('[data-testid=rack-sort]').inputValue(), 'codeDesc');
  assert.equal(await page.locator('[data-testid=rack-list] [data-rack]').count(), shown);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('패널 접기: 도구·정보 패널을 접으면 도면이 넓어지고 축척(1m당 px)은 그대로, 새로고침 후 유지', async () => {
  const { ctx, page } = await open();
  const w0 = (await page.locator('[data-testid=canvas-wrap]').boundingBox()).width;
  const ppm = () => page.evaluate(() => {
    const m = document.querySelector('[data-testid=plan]').getScreenCTM();
    return Math.hypot(m.a, m.b);
  });
  const s0 = await ppm();
  await page.locator('[data-testid=toggle-left]').click();
  await page.locator('[data-testid=toggle-right]').click();
  await page.waitForFunction((w) => document.querySelector('[data-testid=canvas-wrap]').getBoundingClientRect().width > w + 300, w0);
  // ResizeObserver가 viewBox를 다시 맞춘 뒤의 축척을 본다
  await page.waitForFunction((s) => { const m = document.querySelector('[data-testid=plan]').getScreenCTM(); return Math.abs(Math.hypot(m.a, m.b) - s) < 1e-4; }, s0, { timeout: 3000 });
  await saved(page);
  await page.reload();
  await page.waitForFunction(() => window.__warehouseView);
  const p = await page.evaluate(() => window.__warehouseSession.state.project.panels);
  assert.deepEqual([p.leftOpen, p.rightOpen], [false, false]);
  assert.match(await page.locator('[data-testid=toggle-left]').textContent(), /펼치기/);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('좁은 화면(390px): 패널이 늘어도 가로 넘침이 없다', async () => {
  const { ctx, page } = await open({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);
  await ctx.close();
});
