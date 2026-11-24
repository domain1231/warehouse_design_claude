// 영역 선택 '모든 객체' 규칙(D-072): 랙 외 객체 포함, 혼합 선택 작업의 랙 한정·종류별 삭제 안내·실행취소.
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

async function open() {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1400, height: 1500 } });
  const page = await ctx.newPage();
  page.problems = [];
  page.dialogs = [];
  page.on('pageerror', (e) => page.problems.push(`pageerror: ${e.message}`));
  page.on('dialog', (d) => { page.dialogs.push(d.message()); d.accept(); });
  await page.goto(fileUrl);
  await page.waitForFunction(() => window.__warehouseView && document.querySelector('[data-testid=plan] g[data-id]'));
  return { ctx, page };
}
const objs = (page) => page.evaluate(() => window.__warehouseSession.state.project.scenarios.after.objects);
const selected = async (page) => (await page.evaluate(() => window.__warehouseView.selected)).sort();
async function dragAll(page) {
  const plan = await page.locator('[data-testid=plan]').boundingBox();
  await page.mouse.move(plan.x + 3, plan.y + 3);
  await page.mouse.down();
  await page.mouse.move(plan.x + plan.width / 2, plan.y + plan.height / 2, { steps: 4 });
  await page.mouse.move(plan.x + plan.width - 3, plan.y + plan.height - 3, { steps: 4 });
  await page.mouse.up();
}

test('기본 규칙은 랙만, 모든 객체 규칙은 랙 외 객체도 선택한다', async () => {
  const { ctx, page } = await open();
  const all = await objs(page);
  const racks = all.filter((o) => o.kind === 'rack').map((o) => o.id);
  const others = all.filter((o) => o.kind !== 'rack');
  assert.ok(others.length > 0);
  await dragAll(page);
  assert.deepEqual(await selected(page), [...racks].sort());
  await page.locator('[data-testid=select-rule]').selectOption('intersect-all');
  await dragAll(page);
  const sel = await selected(page);
  for (const o of others) assert.ok(sel.includes(o.id), `${o.kind} ${o.code}`);
  assert.equal(sel.length, all.length);
  assert.match(await page.locator('[data-testid=selection-status]').textContent(), /^선택 \d+개 \(랙 \d+, 구조물 \d+\)/);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('혼합 선택: 이동은 전체, 회전은 랙만, 삭제는 종류별 개수 안내 후 전체, 실행취소는 한 번에 복원', async () => {
  const { ctx, page } = await open();
  await page.locator('[data-testid=allow-warnings]').check();
  await page.locator('[data-testid=select-rule]').selectOption('intersect-all');
  const before = await objs(page);
  await dragAll(page);
  assert.equal((await selected(page)).length, before.length);
  // 방향키 이동: 선택한 모든 객체가 함께 움직인다
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => window.__warehouseSession.state.project.commandHistory.at(-1)?.type?.startsWith('키보드 미세 이동'));
  const moved = await objs(page);
  for (const o of before) assert.notEqual(moved.find((m) => m.id === o.id).x, o.x, `${o.kind} ${o.code}`);
  // 회전: 랙 1개 + 랙 외 1개 선택 시 랙만 회전
  const rack = before.find((o) => o.kind === 'rack'), other = before.find((o) => o.kind !== 'rack');
  await page.keyboard.press('Escape');
  await page.locator(`[data-testid=plan] g[data-id="${rack.id}"]`).click();
  await page.locator(`[data-testid=plan] g[data-id="${other.id}"]`).click({ modifiers: ['Shift'], force: true });
  assert.deepEqual(await selected(page), [rack.id, other.id].sort());
  await page.locator('[data-testid=rotate]').click();
  await page.waitForFunction(() => window.__warehouseSession.state.project.scenarios.after.objects.find((o) => o.rotation !== 0) !== undefined);
  const rotated = await objs(page);
  assert.equal(rotated.find((o) => o.id === rack.id).rotation, (moved.find((o) => o.id === rack.id).rotation + 90) % 360);
  assert.equal(rotated.find((o) => o.id === other.id).rotation, moved.find((o) => o.id === other.id).rotation);
  // 삭제
  await dragAll(page);
  const n = (await objs(page)).length;
  await page.locator('[data-testid=delete]').click();
  await page.waitForFunction(() => window.__warehouseSession.state.project.scenarios.after.objects.length === 0);
  assert.match(page.dialogs.at(-1), new RegExp(`객체 ${n}개\\(랙 \\d+ · `));
  await page.locator('[data-testid=undo]').click();
  await page.waitForFunction((k) => window.__warehouseSession.state.project.scenarios.after.objects.length === k, n);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});
