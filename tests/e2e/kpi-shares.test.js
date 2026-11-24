// D-058: 상단 지표 — 통로 비중·보관 불가 구역 비중 추가, '수량 기준 적재율 · 단위별' 제외. 값은 오른쪽 공간 지표 면적 ÷ 전체 면적.
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

test('상단 지표(D-058·D-059): 통로 비중·보관 불가 구역 비중 = 공간 지표 면적 ÷ 전체 면적, 적재율 칸 없음', async () => {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  await page.goto(fileUrl);
  await page.waitForFunction(() => window.__warehouseView);
  const labels = await page.$$eval('#topStats .stat small', (n) => n.map((e) => e.textContent));
  assert.deepEqual(labels, ['전체 창고 면적', '현재 랙 수', '랙 면적 점유율', '통로 비중', '보관 불가 구역 비중', '보관 가능 잔여 비중', '최소 통로 폭', '공간 경고']);
  assert.equal(await page.locator('[data-testid=k-load]').count(), 0);
  const v = await page.evaluate(() => {
    const t = (id) => document.getElementById(id).textContent;
    const rows = Object.fromEntries([...document.querySelectorAll('#spaceMetrics .metric-row, #spaceMetrics div')].map((r) => [r.children[0]?.textContent, r.children[1]?.textContent]).filter(([k]) => k));
    return { area: Number(t('kArea')), aisle: t('kAisleShare'), aisleArea: t('kAisleArea'), blocked: t('kBlockedShare'), blockedArea: t('kBlockedArea'), rows };
  });
  const num = (s) => Number(String(s).replace(/[^0-9.]/g, ''));
  assert.equal(v.aisleArea, v.rows['통로 / 작업 구역'], '통로 면적은 오른쪽 공간 지표와 같다');
  assert.equal(v.blockedArea, v.rows['보관 불가 / 문 안전 구역']);
  assert.equal(v.aisle, ((num(v.aisleArea) / v.area) * 100).toFixed(1));
  assert.equal(v.blocked, ((num(v.blockedArea) / v.area) * 100).toFixed(1));
  const cols = await page.$eval('#topStats', (n) => getComputedStyle(n).gridTemplateColumns.split(' ').length);
  assert.equal(cols, 8); // D-059: 8칸
  assert.deepEqual(problems, []);
  await ctx.close();
});
