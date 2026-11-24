// C7: Excel 가져오기 미리보기의 Summary 대조 상자(가상 자료 synthetic-summary.xlsx만 사용).
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

test('Summary 대조: 다른 값은 경고·원인·CSV, 머리글 없는 시트는 상자 없음, 적용하면 sourceInfo.excelSummary 보관', async () => {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(fileUrl);
  await page.waitForFunction(() => window.__warehouseView);
  await page.locator('[data-testid=excel-open]').click();
  const box = page.locator('[data-testid=excel-summary-compare]');
  await page.locator('[data-testid=excel-file]').setInputFiles(path.join(root, 'fixtures/excel/synthetic-basic.xlsx'));
  await page.waitForFunction(() => /유효/.test(document.querySelector('[data-testid=excel-summary]').textContent));
  assert.equal(await box.isVisible(), false, '머리글이 없으면 상자를 그리지 않는다');
  await page.locator('[data-testid=excel-file]').setInputFiles(path.join(root, 'fixtures/excel/synthetic-summary.xlsx'));
  await page.waitForFunction(() => /가상호BE|유효/.test(document.querySelector('[data-testid=excel-summary]').textContent) && document.querySelector('[data-testid=excel-summary-compare]').textContent.includes('Excel Summary'));
  assert.ok(await box.isVisible());
  assert.match(await box.textContent(), /⚠ Excel Summary와 앱 계산이 \d개 지표에서 다릅니다/);
  const verdict = async (id) => (await box.locator(`tr[data-id=${id}] td`).last().textContent()).trim();
  assert.equal(await verdict('F4'), '⚠ 다름');
  assert.equal(await verdict('G4'), '⚠ 다름');
  assert.equal(await verdict('D4'), '✓');
  assert.equal(await verdict('E4'), '✓');
  assert.equal(await verdict('C'), '✓');
  assert.match(await box.locator('tr[data-id=C] td').first().textContent(), /80% 미만 로케이션 \(Summary 시트\)/);
  const causes = await page.locator('[data-testid=excel-summary-causes]').textContent();
  for (const t of ['형식 밖', '자재높이', '직접 입력값', '이 아닌']) assert.ok(causes.includes(t), t);
  assert.match(await box.textContent(), /적용하면 화면 지표는 앱 계산값을 씁니다/);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('[data-testid=excel-summary-csv]').click()]);
  assert.equal(dl.suggestedFilename(), 'excel_summary_diff.csv');
  // 적용
  const cfg = (n) => page.locator(`[data-testid=excel-config] [name=${n}]`);
  await cfg('target').selectOption('after');
  await cfg('mode').selectOption('new');
  await cfg('building').fill('SYN');
  await cfg('source').fill('가상 자료');
  await cfg('source').dispatchEvent('change');
  await cfg('skip').check();
  await page.waitForFunction(() => /적용 후/.test(document.querySelector('[data-testid=excel-pstats]').textContent));
  await page.locator('#rTargetConfirm').check();
  if (/경고 확인/.test(await page.locator('[data-testid=excel-apply]').textContent())) {
    await page.locator('#exAllowWarnings').check();
    await page.locator('[data-testid=excel-ack]').check();
  }
  await page.locator('[data-testid=excel-apply]').click();
  await page.waitForFunction(() => window.__warehouseSession.state.project.importHistory.length === 1 && window.__warehouseSession.state.status === 'saved');
  const s = await page.evaluate(() => window.__warehouseSession.state.project.scenarioMeta.after.sourceInfo.excelSummary);
  assert.deepEqual({ ...s }, { totalArea: 40, areaUse: 0.15, aisleShare: 0.85, avgVolume: 0.5, rackCount: 3, idleRacks: 0, lowLocations: 6 });
  assert.deepEqual(problems, []);
  await ctx.close();
});
