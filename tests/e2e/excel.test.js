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

test('Excel 적용(Phase 5b): 배치안 미리보기 → 매핑 요약(값 제외) → 경고 확인·최종 확인 → AFTER만 변경·자동 백업 → 실행취소 복귀', async () => {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('request', (r) => !/^(file|data|blob):/.test(r.url()) && problems.push(`network: ${r.url()}`));
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); d.accept(); });
  await page.goto(fileUrl);
  await page.waitForFunction(() => window.__warehouseView);
  const before = await page.evaluate(() => JSON.stringify(window.__warehouseSession.state.project.scenarios.before));
  await page.locator('[data-testid=excel-open]').click();
  await page.locator('[data-testid=excel-file]').setInputFiles(path.join(root, 'fixtures/excel/synthetic-basic.xlsx'));
  await page.waitForFunction(() => /유효/.test(document.querySelector('[data-testid=excel-summary]').textContent));
  assert.match(await page.locator('[data-testid=excel-pstats]').textContent(), /치수 충돌을 먼저 해결/);
  assert.ok(await page.locator('[data-testid=excel-apply]').isDisabled());
  await page.locator('[data-testid=excel-dims] select').selectOption('1');
  await page.waitForFunction(() => /오류 행을 수정하거나/.test(document.querySelector('[data-testid=excel-pstats]').textContent));
  // 매핑 요약: 머리글·건수만, 품목명 등 데이터 값은 포함하지 않는다
  const summary = await page.evaluate(() => window.__excelDialog?.mappingSummary?.() ?? null);
  if (summary !== null) {
    assert.match(summary, /로케이션 ← B "로케이션"/);
    assert.doesNotMatch(summary, /가상 부품|P-001|7F-A-1-1-1/);
  }
  await page.locator('[data-testid=excel-config] [name=target]').selectOption('after');
  await page.locator('[data-testid=excel-config] [name=mode]').selectOption('new');
  await page.locator('[data-testid=excel-config] [name=building]').fill('SYN');
  await page.locator('[data-testid=excel-config] [name=source]').fill('가상 자료');
  await page.locator('[data-testid=excel-config] [name=source]').dispatchEvent('change');
  await page.locator('[data-testid=excel-config] [name=skip]').check();
  await page.waitForFunction(() => /적용 후/.test(document.querySelector('[data-testid=excel-pstats]').textContent));
  assert.ok((await page.locator('[data-testid=excel-preview] g[data-id]').count()) > 0);
  const label = await page.locator('[data-testid=excel-apply]').textContent();
  if (/경고 확인/.test(label)) {
    assert.ok(await page.locator('[data-testid=excel-apply]').isDisabled());
    await page.locator('[data-testid=excel-ack]').check();
  }
  await page.locator('[data-testid=excel-apply]').click();
  await page.waitForFunction(() => window.__warehouseSession.state.project.layoutBackups.length === 1 && window.__warehouseSession.state.status === 'saved');
  const p = await page.evaluate(() => { const p = window.__warehouseSession.state.project; return { racks: p.scenarios.after.objects.filter((o) => o.kind === 'rack').map((o) => o.excel?.key), before: JSON.stringify(p.scenarios.before), backup: p.layoutBackups[0].target, history: p.importHistory.length, scenario: p.settings.scenario }; });
  assert.ok(p.racks.includes('7F-A-1') && p.racks.includes('7F-B-10'));
  assert.equal(p.before, before, 'BEFORE는 변경되지 않는다');
  assert.equal(p.backup, 'after');
  assert.equal(p.history, 1);
  assert.equal(p.scenario, 'after');
  assert.ok(dialogs.some((m) => /AFTER · new · 신규/.test(m)));
  assert.equal(await page.locator('[data-testid=excel-dialog]').evaluate((d) => d.open).catch(() => false), false);
  await page.keyboard.press('Control+z');
  await page.waitForFunction(() => window.__warehouseSession.state.project.importHistory.length === 0);
  assert.deepEqual(problems, []);
  await ctx.close();
});
