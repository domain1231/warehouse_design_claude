// 실제 브라우저(file://, 오프라인) 도면 보기·선택. 명세 CAD10·CAD11(휠·패널 스크롤 분리), F-039(휠 감도), F-009(선택) 일부.
// 실제 마우스·터치패드·터치 화면은 NOT RUN: Playwright 합성 이벤트로만 확인한다.
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
before(async () => {
  browser = await chromium.launch({ headless: true, executablePath: process.env.WAREHOUSE_BROWSER_PATH || undefined });
});
after(async () => {
  await browser?.close();
});

async function open(ctx) {
  const page = await ctx.newPage();
  page.problems = [];
  page.on('pageerror', (e) => page.problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && page.problems.push(`console: ${m.text()}`));
  page.on('request', (r) => !/^(file|data|blob):/.test(r.url()) && page.problems.push(`network: ${r.url()}`));
  await page.goto(fileUrl);
  await page.waitForFunction(() => window.__warehouseView && document.querySelector('[data-testid=plan] g[data-id]'));
  return page;
}
const view = (page) => page.evaluate(() => ({ viewport: window.__warehouseView.viewport, selected: window.__warehouseView.selected }));
const saved = (page) => page.waitForFunction(() => document.querySelector('[data-testid=status]').dataset.state === 'saved');
const objectGeometry = (page) => page.evaluate(() => JSON.stringify(window.__warehouseSession.state.project.scenarios.after.objects.map((o) => [o.id, o.x, o.y, o.width, o.depth, o.rotation])));

test('도면이 그려지고, 휠 확대는 커서 위치 기준이며 객체 좌표는 바뀌지 않는다; 새로고침해도 화면이 복원된다', async () => {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1400, height: 850 } });
  const page = await open(ctx);
  const geometry = await objectGeometry(page);
  assert.equal(await page.locator('[data-testid=zoom-label]').textContent(), '100%');
  await page.locator('[data-testid=center-lock]').uncheck(); // 기준점 확대는 중심 고정 해제에서
  const box = await page.locator('[data-testid=plan]').boundingBox();
  const at = { x: Math.round(box.x + box.width * 0.3), y: Math.round(box.y + box.height * 0.4) }; // 마우스 이벤트 좌표는 정수 px
  const worldAt = () => page.evaluate(({ x, y }) => {
    const svg = document.querySelector('[data-testid=plan]');
    const pt = svg.createSVGPoint();
    pt.x = x;
    pt.y = y;
    const w = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: w.x, y: w.y };
  }, at);
  const before = await worldAt();
  await page.mouse.move(at.x, at.y);
  await page.waitForTimeout(400); // 이전 휠 동작과 분리
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -100);
  await page.waitForFunction(() => window.__warehouseView.viewport.zoom > 1.05);
  const after1 = await worldAt();
  // SVG 행렬은 단정밀도라 1e-4m(0.1mm)까지 허용한다. 계산 자체의 불변은 단위 검사가 1e-7로 확인한다.
  assert.ok(Math.abs(after1.x - before.x) < 1e-4 && Math.abs(after1.y - before.y) < 1e-4, `커서 아래 점 유지 ${JSON.stringify([before, after1])}`);
  assert.equal(await objectGeometry(page), geometry);
  await saved(page);
  const v = (await view(page)).viewport;
  await page.reload();
  await page.waitForFunction(() => window.__warehouseView?.viewport);
  assert.deepEqual((await view(page)).viewport, v);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('패널에서 시작한 휠은 도면 위로 지나가도 확대하지 않는다(CAD11)', async () => {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1400, height: 850 } });
  const page = await open(ctx);
  const z0 = (await view(page)).viewport.zoom;
  const panel = await page.locator('.side.right').boundingBox();
  const plan = await page.locator('[data-testid=plan]').boundingBox();
  await page.mouse.move(panel.x + 20, panel.y + 40);
  await page.mouse.wheel(0, 100);
  await page.mouse.move(plan.x + plan.width / 2, plan.y + plan.height / 2);
  await page.mouse.wheel(0, 100); // 350ms 안: 같은 휠 동작
  await page.waitForTimeout(200);
  assert.equal((await view(page)).viewport.zoom, z0);
  await page.waitForTimeout(400);
  await page.mouse.wheel(0, 100); // 새 휠 동작은 도면에서 시작 → 축소
  await page.waitForFunction((z) => window.__warehouseView.viewport.zoom < z, z0);
  await ctx.close();
});

