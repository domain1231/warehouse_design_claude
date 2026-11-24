// C5: 통로 기준 검증 — KPI 경고 표시, 설정 경고, 기준 미달.
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

const repaint = async (page) => {
  const cur = await page.evaluate(() => window.__warehouseSession.state.project.settings.scenario);
  await page.locator(`[data-testid=scenario-${cur === 'after' ? 'before' : 'after'}]`).click();
  await page.locator(`[data-testid=scenario-${cur}]`).click();
};
const kpi = (page) => page.evaluate(() => { const s = document.getElementById('kMinAisle').closest('.stat'); return { warn: s.classList.contains('warn'), sub: document.getElementById('kMinAisleSub').textContent, list: document.getElementById('warnings').textContent }; });

const MAIN = '메인 이동 통로';

test('통로 종류 기준 0.5m → 설정 경고(하한 1.0m), 되돌리면 처음 표시로 돌아간다', async () => {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(fileUrl);
  await page.waitForFunction(() => window.__warehouseView);
  const clean = await kpi(page);
  const saved = await page.evaluate((T) => { const P = window.__warehouseSession.state.project; return { rule: P.aisleRules[T], aisles: P.scenarios[P.settings.scenario].objects.filter((o) => o.kind === 'aisle' && o.aisleType === T).map((o) => [o.id, o.minWidth, o.targetWidth]) }; }, MAIN);
  await page.evaluate((T) => window.__warehouseSession.apply('통로 기준', (P) => {
    P.aisleRules[T] = { minWidth: 0.5, targetWidth: 0.5, enabled: true };
    for (const o of P.scenarios[P.settings.scenario].objects) if (o.kind === 'aisle' && o.aisleType === T) { o.minWidth = 0.5; o.targetWidth = 0.5; }
    return { ok: true, project: P };
  }), MAIN);
  await repaint(page);
  const r = await kpi(page);
  assert.ok(r.warn);
  assert.match(r.list, /하한 1\.0m/);
  await page.evaluate(({ T, saved }) => window.__warehouseSession.apply('통로 기준 복원', (P) => {
    P.aisleRules[T] = saved.rule;
    for (const [id, mn, tg] of saved.aisles) Object.assign(P.scenarios[P.settings.scenario].objects.find((x) => x.id === id), { minWidth: mn, targetWidth: tg });
    return { ok: true, project: P };
  }), { T: MAIN, saved });
  await repaint(page);
  assert.deepEqual(await kpi(page), clean);
  assert.deepEqual(problems, []);
  await ctx.close();
});

test('왼쪽 통로 종류 기준을 직접 고치면 KPI 기준이 바뀌고 취소(실행취소)로 복원된다', async () => {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(fileUrl);
  await page.waitForFunction(() => window.__warehouseView);
  const rule = () => page.evaluate((T) => window.__warehouseSession.state.project.aisleRules[T].minWidth, MAIN);
  const before = await rule();
  await page.check('#mAllowWarnings'); // 기준을 올리면 샘플의 기존 폭 부족이 커져 '새 위반'으로 취소되므로 경고 후 허용
  await page.selectOption('#mAisleType', MAIN);
  await page.locator('#mRuleMin').fill('1.6');
  await page.locator('#mRuleMin').dispatchEvent('change');
  await page.locator('#mRuleTarget').fill('1.8');
  await page.locator('#mRuleTarget').dispatchEvent('change');
  await page.locator('#mApplyAisleRule').click();
  await page.waitForFunction((T) => window.__warehouseSession.state.project.aisleRules[T].minWidth === 1.6, MAIN);
  await repaint(page);
  const r = await kpi(page);
  assert.ok(r.warn);
  assert.match(r.sub, /기준 1\.6m/);
  await page.locator('#undo').click();
  await page.waitForFunction(([T, v]) => window.__warehouseSession.state.project.aisleRules[T].minWidth === v, [MAIN, before]);
  assert.deepEqual(problems, []);
  await ctx.close();
});
