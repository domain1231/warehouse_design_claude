// 실제 브라우저(file://, 오프라인) Phase 5a: Excel 파일 선택 → 시트·머리글·자동 매핑·분석·규격 충돌 선택. 가상 자료만 사용.
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

test('Excel 분석: 가상 XLSX를 읽어 머리글 8행 탐지, 20개 중 매핑 수, 오류·경고, 규격 충돌 선택 후 재분석, 외부 요청 없음', async () => {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('request', (r) => !/^(file|data|blob):/.test(r.url()) && problems.push(`network: ${r.url()}`));
  await page.goto(fileUrl);
  await page.waitForFunction(() => window.__warehouseView);
  await page.locator('[data-testid=excel-open]').click();
  await page.locator('[data-testid=excel-file]').setInputFiles(path.join(root, 'fixtures/excel/synthetic-basic.xlsx'));
  await page.waitForFunction(() => /유효/.test(document.querySelector('[data-testid=excel-summary]').textContent));
  assert.equal(await page.locator('[data-testid=excel-header]').inputValue(), '8');
  assert.deepEqual(await page.locator('[data-testid=excel-sheet] option').allTextContents(), ['자재 목록', '참고']);
  const summary = await page.locator('[data-testid=excel-summary]').textContent();
  assert.match(summary, /20개 필드 중 20개 매핑/);
  assert.match(summary, /원본 총면적 336㎡/);
  const issues = await page.locator('[data-testid=excel-issues]').textContent();
  assert.match(issues, /중복 로케이션: 7F-B-10-3-1/);
  assert.match(issues, /7F-A-2 규격 불일치/);
  await page.locator('[data-testid=excel-dims] select').selectOption('1');
  await page.waitForFunction(() => !/7F-A-2 규격 불일치/.test(document.querySelector('[data-testid=excel-issues]').textContent));
  await page.locator('[data-testid=excel-file]').setInputFiles({ name: 'bad.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('not a zip') });
  await page.waitForFunction(() => /읽기 실패/.test(document.querySelector('[data-testid=excel-summary]').textContent));
  assert.deepEqual(problems, []);
  await ctx.close();
});
