// D-056: 하단 패널을 열어도 도면 칸은 닫았을 때의 최소 높이를 지킨다(기준본은 약 268px까지 줄었다).
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

test('하단 패널 열림: 도면 칸 최소 높이 유지, 하단 패널은 도면 아래(높이 그대로), 닫으면 원래 높이', async () => {
  for (const [w, h] of [[1920, 1080], [1920, 890], [1600, 1000]]) {
    const ctx = await browser.newContext({ offline: true, viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    const problems = [];
    page.on('pageerror', (e) => problems.push(e.message));
    await page.goto(fileUrl);
    await page.waitForFunction(() => window.__warehouseView);
    const m = () => page.evaluate(() => {
      const c = document.getElementById('canvasWrap').getBoundingClientRect(), b = document.getElementById('sBottom').getBoundingClientRect();
      return { canvas: Math.round(c.height), bottom: Math.round(b.height), below: b.top >= c.bottom - 1 };
    });
    await page.waitForTimeout(400); // 첫 그리기 직후 높이 계산(requestAnimationFrame)이 자리 잡을 때까지
    const closed = await m();
    await page.locator('[data-testid=bottom-toggle]').click();
    await page.waitForFunction(() => window.__warehouseSession.state.project.panels.bottomOpen === true);
    await page.waitForTimeout(200);
    const open = await m();
    assert.ok(open.canvas >= 660, `${w}×${h} 하단 열림 도면 ${open.canvas}px`);
    assert.ok(open.bottom >= 400, `${w}×${h} 하단 패널 높이 ${open.bottom}px`);
    assert.ok(open.below, '하단 패널은 도면 아래');
    await page.locator('[data-testid=bottom-toggle]').click();
    await page.waitForFunction((c) => !window.__warehouseSession.state.project.panels.bottomOpen && Math.round(document.getElementById('canvasWrap').getBoundingClientRect().height) === c, closed.canvas, { timeout: 3000 }).catch(() => {});
    const again = await m();
    assert.equal(again.canvas, closed.canvas, `닫으면 원래 높이 ${JSON.stringify({ closed, open, again, sy: await page.evaluate(() => scrollY) })}`);
    assert.deepEqual(problems, []);
    await ctx.close();
  }
});
