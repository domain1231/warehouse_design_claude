// E8(D-095) 실제 브라우저(file://, 오프라인): 저장소 관리 → 공유용 JSON(이력 제외) → 다시 불러오기 → 현재 배치 동일.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { historyProject } from '../unit/size-fixture.js';
import { projectJsonText } from '../../src/persistence/project-file.js';

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

const state = (page) => page.evaluate(() => { const p = window.__warehouseSession.state.project; return { ls: p.layoutSnapshots.length, backups: p.layoutBackups.length, hist: p.autoPlacement.history.length, racks: p.scenarios.before.objects.length }; });
async function importFile(page, name, buffer) {
  await page.evaluate(() => { document.querySelector('[data-testid=toast]').textContent = ''; });
  await page.locator('[data-testid=import-file]').setInputFiles({ name, mimeType: 'application/json', buffer });
  await page.waitForFunction((n) => document.querySelector('[data-testid=toast]').textContent.includes(n + ' 복원 완료') && window.__warehouseSession.state.status === 'saved', name, { timeout: 60000 });
}

test('E8: 공유용 JSON 내려받기 → 다시 불러오기 → 이력 없이 정상, 현재 배치 동일(비교 결론 동일은 단위 검사)', { timeout: 120000 }, async () => {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
  page.on('dialog', (d) => d.accept());
  await page.goto(fileUrl);
  await page.waitForFunction(() => window.__warehouseView && document.querySelector('[data-testid=plan] g[data-id]'));
  await page.evaluate(() => window.__warehouseSession.save());
  const { p } = historyProject({ racks: 30, imports: 5 });
  await importFile(page, 'h5.json', Buffer.from(projectJsonText(p)));
  assert.deepEqual(await state(page), { ls: 5, backups: 5, hist: 5, racks: 30 });
  await page.locator('[data-testid=storage-open]').click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('[data-testid=share-json]').click()]);
  assert.match(dl.suggestedFilename(), /^warehouse_share_v2_3_6_\d{4}-\d{2}-\d{2}\.json$/);
  assert.match(await page.locator('[data-testid=toast]').textContent(), /^공유용 JSON 저장 · [\d.]+MB\(탐색기 [\d,]+KB\) · 이력 \d+건 제외/);
  const shared = fs.readFileSync(await dl.path());
  await page.locator('[data-testid=storage-close]').click();
  const before = await page.evaluate(() => JSON.stringify(window.__warehouseSession.state.project.scenarios));
  await importFile(page, 'share.json', shared);
  assert.deepEqual(await state(page), { ls: 1, backups: 0, hist: 0, racks: 30 });
  assert.equal(await page.evaluate(() => JSON.stringify(window.__warehouseSession.state.project.scenarios)), before, '현재 배치 동일');
  assert.ok(shared.length < Buffer.byteLength(projectJsonText(p)));
  assert.deepEqual(problems, []);
  await ctx.close();
});
