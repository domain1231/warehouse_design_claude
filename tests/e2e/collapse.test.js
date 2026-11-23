// D-055: 상단 지표 영역·오른쪽 공간 지표 접기. 접은 상태 저장·새로고침 유지, 한 줄 요약에 경고 수 유지.
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

const visible = (page, sel) => page.locator(sel).isVisible();
const workTop = (page) => page.evaluate(() => Math.round(document.getElementById('sWork').getBoundingClientRect().top));

test('지표 접기: 상단 지표 영역 접기·요약 표시·도면 위로 이동 → 공간 지표 접기 → 새로고침 후 유지 → 다시 펼치기', async () => {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  await page.goto(fileUrl);
  await page.waitForFunction(() => window.__warehouseView);

  const top = page.locator('[data-testid=top-toggle]'), met = page.locator('[data-testid=metrics-toggle]');
  assert.equal(await top.textContent(), '지표 접기');
  assert.equal(await visible(page, '#topStats'), true);
  assert.equal(await visible(page, '#wTop'), true);
  assert.equal(await visible(page, '[data-testid=top-summary]'), false);
  assert.equal(await visible(page, '#spaceMetrics'), true);
  const y0 = await workTop(page);
  const kRacks = await page.textContent('#kRacks'), kWarn = await page.textContent('#kWarnings');

  await top.click();
  await page.waitForFunction(() => document.body.classList.contains('top-collapsed'));
  assert.equal(await top.textContent(), '지표 펼치기');
  assert.equal(await top.getAttribute('aria-expanded'), 'false');
  for (const sel of ['#topStats', '#wTop', '#sampleBanner']) assert.equal(await visible(page, sel), false, sel);
  const summary = await page.textContent('[data-testid=top-summary]');
  assert.ok(summary.includes(`${kRacks}랙`) && summary.includes(`공간 경고 ${kWarn}건`), summary);
  assert.equal(await visible(page, '[data-testid=status-detail]'), true, '저장 상태 줄은 그대로');
  const y1 = await workTop(page);
  assert.ok(y1 < y0 - 100, `작업 영역이 위로 올라온다 ${y0} → ${y1}`);

  await met.click();
  await page.waitForFunction(() => document.getElementById('spaceMetrics').hidden);
  assert.equal(await met.getAttribute('aria-expanded'), 'false');
  assert.equal(await visible(page, '#inspector'), true, '선택 객체 정보는 그대로');

  await page.waitForFunction(() => window.__warehouseSession.state.status === 'saved');
  const saved = await page.evaluate(() => ({ ...window.__warehouseSession.state.project.panels }));
  assert.equal(saved.topCollapsed, true);
  assert.equal(saved.metricsCollapsed, true);
  await page.reload();
  await page.waitForFunction(() => window.__warehouseView);
  assert.equal(await page.evaluate(() => document.body.classList.contains('top-collapsed')), true, '새로고침 후에도 접힘');
  assert.equal(await page.evaluate(() => document.getElementById('spaceMetrics').hidden), true);

  await page.locator('[data-testid=top-toggle]').click();
  await page.locator('[data-testid=metrics-toggle]').click();
  await page.waitForFunction(() => !document.body.classList.contains('top-collapsed') && !document.getElementById('spaceMetrics').hidden);
  assert.equal(await visible(page, '#topStats'), true);
  assert.equal(await workTop(page), y0, '펼치면 원래 위치');
  assert.deepEqual(problems, []);
  await ctx.close();
});
