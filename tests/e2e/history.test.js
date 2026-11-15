// 실제 브라우저(file://, 오프라인) Phase 7b: 과거 날짜 읽기 전용 조회.
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
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1440, height: 900 } });
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
const T = (page, id) => page.locator(`[data-testid=${id}]`);
const rackBox = (page, id) => page.locator(`[data-testid=plan] g[data-id="${id}"]`).first().boundingBox();

/** 11-01에 배치 기록 → 랙 이동 + 11-02 재고 기록. 반환: 이동한 랙(기록 시점 좌표). */
async function prepare(page) {
  await T(page, 'allow-warnings').check();
  await T(page, 'snap-date').fill('2026-11-01');
  await T(page, 'snap-name').fill('기준 배치');
  await T(page, 'snap-save').click();
  await page.waitForFunction(() => window.__warehouseSession.state.project.layoutSnapshots.length === 1);
  const rack = (await P(page)).scenarios.after.objects.filter((o) => o.kind === 'rack')[20];
  await page.evaluate((id) => window.__warehouseSession.edit('이동', (p) => {
    p.scenarios.after.objects.find((o) => o.id === id).x += 2;
    p.inventoryHistory.push({ id: 'h1', date: '2026-11-02', scenario: 'after', rackId: id, capacity: 10, quantity: 5, unit: 'BOX', source: '시험' });
  }), rack.id);
  return rack;
}
const planX = (page, id) => page.evaluate((id) => {
  const g = document.querySelector(`[data-testid=plan] g[data-id="${id}"]`);
  return g.getAttribute('transform') || g.querySelector('rect')?.getAttribute('x');
}, id);

test('날짜 조회: 상태 문구·그날 배치 표시, 모드 current, 읽기 전용 차단, 현재 편집 복귀', async () => {
  const { ctx, page } = await open();
  await page.locator('[data-testid=bottom-toggle]').click(); // 하단 패널은 기본으로 접혀 있다
  const rack = await prepare(page);
  const live = await planX(page, rack.id);
  await T(page, 'history-date').fill('2026-11-01');
  await T(page, 'history-date').dispatchEvent('change');
  assert.equal(await T(page, 'history-status').textContent(), '2026-11-01 · 읽기 전용 · 기록 없음 · 해당 날짜 저장 배치');
  assert.equal(await T(page, 'canvas-hint').textContent(), '과거 조회 · 읽기 전용 · 2026-11-01');
  assert.notEqual(await planX(page, rack.id), live); // 저장 배치의 (이동 전) 위치
  assert.equal(await T(page, 'undo').isDisabled(), true);
  await T(page, 'history-mode').selectOption('current');
  assert.match(await T(page, 'history-status').textContent(), /배치 이력 미적용/);
  assert.equal(await planX(page, rack.id), live);
  await T(page, 'history-date').fill('2026-11-02');
  await T(page, 'history-date').dispatchEvent('change');
  assert.match(await T(page, 'history-status').textContent(), /^2026-11-02 · 읽기 전용 · 1개 랙 기록 · 배치 이력 미적용/);

  // 편집 시도: 삭제·드래그·필드 수정은 막히고 프로젝트는 그대로
  const before = JSON.stringify(await P(page));
  const b = await rackBox(page, rack.id);
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.keyboard.press('Delete');
  await page.waitForFunction(() => document.querySelector('[data-testid=toast]').textContent === '과거 조회는 읽기 전용입니다.');
  await T(page, 'toast').evaluate((n) => { n.hidden = true; n.textContent = ''; });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 60, b.y + b.height / 2 + 30, { steps: 4 });
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('[data-testid=toast]').textContent === '과거 조회는 읽기 전용입니다.');
  const after = await P(page);
  assert.deepEqual(after.scenarios, JSON.parse(before).scenarios);
  assert.equal(after.commandHistory.length, JSON.parse(before).commandHistory.length);

  await T(page, 'history-live').click();
  assert.match(await T(page, 'history-status').textContent(), /^현재 편집 · 이력 2개 날짜/);
  assert.equal(await T(page, 'canvas-hint').textContent(), '원점: 좌상단 · X → / Y ↓ · 단위 m');
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  const count = (await P(page)).scenarios.after.objects.length;
  await page.keyboard.press('Delete');
  await page.waitForFunction((n) => window.__warehouseSession.state.project.scenarios.after.objects.length === n - 1, count);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('배치 이력 행의 조회 버튼은 해당 날짜 저장 배치로 조회를 시작한다', async () => {
  const { ctx, page } = await open();
  await page.locator('[data-testid=bottom-toggle]').click(); // 하단 패널은 기본으로 접혀 있다
  await prepare(page);
  await page.locator('[data-testid=snap-rows] [data-layout-view]').click();
  assert.equal(await T(page, 'history-date').inputValue(), '2026-11-01');
  assert.match(await T(page, 'history-status').textContent(), /해당 날짜 저장 배치$/);
  assert.equal(await T(page, 'snap-save').isDisabled(), true);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});
