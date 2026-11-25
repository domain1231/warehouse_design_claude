// C9(D-075): 비교 화면 면적 기준 안내와 '한쪽 Excel 총면적 적용' 버튼(잠금이면 비활성, 적용 후 Excel 기준, 실행 취소 가능).
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
const click = (page, id) => page.locator(`[data-testid=${id}]`).click();

test('면적 기준: 한쪽만 Excel 총면적이면 양쪽 도면 기준 + 적용 버튼(잠금 시 비활성), 적용하면 Excel 기준, Ctrl+Z 복원', async () => {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(fileUrl);
  await page.waitForFunction(() => window.__warehouseView && document.querySelector('[data-testid=plan] g[data-id]'));
  await click(page, 'scenario-clone');
  await page.locator('[data-testid=clone-choice]').selectOption('replace');
  await click(page, 'clone-apply');
  await page.waitForFunction(() => window.__warehouseSession.state.project.layoutBackups.length === 1);
  await page.locator('[data-testid=clone-dialog]').waitFor({ state: 'hidden' });
  // 가상 상황: AFTER에만 비교 총면적이 있다(시험용으로 상태에 직접 넣음).
  await page.evaluate(() => { window.__warehouseSession.state.project.scenarioMeta.after.referenceArea = 130.5; });

  await click(page, 'scenario-compare');
  const basis = page.locator('[data-testid=compare-basis]');
  assert.match(await basis.innerText(), /면적 기준: 도면 전체 \(BEFORE에 Excel 면적 없음\)/);
  const btn = page.locator('[data-testid=compare-basis-apply]');
  assert.equal((await btn.innerText()).trim(), 'AFTER 면적 130.5㎡ 적용');
  assert.equal(await page.evaluate(() => window.__warehouseSession.state.project.scenarioMeta.before.locked), true);
  assert.equal(await btn.isDisabled(), true, '새 도면은 BEFORE 잠금 → 비활성');
  assert.equal(await page.locator('tr[data-metric=M6] td:nth-child(3)').innerText(), '±0.0%p', '통로 비중은 neutral → 화살표 없음');

  await click(page, 'compare-close');
  await page.evaluate(() => { window.__warehouseSession.state.project.scenarioMeta.before.locked = false; });
  await click(page, 'scenario-compare');
  await btn.click();
  await page.waitForFunction(() => window.__warehouseSession.state.project.scenarioMeta.before.referenceArea === 130.5);
  assert.match(await basis.innerText(), /면적 기준: Excel 총면적 \(BEFORE 130\.5㎡ · AFTER 130\.5㎡\)/);
  assert.equal(await btn.count(), 0, '양쪽 모두 있으면 버튼 없음');
  assert.equal(await page.evaluate(() => window.__warehouseSession.state.project.scenarioMeta.before.sourceInfo), null, '출처 정보는 만들지 않음');

  await click(page, 'compare-close');
  await page.keyboard.press('Control+z');
  await page.waitForFunction(() => window.__warehouseSession.state.project.scenarioMeta.before.referenceArea === undefined);
  assert.deepEqual(problems, []);
  await ctx.close();
});
