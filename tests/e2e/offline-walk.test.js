// F-038: 오프라인(file://)으로 연 빌드가 외부 요청 없이 주요 대화상자를 모두 열고 닫아도 런타임 오류가 없는지 확인한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '../..');
const meta = JSON.parse(fs.readFileSync(path.join(root, 'dist/build-metadata.json'), 'utf8'));
const fileUrl = pathToFileURL(path.join(root, 'dist', meta.file)).href;

test('오프라인: 모든 요청이 file/data/blob이고 주요 대화상자를 열어도 pageerror·console.error가 없다', async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.WAREHOUSE_BROWSER_PATH || undefined });
  try {
    const ctx = await browser.newContext({ offline: true, viewport: { width: 1400, height: 1000 } });
    const page = await ctx.newPage();
    const problems = [], requests = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
    page.on('request', (r) => { requests.push(r.url()); if (!/^(file|data|blob):/.test(r.url())) problems.push(`network: ${r.url()}`); });
    await page.goto(fileUrl);
    await page.waitForFunction(() => window.__warehouseView && document.querySelector('[data-testid=plan] g[data-id]'));
    const closeAll = () => page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
    const opened = [];
    for (const id of ['excel-open', 'scenario-compare', 'scenario-history', 'about-open', 'help-open', 'theme-open', 'aisle-validate', 'versions-open', 'storage-open']) {
      await page.locator(`[data-testid=${id}]`).click();
      if (id !== 'scenario-history') await page.waitForFunction(() => document.querySelector('dialog[open]'), null, { timeout: 3000 }); // 이력은 대화상자가 아닌 접이식 영역
      opened.push(id);
      await page.waitForTimeout(150);
      await closeAll();
    }
    assert.equal(opened.length, 9);
    assert.ok(requests.length >= 1 && requests.every((u) => /^(file|data|blob):/.test(u)));
    assert.deepEqual(problems, []);
  } finally {
    await browser.close();
  }
});
