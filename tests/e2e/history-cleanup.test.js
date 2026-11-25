// E4(D-091) 실제 브라우저(file://, 오프라인): 저장소 관리 → 이력 정리 미리보기 → 실행 → 실행 취소.
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

const counts = (page) => page.evaluate(() => { const p = window.__warehouseSession.state.project; return { ls: p.layoutSnapshots.length, es: p.excelSnapshots.length, ah: p.autoPlacement.history.length, racks: p.scenarios.before.objects.length }; });

test('E4: 이력 정리 미리보기·실행(보존 10) → 정리 전 백업 → 실행 취소로 복구', { timeout: 120000 }, async () => {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1400, height: 1000 } });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
  page.on('dialog', (d) => d.accept());
  await page.goto(fileUrl);
  await page.waitForFunction(() => window.__warehouseView && document.querySelector('[data-testid=plan] g[data-id]'));
  await page.evaluate(() => window.__warehouseSession.save());
  const { p } = historyProject({ racks: 30, imports: 14 });
  await page.locator('[data-testid=import-file]').setInputFiles({ name: 'h14.json', mimeType: 'application/json', buffer: Buffer.from(projectJsonText(p)) });
  await page.waitForFunction(() => /h14\.json 복원 완료/.test(document.querySelector('[data-testid=toast]').textContent) && window.__warehouseSession.state.status === 'saved', null, { timeout: 60000 });
  assert.deepEqual(await counts(page), { ls: 14, es: 14, ah: 14, racks: 30 });

  await page.locator('[data-testid=storage-open]').click();
  assert.equal(await page.locator('[data-testid=cleanup-keep]').inputValue(), '10');
  assert.ok(await page.locator('[data-testid=cleanup-run]').isDisabled());
  assert.match(await page.locator('[data-testid=cleanup-table]').innerText(), /배치 스냅샷\s+14/);
  await page.locator('[data-testid=cleanup-preview]').click();
  const table = await page.locator('[data-testid=cleanup-table]').innerText();
  assert.match(table, /정리 후 개수/);
  assert.match(table, /배치 스냅샷\s+14\s+[\d.]+MB\(탐색기 [\d,]+KB\)\s+10\s/);
  assert.deepEqual(await counts(page), { ls: 14, es: 14, ah: 14, racks: 30 }, '미리보기는 바꾸지 않음');
  await page.locator('[data-testid=cleanup-run]').click();
  await page.waitForFunction(() => /^이력 정리 완료/.test(document.querySelector('[data-testid=toast]').textContent));
  assert.match(await page.locator('[data-testid=toast]').textContent(), /배치 스냅샷 4·Excel 스냅샷 4·.*자동 배치 이력 4·명령 이력 0개 삭제 · 저장 크기 .* → .*실행 취소/);
  assert.deepEqual(await counts(page), { ls: 10, es: 10, ah: 10, racks: 30 });
  await page.waitForFunction(() => window.__warehouseSession.state.status === 'saved');
  await page.locator('[data-testid=storage-close]').click();

  await page.locator('[data-testid=versions-open]').click();
  await page.locator('[data-testid=backup-row]', { hasText: '이력 정리 전' }).waitFor();
  await page.locator('[data-testid=backup-close]').click();

  await page.locator('[data-testid=undo]').click();
  await page.waitForFunction(() => window.__warehouseSession.state.project.layoutSnapshots.length === 14);
  assert.deepEqual(await counts(page), { ls: 14, es: 14, ah: 14, racks: 30 }, '실행 취소로 복구');
  assert.deepEqual(problems, []);
  await ctx.close();
});
