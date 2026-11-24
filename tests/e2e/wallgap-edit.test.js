// C6: 샘플(Excel 불러오기 없음)에서도 벽 최소 이격을 수정하면 즉시 재검사. 가상 자료만 사용.
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

test('벽 이격 편집: 샘플에서 활성 → 즉시 경고 증가 → 잘못된 값 거부 → 실행취소', async () => {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  await page.goto(fileUrl);
  await page.waitForFunction(() => window.__warehouseView);
  await page.locator('[data-testid=scenario-after]').click();
  const wall = page.locator('[data-testid=rule-wallGap]');
  const count = async () => Number((await page.locator('[data-testid=warning-count]').textContent()).replace(/\D/g, ''));
  const st = () => page.evaluate(() => { const p = window.__warehouseSession.state.project, l = p.scenarios[p.settings.scenario]; return { wallGap: l.wallGap, rules: l.autoPlacementRules, before: JSON.stringify(p.scenarios.before) }; });
  assert.equal(await wall.isDisabled(), false);
  const expected = await page.evaluate(() => { const p = window.__warehouseSession.state.project; return String(p.scenarios[p.settings.scenario].wallGap ?? p.locationLayout?.wallGap ?? 0); });
  assert.equal(await wall.inputValue(), expected);
  const s0 = await st(), n0 = await count();

  await wall.fill('1.5');
  await wall.dispatchEvent('change');
  await page.waitForFunction((n) => Number(document.querySelector('[data-testid=warning-count]').textContent.replace(/\D/g, '')) > n, n0);
  const s1 = await st();
  assert.equal(s1.wallGap, 1.5);
  assert.equal(s1.rules, undefined, '기준 기록은 만들지 않는다');
  assert.equal(s1.before, s0.before, 'BEFORE 불변');
  assert.match(await page.locator('[data-testid=warnings]').textContent(), /벽|이격/);
  const n1 = await count();

  await wall.fill('0.1234');
  await wall.dispatchEvent('change');
  await page.waitForTimeout(150);
  assert.equal((await st()).wallGap, 1.5, '0.001m 단위가 아니면 거부');
  assert.equal(Number(await wall.inputValue()), 1.5, '거부되면 입력란 복귀');

  await page.locator('#undo').click();
  await page.waitForFunction((n) => Number(document.querySelector('[data-testid=warning-count]').textContent.replace(/\D/g, '')) < n, n1);
  assert.equal((await st()).wallGap, s0.wallGap);
  assert.equal(await count(), n0);
  assert.equal(await wall.inputValue(), expected);
  assert.deepEqual(problems, []);
  await ctx.close();
});
