// 방향키 화면 이동(D-071): 선택 없음 → 팬(대각선·Shift), 입력칸에서는 무시, 선택 있음 → 기존 미세 이동 + 대각선 1명령.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { waitPlanStable } from './helpers.js';

const root = path.resolve(import.meta.dirname, '../..');
const meta = JSON.parse(fs.readFileSync(path.join(root, 'dist/build-metadata.json'), 'utf8'));
const fileUrl = pathToFileURL(path.join(root, 'dist', meta.file)).href;

let browser;
before(async () => { browser = await chromium.launch({ headless: true, executablePath: process.env.WAREHOUSE_BROWSER_PATH || undefined }); });
after(async () => { await browser?.close(); });

async function open() {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1400, height: 1500 } });
  const page = await ctx.newPage();
  page.problems = [];
  page.on('pageerror', (e) => page.problems.push(`pageerror: ${e.message}`));
  await page.goto(fileUrl);
  await page.waitForFunction(() => window.__warehouseView && document.querySelector('[data-testid=plan] g[data-id]'));
  await waitPlanStable(page);
  return { ctx, page };
}
const scen = (page) => page.evaluate(() => JSON.stringify(window.__warehouseSession.state.project.scenarios));
/** 보이는 viewBox 원점으로 실제 화면 이동을 잰다(저장 지연과 무관). */
const box = (page) => page.evaluate(() => { const b = document.querySelector('[data-testid=plan]').viewBox.baseVal; return { x: b.x, y: b.y }; });
const hold = async (page, keys, ms) => {
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  for (const k of keys.slice().reverse()) await page.keyboard.up(k);
};
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≠ ${b}`);
const unlock = async (page) => { await page.locator('[data-testid=center-lock]').uncheck(); await page.evaluate(() => document.activeElement.blur()); };

test('선택 없음: ArrowRight 유지 → 화면만 이동, 데이터 불변, 저장 뷰 반영', async () => {
  const { ctx, page } = await open();
  await unlock(page);
  const s0 = await scen(page), b0 = await box(page);
  await hold(page, ['ArrowRight'], 300);
  const b1 = await box(page);
  assert.ok(b1.x > b0.x, `${b0.x} → ${b1.x}`);
  assert.equal(b1.y, b0.y);
  assert.equal(await scen(page), s0);
  await page.waitForFunction((x) => window.__warehouseSession.state.project.viewport.panX > x, 0);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('대각선·Shift 가속', async () => {
  const { ctx, page } = await open();
  await unlock(page);
  let b0 = await box(page);
  await hold(page, ['ArrowUp', 'ArrowRight'], 300);
  let b1 = await box(page);
  assert.ok(b1.x > b0.x && b1.y < b0.y, 'diag');
  b0 = await box(page);
  await hold(page, ['ArrowLeft'], 400);
  const slow = b0.x - (await box(page)).x;
  b0 = await box(page);
  await page.keyboard.down('Shift');
  await hold(page, ['ArrowRight'], 400);
  await page.keyboard.up('Shift');
  const fast = (await box(page)).x - b0.x;
  assert.ok(slow > 0 && fast > slow * 1.5, `slow ${slow} fast ${fast}`);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('입력칸에서는 팬하지 않는다', async () => {
  const { ctx, page } = await open();
  await unlock(page);
  await page.locator('#projectName').focus();
  const b0 = await box(page);
  await hold(page, ['ArrowRight'], 300);
  assert.deepEqual(await box(page), b0);
  await ctx.close();
});

test('선택 있음: 기존 미세 이동 + 대각선은 한 명령, Ctrl+Z 복원', async () => {
  const { ctx, page } = await open();
  await page.locator('[data-testid=allow-warnings]').check();
  const objs = () => page.evaluate(() => window.__warehouseSession.state.project.scenarios.after.objects);
  const rack = (await objs()).filter((o) => o.kind === 'rack')[20];
  const c = await page.evaluate(([x, y]) => {
    const svg = document.querySelector('[data-testid=plan]'), pt = svg.createSVGPoint();
    pt.x = x; pt.y = y;
    const s = pt.matrixTransform(svg.getScreenCTM());
    return { x: s.x, y: s.y };
  }, [rack.x + rack.width / 2, rack.y + rack.depth / 2]);
  await page.mouse.click(c.x, c.y);
  const key = await page.locator('[data-testid=key-step]').inputValue();
  const step = Number(key);
  const pos = async () => (await objs()).find((o) => o.id === rack.id);
  const hist = () => page.evaluate(() => window.__warehouseSession.state.project.commandHistory.length);
  const b0 = await box(page);
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction((n) => window.__warehouseSession.state.project.commandHistory.length > n, await hist() - 1);
  let o = await pos();
  near(o.x, Math.round((rack.x + step) * 1000) / 1000);
  near(o.y, rack.y);
  assert.deepEqual(await box(page), b0, '선택 시 팬 없음');
  const h1 = await hist();
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('ArrowRight');
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('ArrowUp');
  await page.waitForFunction((n) => window.__warehouseSession.state.project.commandHistory.length >= n + 2, h1);
  o = await pos();
  near(o.x, Math.round((rack.x + 2 * step) * 1000) / 1000);
  near(o.y, Math.round((rack.y - 2 * step) * 1000) / 1000);
  assert.equal(await hist(), h1 + 2, '↑ 한 명령 + (↑→) 대각선 한 명령');
  await page.keyboard.press('Control+z');
  await page.waitForFunction(([id, x, y]) => { const r = window.__warehouseSession.state.project.scenarios.after.objects.find((q) => q.id === id); return Math.abs(r.x - x) < 1e-6 && Math.abs(r.y - y) < 1e-6; }, [rack.id, rack.x + step, rack.y - step]);
  o = await pos();
  near(o.x, Math.round((rack.x + step) * 1000) / 1000);
  near(o.y, Math.round((rack.y - step) * 1000) / 1000);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});
