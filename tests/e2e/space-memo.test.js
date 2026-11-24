// 공간 지표 기억: 선택만 바뀐 렌더는 다시 계산하지 않고, 편집·실행취소·재실행은 새 값을 보여준다.
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

test('선택 변경은 공간 지표를 재계산하지 않고, apply·undo·redo는 KPI를 갱신한다', async () => {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  await page.goto(fileUrl);
  await page.waitForFunction(() => window.__warehouseView);
  const racks = () => page.$eval('#topStats .stat:nth-child(2) strong', (n) => n.textContent);
  const used = () => page.evaluate(() => [...document.querySelectorAll('#spaceMetrics .metricline')].find((r) => r.children[0].textContent === '랙 면적 합계').children[1].textContent);
  const computed = () => page.evaluate(() => window.__spaceMemoStats.computed);
  const r0 = await racks(), a0 = await used();
  const c0 = await computed();
  assert.ok(c0 > 0);
  // (b) 선택만 바꾸기: 재계산 없음
  const ids = await page.evaluate(() => window.__warehouseSession.state.project.scenarios[window.__warehouseSession.state.project.settings.scenario].objects.filter((o) => o.kind === 'rack').map((o) => o.id));
  for (const id of ids.slice(0, 3)) {
    await page.evaluate((i) => window.__warehouseSession.setView({ selection: [i] }, { delay: 0 }), id);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  }
  assert.equal(await computed(), c0, '선택 변경은 재계산하지 않는다');
  // (a) 편집: 랙 하나 삭제(복사본) → 값 변경, 재계산 발생
  await page.evaluate((id) => window.__warehouseSession.apply('랙 삭제', (P) => {
    const N = structuredClone(P);
    const l = N.scenarios[N.settings.scenario];
    l.objects = l.objects.filter((o) => o.id !== id);
    return { ok: true, project: N };
  }), ids[0]);
  await page.waitForFunction((n) => document.querySelector('#topStats .stat:nth-child(2) strong').textContent !== n, r0);
  assert.ok(await computed() > c0);
  assert.equal(Number(await racks()), Number(r0) - 1);
  assert.notEqual(await used(), a0);
  await page.evaluate(() => window.__warehouseSession.undo());
  await page.waitForFunction((n) => document.querySelector('#topStats .stat:nth-child(2) strong').textContent === n, r0);
  assert.equal(await used(), a0);
  await page.evaluate(() => window.__warehouseSession.redo());
  await page.waitForFunction((n) => document.querySelector('#topStats .stat:nth-child(2) strong').textContent !== n, r0);
  assert.equal(Number(await racks()), Number(r0) - 1);
  assert.deepEqual(problems, []);
  await ctx.close();
});
