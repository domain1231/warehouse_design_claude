// 실제 브라우저(file://, 오프라인) Phase 9b-4: 배치 위반 목록 대화상자·Ctrl+S.
// 실제 마우스·터치패드는 NOT RUN(Playwright 합성 이벤트).
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

async function open() {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1400, height: 1500 } });
  const page = await ctx.newPage();
  page.problems = [];
  page.on('pageerror', (e) => page.problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && page.problems.push(`console: ${m.text()}`));
  page.on('request', (r) => !/^(file|data|blob):/.test(r.url()) && page.problems.push(`network: ${r.url()}`));
  page.on('dialog', (d) => d.accept());
  await page.goto(fileUrl);
  await page.waitForFunction(() => window.__warehouseView && document.querySelector('[data-testid=plan] g[data-id]'));
  return { ctx, page };
}
const objs = async (page, k = 'after') => (await page.evaluate(() => window.__warehouseSession.state.project)).scenarios[k].objects;

test('위반 목록 대화상자: 열기·헤더·위반 행 클릭 선택·닫기', async () => {
  const { ctx, page } = await open();
  await page.click('#wViolations');
  assert.equal(await page.evaluate(() => document.querySelector('#wDialog').open), true);
  assert.equal(await page.textContent('#wDialog h2'), '배치 위반 목록 · 현재 계산');
  assert.deepEqual(await page.$$eval('#wMainList th', (t) => t.map((x) => x.textContent)), ['랙 / 선택', '위반 유형·방향·초과 거리', '충돌 대상', '상태']);
  await page.click('#wClose');
  const rack = (await objs(page)).find((o) => o.kind === 'rack');
  await page.evaluate((id) => window.__warehouseSession.edit('시험 위반', (p) => { const l = p.scenarios[p.settings.scenario]; l.objects.find((o) => o.id === id).x = l.warehouse.width + 3; }), rack.id);
  await page.click('#wViolations');
  const row = page.locator(`#wMainList tr[data-w-rack="${rack.id}"]`);
  assert.equal(await row.count(), 1);
  assert.match(await row.textContent(), /경계 초과/);
  assert.match(await row.locator('td').last().textContent(), /미해결/);
  await row.locator('td').nth(1).click();
  assert.equal(await page.evaluate(() => document.querySelector('#wDialog').open), false);
  assert.deepEqual(await page.evaluate(() => window.__warehouseView.selected), [rack.id]);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('Ctrl+S는 입력칸에서도 저장한다', async () => {
  const { ctx, page } = await open();
  await page.evaluate(() => window.__warehouseSession.edit('시험 변경', (p) => { p.name = '저장 시험'; }));
  await page.focus('#projectName');
  await page.keyboard.press('Control+s');
  await page.waitForFunction(() => window.__warehouseSession.state.status === 'saved');
  assert.match(await page.textContent('[data-testid=status]'), /SAVED|저장/);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});
