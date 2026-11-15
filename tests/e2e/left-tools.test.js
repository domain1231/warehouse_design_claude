// 왼쪽 패널 v2.4.1 도구: 거리 측정·다각형 통로·랙 팔레트 끌어놓기·통로 검토 대화상자. 실제 마우스는 NOT RUN(합성 이벤트).
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

async function open() {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1400, height: 1500 } });
  const page = await ctx.newPage();
  page.problems = [];
  page.on('pageerror', (e) => page.problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && page.problems.push(`console: ${m.text()}`));
  page.on('request', (r) => !/^(file|data|blob):/.test(r.url()) && page.problems.push(`network: ${r.url()}`));
  await page.goto(fileUrl);
  await page.waitForFunction(() => window.__warehouseView && document.querySelector('[data-testid=plan] g[data-id]'));
  return { ctx, page };
}
const P = (page) => page.evaluate(() => window.__warehouseSession.state.project);
const after_ = (page) => page.evaluate(() => window.__warehouseSession.state.project.scenarios.after.objects);
const selected = (page) => page.evaluate(() => window.__warehouseView.selected);
const saved = (page) => page.waitForFunction(() => document.querySelector('[data-testid=status]').dataset.state === 'saved');
/** 월드 좌표(m) → 화면 좌표(px). */
const screen = (page, x, y) => page.evaluate(([x, y]) => {
  const svg = document.querySelector('[data-testid=plan]');
  const pt = svg.createSVGPoint();
  pt.x = x;
  pt.y = y;
  const s = pt.matrixTransform(svg.getScreenCTM());
  return { x: s.x, y: s.y };
}, [x, y]);

const click = async (page, x, y) => { const s = await screen(page, x, y); await page.mouse.click(s.x, s.y); };

