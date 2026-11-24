// D-059·D-061: 오른쪽 공간 지표(모듈 src/metrics/space.js) — 평균 용적률(Excel F4 방식, 선반 가중 보조), 80% 미만, 빈·저활용, 유휴, 공간 구성, BEFORE→AFTER 증감.
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

const rows = (page) => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#spaceMetrics .metricline')].map((r) => [r.children[0].textContent, r.children[1].textContent])));
const repaint = async (page) => {
  const cur = await page.evaluate(() => window.__warehouseSession.state.project.settings.scenario);
  await page.locator(`[data-testid=scenario-${cur === 'after' ? 'before' : 'after'}]`).click();
  await page.locator(`[data-testid=scenario-${cur}]`).click();
};

test('오른쪽 공간 지표: 줄 구성, 평균 용적률 = 가상 Excel 높이로 계산한 F4, BEFORE→AFTER 증감이 편집에 따라 바뀐다', async () => {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(fileUrl);
  await page.waitForFunction(() => window.__warehouseView);
  let r = await rows(page);
  for (const k of ['평균 용적률', '80% 미만 로케이션', '빈 랙 · 저활용 랙', '유휴 공간 랙', '공간 구성', '통로 : 랙 면적비', '최소 통로 폭', 'BEFORE→AFTER 증감']) assert.ok(k in r, k);

  // 가상 Excel 높이: 랙 2개에 로케이션을 붙인다(R = 0.5, 0.9 → F4 70.0%, 80% 미만 2/4, 저활용 0)
  await page.locator('[data-testid=scenario-after]').click();
  await page.waitForFunction(() => window.__warehouseSession.state.project.settings.scenario === 'after');
  await page.evaluate(() => window.__warehouseSession.apply('가상 높이', (P) => {
    const racks = P.scenarios.after.objects.filter((o) => o.kind === 'rack');
    const mk = (o, key, ps) => { o.excel = { key, floor: '7F', column: 'Z', rackNumber: 1, building: '가상', shelves: [{ level: 1, key: key + '-1', items: ps.map((p, i) => ({ location: `${key}-1-${i + 1}`, shelfHeight: 1000, materialHeight: p, rackHeight: 2000 })) }] }; };
    mk(racks[0], '7F-Z-1', [400, 600]);
    mk(racks[1], '7F-Z-2', [800, 1000]);
    return { ok: true, project: P };
  }));
  await repaint(page);
  await page.waitForFunction(() => /70\.0%/.test(document.getElementById('spaceMetrics').textContent));
  r = await rows(page);
  assert.match(r['평균 용적률'], /^70\.0% 2\/\d+랙/);
  assert.match(r['80% 미만 로케이션'], /^2 \/ 4/);
  assert.match(r['유휴 공간 랙'], /천장 높이 미입력|^\d+/);

  // AFTER 랙 하나 삭제 → 증감 랙 수가 바뀐다
  const n = await page.evaluate(() => { const P = window.__warehouseSession.state.project; return { b: P.scenarios.before.objects.filter((o) => o.kind === 'rack').length, a: P.scenarios.after.objects.filter((o) => o.kind === 'rack').length }; });
  if (n.a > 0 && n.b > 0) {
    await page.evaluate(() => window.__warehouseSession.apply('가상 삭제', (P) => { const i = P.scenarios.after.objects.findLastIndex((o) => o.kind === 'rack'); P.scenarios.after.objects.splice(i, 1); return { ok: true, project: P }; }));
    await repaint(page);
    const want = n.a - 1 - n.b;
    await page.waitForFunction((w) => new RegExp('^랙 ' + w).test([...document.querySelectorAll('#spaceMetrics .metricline')].find((x) => x.children[0].textContent === 'BEFORE→AFTER 증감').children[1].textContent), (want > 0 ? '\\+' : want < 0 ? '−' : '±') + Math.abs(want));
  }
  assert.deepEqual(problems, []);
  await ctx.close();
});
