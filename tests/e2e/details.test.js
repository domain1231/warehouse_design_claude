// 실제 브라우저(file://, 오프라인) Phase 4b: 랙 상세(더블클릭·선반·자재·내려받기·실제 설비 확인), 재고 기록, 배치 이력(기록·복원·비교).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { detailFixture } from '../golden/plan-cases.js';

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
async function open() {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.problems = [];
  page.on('pageerror', (e) => page.problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && page.problems.push(`console: ${m.text()}`));
  page.on('request', (r) => !/^(file|data|blob):/.test(r.url()) && page.problems.push(`network: ${r.url()}`));
  page.on('dialog', (d) => d.accept());
  await page.goto(fileUrl);
  await page.waitForFunction(() => window.__warehouseView && document.querySelector('[data-testid=plan] g[data-id]'));
  return { ctx, page };
}
const P = (page) => page.evaluate(() => window.__warehouseSession.state.project);
/** 가상 Excel 계층·재고 기록을 붙인다(세션 편집, 경고 허용 켬). */
async function attachFixture(page) {
  const racks = (await P(page)).scenarios.after.objects.filter((o) => o.kind === 'rack');
  const fx = detailFixture(racks[3].id, racks[4].id);
  await page.evaluate((fx) => window.__warehouseSession.edit('가상 자료', (p) => {
    const rk = p.scenarios.after.objects.filter((o) => o.kind === 'rack');
    rk[3].excel = fx.excel;
    p.inventoryHistory = fx.inventory;
  }), fx);
  return racks[3];
}

test('랙 더블클릭 상세: 선반·자재 카드, 자재 원본 정보, 검색·선반 필터, 방향 설정 저장, CSV 내려받기, 실제 설비 확인', async () => {
  const { ctx, page } = await open();
  const rack = await attachFixture(page);
  await page.locator(`[data-testid=plan] g[data-id="${rack.id}"]`).first().dblclick();
  const dialog = page.locator('[data-testid=detail-dialog]');
  await dialog.waitFor({ state: 'visible' });
  assert.match(await page.locator('[data-testid=detail-summary]').textContent(), /SYN \/ 7F \/ A열 \/ 1번째 랙/);
  assert.equal(await page.locator('[data-testid=detail-elevation] .s-shelf').count(), 4);
  assert.match(await page.locator('[data-testid=detail-elevation]').textContent(), /사용자 확인 빈 선반/);
  await page.locator('[data-testid=detail-elevation] [data-item="7F-A-1-2-1"]').click();
  assert.match(await page.locator('[data-testid=detail-item]').textContent(), /박스 자재/);
  assert.match(await page.locator('[data-testid=detail-item]').textContent(), /114\.29%/); // 400/350
  await page.locator('[data-testid=detail-search]').fill('p-00');
  assert.equal(await page.locator('[data-testid=detail-elevation] .s-item').count(), 2);
  await page.locator('[data-testid=detail-order]').selectOption('top');
  await page.waitForFunction(() => window.__warehouseSession.state.project.rackInfographic.shelfOrder === 'top');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('[data-testid=detail-dialog] [data-csv]').click()]);
  assert.match(dl.suggestedFilename(), /_materials\.csv$/);
  await page.locator('[data-testid=detail-physical]').click();
  await page.waitForFunction(() => window.__warehouseSession.state.project.specificationHistory.at(-1)?.type === 'physical-confirmed');
  await page.locator('[data-testid=detail-close]').click();
  await dialog.waitFor({ state: 'hidden' });
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('재고 기록: 범위(현재·전체·이전)·검색, 미확인 수량 표시', async () => {
  const { ctx, page } = await open();
  await page.locator('[data-testid=bottom-toggle]').click(); // 하단 패널은 기본으로 접혀 있다
  await attachFixture(page);
  const rows = page.locator('[data-testid=inv-rows] tr');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=inv-rows] tr').length === 3); // 머리글 + 현재 2건
  assert.match(await page.locator('[data-testid=inv-rows]').textContent(), /5 \/ 미확인 BOX/);
  await page.locator('[data-testid=inv-scope]').selectOption('all');
  assert.equal(await rows.count(), 4);
  await page.locator('[data-testid=inv-scope]').selectOption('legacy');
  assert.equal(await rows.count(), 2);
  assert.match(await page.locator('[data-testid=inv-rows]').textContent(), /배치 미확인/);
  await page.locator('[data-testid=inv-scope]').selectOption('all');
  await page.locator('[data-testid=inv-query]').fill('이전 버전');
  assert.equal(await rows.count(), 2);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('배치 이력: 현재 배치 기록 → 이동 → 복원(화면 초기화·실행취소 가능), 비교 대화상자', async () => {
  const { ctx, page } = await open();
  await page.locator('[data-testid=bottom-toggle]').click(); // 하단 패널은 기본으로 접혀 있다
  await page.locator('[data-testid=allow-warnings]').check();
  await page.locator('[data-testid=snap-date]').fill('2026-11-01');
  await page.locator('[data-testid=snap-name]').fill('기준 배치');
  await page.locator('[data-testid=snap-save]').click();
  await page.waitForFunction(() => window.__warehouseSession.state.project.layoutSnapshots.length === 1);
  const rack = (await P(page)).scenarios.after.objects.filter((o) => o.kind === 'rack')[20];
  await page.evaluate((id) => window.__warehouseSession.edit('이동', (p) => { p.scenarios.after.objects.find((o) => o.id === id).x += 0.5; }), rack.id);
  await page.locator('[data-testid=snap-rows] [data-restore]').click();
  await page.waitForFunction((id) => window.__warehouseSession.state.project.commandHistory.at(-1)?.type === '저장된 배치 복원', rack.id);
  const p = await P(page);
  assert.equal(p.scenarios.after.objects.find((o) => o.id === rack.id).x, rack.x);
  assert.deepEqual([p.viewport.zoom, p.viewport.centerLocked], [1, true]);
  await page.locator('[data-testid=snap-rows] [data-compare]').click();
  await page.locator('[data-testid=snap-compare]').waitFor({ state: 'visible' });
  assert.equal(await page.locator('[data-testid=snap-compare] svg').count(), 2);
  await page.locator('[data-testid=snap-compare] [data-cclose]').click();
  await page.locator('[data-testid=undo]').click();
  await page.waitForFunction(([id, x]) => window.__warehouseSession.state.project.scenarios.after.objects.find((o) => o.id === id).x !== x, [rack.id, rack.x]);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});