test('거리 측정: 두 점 클릭 → 거리·ΔX·ΔY 표시, 세 번째 클릭은 새 측정, 프로젝트는 그대로, Esc는 선택 도구', async () => {
  const { ctx, page } = await open();
  const before = JSON.stringify(await P(page));
  await page.locator('[data-testid=tool-measure]').click();
  assert.equal(await page.locator('[data-testid=tool-help]').textContent(), '도면에서 두 점 클릭 · Esc 취소');
  await click(page, 20, 8);
  await click(page, 23, 12);
  assert.equal(await page.locator('[data-testid=measure-result]').textContent(), '두 점 거리 5 m · ΔX 3 m · ΔY 4 m');
  await click(page, 21, 8);
  assert.equal(await page.locator('[data-testid=measure-result]').textContent(), '두 점 거리 5 m · ΔX 3 m · ΔY 4 m'); // 새 측정은 두 번째 점에서 갱신
  await click(page, 21, 10);
  assert.equal(await page.locator('[data-testid=measure-result]').textContent(), '두 점 거리 2 m · ΔX 0 m · ΔY 2 m');
  assert.equal(JSON.stringify(await P(page)), before);
  await page.keyboard.press('Escape');
  assert.ok(await page.locator('[data-testid=tool-select]').evaluate((b) => b.classList.contains('active')));
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('다각형 통로: 4점 클릭 + 완성 → 통로 생성·선택, 실행취소로 제거; 자기 교차는 거부', async () => {
  const { ctx, page } = await open();
  await page.locator('[data-testid=allow-warnings]').check();
  const n0 = (await after_(page)).length;
  await page.locator('[data-testid=polygon-aisle]').click();
  assert.equal(await page.locator('[data-testid=toast]').textContent(), '통로 꼭짓점을 순서대로 클릭한 뒤 다각형 완성을 누르세요. Esc 취소.');
  await page.locator('[data-testid=aisle-type]').selectOption('랙 접근 통로');
  // 자기 교차(나비 모양)
  for (const [x, y] of [[20, 7], [23, 9], [23, 7], [20, 9]]) await click(page, x, y);
  await page.locator('[data-testid=polygon-finish]').click();
  assert.equal(await page.locator('[data-testid=toast]').textContent(), '꼭짓점이 겹치거나 자기 교차하는 다각형입니다. Esc 후 다시 그리세요.');
  assert.equal((await after_(page)).length, n0);
  await page.keyboard.press('Escape');
  assert.ok(await page.locator('[data-testid=polygon-finish]').isDisabled());
  await page.locator('[data-testid=polygon-aisle]').click();
  for (const [x, y] of [[20, 7], [23, 7], [23, 9], [20, 9]]) await click(page, x, y);
  await page.locator('[data-testid=polygon-finish]').click();
  await page.waitForFunction((n) => window.__warehouseSession.state.project.scenarios.after.objects.length === n + 1, n0);
  const o = (await after_(page)).at(-1);
  assert.equal(o.kind, 'aisle');
  assert.match(o.code, /^통로 \d{3}$/);
  assert.equal(o.aisleType, '랙 접근 통로');
  assert.equal(o.vertices.length, 4);
  assert.ok(o.width > 2.9 && o.width < 3.1 && o.depth > 1.9 && o.depth < 2.1, JSON.stringify([o.width, o.depth]));
  assert.deepEqual(await selected(page), [o.id]);
  await page.locator('[data-testid=undo]').click();
  await page.waitForFunction((n) => window.__warehouseSession.state.project.scenarios.after.objects.length === n, n0);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('랙 팔레트 끌어놓기: 놓은 점이 중심인 랙 추가, 실행취소 가능', async () => {
  const { ctx, page } = await open();
  await page.locator('[data-testid=allow-warnings]').check();
  const n0 = (await after_(page)).length;
  const at = await screen(page, 20.5, 8.25);
  await page.evaluate(({ x, y }) => {
    const dt = new DataTransfer();
    document.querySelector('[data-testid=rack-palette]').dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
    const plan = document.querySelector('[data-testid=plan]');
    plan.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: x, clientY: y }));
    plan.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: x, clientY: y }));
  }, at);
  await page.waitForFunction((n) => window.__warehouseSession.state.project.scenarios.after.objects.length === n + 1, n0);
  const o = (await after_(page)).at(-1);
  assert.equal(o.kind, 'rack');
  assert.ok(Math.abs(o.x - (20.5 - 0.75)) <= 0.05 && Math.abs(o.y - (8.25 - 0.3)) <= 0.05, JSON.stringify([o.x, o.y]));
  await page.locator('[data-testid=undo]').click();
  await page.waitForFunction((n) => window.__warehouseSession.state.project.scenarios.after.objects.length === n, n0);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('통로 검토 대화상자: 통로별 행·경고 목록, CSV 파일명 aisle_clearance.csv, 프로젝트 불변', async () => {
  const { ctx, page } = await open();
  const before = JSON.stringify(await P(page));
  await page.locator('[data-testid=aisle-validate]').click();
  assert.ok(await page.locator('#mAisleDialog').evaluate((d) => d.open));
  assert.equal(await page.locator('#mAisleDialog h2').textContent(), '통로 폭 · 보호 구역 검토');
  const n = (await after_(page)).filter((o) => o.kind === 'aisle').length;
  assert.equal(await page.locator('#mAisleReport table tr').count(), n + 1);
  assert.ok((await page.locator('#mAisleReport').textContent()).includes('경로 연결·차량 회전·피난 적합성은 이 검토에서 판정하지 않습니다.'));
  const [d] = await Promise.all([page.waitForEvent('download'), page.locator('#mAisleCsv').click()]);
  assert.equal(d.suggestedFilename(), 'aisle_clearance.csv');
  await page.locator('#mAisleClose').click();
  assert.ok(!(await page.locator('#mAisleDialog').evaluate((x) => x.open)));
  assert.equal(JSON.stringify(await P(page)), before);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});