test('선택: 클릭·Shift 추가·빈 곳 클릭 해제·영역 선택, 선택은 새로고침 후 복원된다', async () => {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1400, height: 850 } });
  const page = await open(ctx);
  const racks = page.locator('[data-testid=plan] g[data-id] rect[rx="0.055"]');
  await racks.nth(5).click();
  assert.equal((await view(page)).selected.length, 1);
  assert.equal(await page.locator('[data-testid=selection-status]').textContent(), '1개 선택');
  await racks.nth(6).click({ modifiers: ['Shift'] });
  assert.equal((await view(page)).selected.length, 2);
  await saved(page);
  const sel = (await view(page)).selected;
  await page.reload();
  await page.waitForFunction(() => window.__warehouseView?.viewport);
  assert.deepEqual((await view(page)).selected.sort(), [...sel].sort());
  // 창고 밖 여백 클릭: 선택 해제
  const plan = await page.locator('[data-testid=plan]').boundingBox();
  await page.mouse.click(plan.x + 5, plan.y + 5);
  assert.equal((await view(page)).selected.length, 0);
  // 도면 전체를 덮는 영역 선택: 모든 랙
  await page.mouse.move(plan.x + 3, plan.y + 3);
  await page.mouse.down();
  await page.mouse.move(plan.x + plan.width / 2, plan.y + plan.height / 2, { steps: 4 });
  await page.mouse.move(plan.x + plan.width - 3, plan.y + plan.height - 3, { steps: 4 });
  assert.equal(await page.locator('#mSelectionBox').count(), 1);
  await page.mouse.up();
  const total = await page.evaluate(() => window.__warehouseSession.state.project.scenarios.after.objects.filter((o) => o.kind === 'rack').length);
  assert.equal((await view(page)).selected.length, total);
  assert.equal(await page.locator('#mSelectionBox').count(), 0);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('화면 이동 도구 드래그·Esc 취소·전체 보기·50%/200%·선택 영역 보기', async () => {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1400, height: 850 } });
  const page = await open(ctx);
  await page.locator('[data-testid=tool-pan]').click();
  const plan = await page.locator('[data-testid=plan]').boundingBox();
  const c = { x: plan.x + plan.width / 2, y: plan.y + plan.height / 2 };
  const v0 = (await view(page)).viewport;
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 100, c.y + 50, { steps: 5 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  assert.deepEqual((await view(page)).viewport, v0);
  // 기준본처럼 Esc는 선택 도구로 돌아간다
  assert.equal(await page.locator('[data-testid=tool-select]').getAttribute('class'), 'active');
  await page.locator('[data-testid=tool-pan]').click();
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 100, c.y + 50, { steps: 5 });
  await page.mouse.up();
  const moved = (await view(page)).viewport;
  assert.equal(moved.centerLocked, false);
  const mpp = 1 / (v0.fitScale * v0.zoom);
  assert.ok(Math.abs(moved.panX - (0 - 100 * mpp)) < 1e-6 && Math.abs(moved.panY - (0 - 50 * mpp)) < 1e-6, JSON.stringify(moved));
  await page.locator('[data-testid=zoom-200]').click();
  assert.equal(await page.locator('[data-testid=zoom-label]').textContent(), '200%');
  assert.equal((await view(page)).viewport.centerLocked, true);
  await page.locator('[data-testid=zoom-50]').click();
  assert.equal((await view(page)).viewport.zoom, 0.5);
  await page.locator('[data-testid=fit]').click();
  assert.equal((await view(page)).viewport.zoom, 1);
  assert.equal(await page.locator('[data-testid=focus-selection]').isDisabled(), true);
  await page.locator('[data-testid=tool-select]').click();
  await page.locator('[data-testid=plan] g[data-id] rect[rx="0.055"]').first().click();
  await page.locator('[data-testid=focus-selection]').click();
  const f = (await view(page)).viewport;
  assert.ok(f.zoom > 1 && f.centerLocked === false);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('휠 감도: 선택·새로고침 후 유지, 감도가 높을수록 같은 휠에 더 많이 확대, 기본값 복원', async () => {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1400, height: 850 } });
  const page = await open(ctx);
  assert.equal(await page.locator('[data-testid=wheel-sensitivity]').inputValue(), 'low');
  const plan = await page.locator('[data-testid=plan]').boundingBox();
  const zoomAfterWheel = async () => {
    await page.locator('[data-testid=fit]').click();
    await page.mouse.move(plan.x + plan.width / 2, plan.y + plan.height / 2);
    await page.waitForTimeout(400);
    await page.mouse.wheel(0, -100);
    await page.waitForFunction(() => window.__warehouseView.viewport.zoom !== 1);
    return (await view(page)).viewport.zoom;
  };
  const low = await zoomAfterWheel();
  await page.locator('[data-testid=wheel-sensitivity]').selectOption('high');
  assert.match(await page.locator('[data-testid=wheel-status]').textContent(), /저장하고 확인/);
  const high = await zoomAfterWheel();
  assert.ok(high > low, `${high} > ${low}`);
  await page.reload();
  await page.waitForFunction(() => window.__warehouseView);
  assert.equal(await page.locator('[data-testid=wheel-sensitivity]').inputValue(), 'high');
  await page.locator('[data-testid=wheel-reset]').click();
  assert.equal(await page.evaluate(() => localStorage.getItem('warehouse-layout-v2:wheel-sensitivity')), 'low');
  assert.equal(await page.evaluate(() => localStorage.getItem('warehouse-studio-v1-wheel-sensitivity-v1')), null);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('좁은 화면(390px): 가로 넘침 없이 도면이 보인다', async () => {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 390, height: 844 } });
  const page = await open(ctx);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.equal(overflow, 0);
  const plan = await page.locator('[data-testid=plan]').boundingBox();
  assert.ok(plan.width > 300 && plan.height >= 300, JSON.stringify(plan));
  await ctx.close();
});
