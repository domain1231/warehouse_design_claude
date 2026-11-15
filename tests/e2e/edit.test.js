// 실제 브라우저(file://, 오프라인) 객체 편집: 추가·드래그 이동·차단·실행취소·삭제·복제·회전·방향키·속성 입력.
// 명세 CAD01·CAD02·CAD07·CAD08·CAD09 일부. 실제 마우스·터치패드는 NOT RUN(Playwright 합성 이벤트).
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

test('랙 추가 도구: 클릭 위치 중심·스냅·새 코드, 추가 후 선택, 실행취소로 제거', async () => {
  const { ctx, page } = await open();
  await page.locator('[data-testid=allow-warnings]').check();
  const n0 = (await after_(page)).length;
  await page.locator('[data-testid=tool-rack]').click();
  const at = await screen(page, 20.5, 8.25);
  await page.mouse.click(at.x, at.y);
  await page.waitForFunction((n) => window.__warehouseSession.state.project.scenarios.after.objects.length === n + 1, n0);
  const objs = await after_(page);
  const o = objs.at(-1);
  assert.equal(o.kind, 'rack');
  assert.match(o.code, /^R-\d{3}$/);
  assert.equal(o.width, 1.5);
  assert.equal(o.depth, 0.6);
  assert.ok(Math.abs(o.x - (20.5 - 0.75)) <= 0.0051 && Math.abs(o.y - (8.25 - 0.3)) <= 0.0051, JSON.stringify([o.x, o.y]));
  assert.equal(Math.round(o.x * 1000), o.x * 1000); // 1mm 단위
  assert.deepEqual(await selected(page), [o.id]);
  await page.locator('[data-testid=undo]').click();
  await page.waitForFunction((n) => window.__warehouseSession.state.project.scenarios.after.objects.length === n, n0);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('드래그 이동: 스냅 이동·명령 기록, 경고 허용을 끄면 겹치는 이동은 전체 취소되고 안내가 뜬다', async () => {
  const { ctx, page } = await open();
  const objs = await after_(page);
  const racks = objs.filter((o) => o.kind === 'rack');
  const a = racks[12], b = racks[13];
  // 1) 빈 쪽으로 0.3m 이동(경고 허용 켬)
  await page.locator('[data-testid=allow-warnings]').check();
  const start = await screen(page, a.x + a.width / 2, a.y + a.depth / 2);
  const end = await screen(page, a.x + a.width / 2 + 0.3, a.y + a.depth / 2);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move((start.x + end.x) / 2, start.y, { steps: 3 });
  await page.mouse.move(end.x, end.y, { steps: 3 });
  await page.mouse.up();
  await saved(page);
  let moved = (await after_(page)).find((o) => o.id === a.id);
  assert.ok(Math.abs(moved.x - (a.x + 0.3)) <= 0.011, `${moved.x} vs ${a.x + 0.3}`);
  assert.equal(moved.y, a.y);
  const last = (await P(page)).commandHistory.at(-1);
  assert.equal(last.type, '객체 이동');
  assert.equal(last.success, true);
  assert.equal(moved.placementMeta.manualEdited, true);
  // 2) 경고 허용 끄고 옆 랙 위로 이동 → 취소
  await page.locator('[data-testid=allow-warnings]').uncheck();
  await saved(page);
  const s2 = await screen(page, moved.x + moved.width / 2, moved.y + moved.depth / 2);
  const e2 = await screen(page, b.x + b.width / 2, b.y + b.depth / 2);
  await page.mouse.move(s2.x, s2.y);
  await page.mouse.down();
  await page.mouse.move(e2.x, e2.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForFunction(() => !document.querySelector('[data-testid=toast]').hidden);
  assert.match(await page.locator('[data-testid=toast]').textContent(), /전체 취소/);
  await saved(page);
  const still = (await after_(page)).find((o) => o.id === a.id);
  assert.deepEqual([still.x, still.y], [moved.x, moved.y]);
  const fail = (await P(page)).commandHistory.at(-1);
  assert.equal(fail.success, false);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('방향키 0.01m·Shift 0.1m, 복제(Ctrl+C/V), R 회전, Delete 삭제, Esc 선택 해제', async () => {
  const { ctx, page } = await open();
  await page.locator('[data-testid=allow-warnings]').check();
  const rack = (await after_(page)).filter((o) => o.kind === 'rack')[20];
  const c = await screen(page, rack.x + rack.width / 2, rack.y + rack.depth / 2);
  await page.mouse.click(c.x, c.y);
  assert.deepEqual(await selected(page), [rack.id]);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowDown');
  await page.waitForFunction(() => /0.1m/.test(window.__warehouseSession.state.project.commandHistory.at(-1)?.type ?? ''));
  await saved(page);
  let o = (await after_(page)).find((x) => x.id === rack.id);
  assert.deepEqual([o.x, o.y], [Math.round((rack.x + 0.01) * 1000) / 1000, Math.round((rack.y + 0.1) * 1000) / 1000]);
  assert.match((await P(page)).commandHistory.at(-1).type, /키보드 미세 이동 0.1m/);
  const n0 = (await after_(page)).length;
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await page.waitForFunction((n) => window.__warehouseSession.state.project.scenarios.after.objects.length === n + 1, n0);
  const copy = (await after_(page)).at(-1);
  assert.deepEqual([copy.x, copy.y], [Math.round((o.x + 0.5) * 1000) / 1000, Math.round((o.y + 0.5) * 1000) / 1000]);
  assert.notEqual(copy.code, o.code);
  assert.deepEqual(await selected(page), [copy.id]);
  await page.keyboard.press('r');
  await page.waitForFunction((id) => window.__warehouseSession.state.project.scenarios.after.objects.find((x) => x.id === id)?.rotation === 90, copy.id);
  await page.keyboard.press('Delete');
  await page.waitForFunction((n) => window.__warehouseSession.state.project.scenarios.after.objects.length === n, n0);
  await page.mouse.click(c.x, c.y);
  await page.keyboard.press('Escape');
  assert.deepEqual(await selected(page), []);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('속성 입력: 이름·수량 반영, 1mm 단위 아닌 좌표는 거부하고 기존 값 유지, 위치 잠금 랙은 이동 취소', async () => {
  const { ctx, page } = await open();
  const rack = (await after_(page)).filter((o) => o.kind === 'rack')[2];
  const c = await screen(page, rack.x + rack.width / 2, rack.y + rack.depth / 2);
  await page.mouse.click(c.x, c.y);
  const field = (k) => page.locator(`[data-testid=inspector] [data-field="${k}"]`);
  await field('code').fill('Z-999');
  await field('code').press('Enter');
  await page.waitForFunction((id) => window.__warehouseSession.state.project.scenarios.after.objects.find((x) => x.id === id).code === 'Z-999', rack.id);
  await field('capacity').fill('100');
  await field('capacity').press('Enter');
  await page.waitForFunction((id) => window.__warehouseSession.state.project.scenarios.after.objects.find((x) => x.id === id).capacity === 100, rack.id);
  await field('x').fill('1.2345');
  await field('x').press('Enter');
  await page.waitForFunction(() => !document.querySelector('[data-testid=toast]').hidden);
  assert.match(await page.locator('[data-testid=toast]').textContent(), /0\.001m 단위/);
  assert.equal((await after_(page)).find((x) => x.id === rack.id).x, rack.x);
  assert.equal(await field('x').inputValue(), String(rack.x));
  await page.locator('[data-testid=position-lock]').check();
  await page.waitForFunction((id) => window.__warehouseSession.state.project.scenarios.after.objects.find((x) => x.id === id).placementMeta.positionLocked, rack.id);
  await page.locator('[data-testid=allow-warnings]').check();
  const end = await screen(page, rack.x + rack.width / 2 + 0.4, rack.y + rack.depth / 2);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 4 });
  await page.mouse.up();
  await page.waitForFunction(() => /위치 잠금/.test(document.querySelector('[data-testid=toast]').textContent));
  assert.equal((await after_(page)).find((x) => x.id === rack.id).x, rack.x);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('BEFORE 잠금: 편집 단추·속성 칸이 잠기고 추가는 거부된다', async () => {
  const { ctx, page } = await open();
  // 샘플은 BEFORE 잠금. 화면 전환 UI 전이므로 세션 편집으로 BEFORE를 보게 한다.
  await page.evaluate(() => window.__warehouseSession.edit('BEFORE 보기', (p) => { p.settings.scenario = 'before'; }));
  await page.waitForFunction(() => document.getElementById('rActive').textContent.includes('BEFORE ·'));
  const rack = (await P(page)).scenarios.before.objects.find((o) => o.kind === 'rack');
  const c = await screen(page, rack.x + rack.width / 2, rack.y + rack.depth / 2);
  await page.mouse.click(c.x, c.y);
  assert.equal(await page.locator('[data-testid=delete]').isDisabled(), true);
  assert.equal(await page.locator('[data-testid=inspector] [data-field="code"]').isDisabled(), true);
  const n0 = (await P(page)).scenarios.before.objects.length;
  await page.locator('[data-testid=tool-rack]').click();
  const at = await screen(page, 20.5, 8.25);
  await page.mouse.click(at.x, at.y);
  await page.waitForFunction(() => /BEFORE 원본 잠금/.test(document.querySelector('[data-testid=toast]').textContent));
  assert.equal((await P(page)).scenarios.before.objects.length, n0);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});
