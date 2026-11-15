// 실제 브라우저(file://, 오프라인) Phase 5c-1: 랙·ZONE 라벨 표시 설정, ZONE 표시 이름 적용·원본 복원·실행취소, 최소 표시(선택 랙만).
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
async function open(viewport = { width: 1400, height: 900 }) {
  const ctx = await browser.newContext({ offline: true, viewport });
  const page = await ctx.newPage();
  page.problems = [];
  page.on('pageerror', (e) => page.problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && page.problems.push(`console: ${m.text()}`));
  page.on('request', (r) => !/^(file|data|blob):/.test(r.url()) && page.problems.push(`network: ${r.url()}`));
  await page.goto(fileUrl);
  await page.waitForFunction(() => window.__warehouseView && document.querySelector('[data-testid=plan] g[data-id]'));
  return { ctx, page };
}
const labels = (page) => page.evaluate(() => [...document.querySelectorAll('[data-testid=plan] g.v-labels')].map((g) => ({ ...g.dataset, text: g.textContent })));
const rackCount = (page) => page.evaluate(() => window.__warehouseSession.state.project.scenarios.after.objects.filter((o) => o.kind === 'rack').length);
const zoneNames = (page) => page.evaluate(() => window.__warehouseSession.state.project.rackLabels.zoneNames.after);
const saved = (page) => page.waitForFunction(() => document.querySelector('[data-testid=status]').dataset.state === 'saved');
const pick = async (page, testid, value) => {
  await page.locator(`[data-testid=${testid}]`).selectOption(value);
  await saved(page);
};

test('표시 설정: 배치·번호 형식·랙 텍스트를 바꾸면 도면 라벨 속성·글자가 바뀐다', async () => {
  const { ctx, page } = await open();
  const n = await rackCount(page);
  const base = await labels(page);
  assert.equal(base.length, n);
  assert.ok(base.every((l) => l.rackNumber.length >= 2 || l.rackNumber === ''));
  assert.match(await page.locator('[data-testid=label-status]').textContent(), /^(ZONE·번호 수평 표시|공간 부족)/);

  await pick(page, 'label-layout', 'inline');
  const inline = await labels(page);
  assert.equal(inline.length, n);
  assert.ok(inline.some((l) => l.labelLayout === 'inline'));
  assert.notDeepEqual(inline, base);

  await pick(page, 'label-padding', '3');
  assert.ok((await labels(page)).every((l) => l.rackNumber === '' || l.rackNumber.length >= 3));
  await pick(page, 'label-padding', '0');
  assert.ok((await labels(page)).some((l) => l.rackNumber.length === 1 || /^[1-9]/.test(l.rackNumber)));

  await pick(page, 'label-layout', 'stacked');
  await page.locator('[data-testid=zoom-200]').click();
  for (let i = 0; i < 8; i++) await page.locator('[data-testid=zoom-in]').click();
  await pick(page, 'label-mode', 'occupancy');
  const occ = await labels(page);
  assert.ok(occ.some((l) => /%|재고 미확인/.test(l.text)), '적재율 글자');
  await pick(page, 'label-mode', 'rack-code');
  assert.ok((await labels(page)).every((l) => !/%|재고 미확인/.test(l.text)));
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('확대율이 바뀌면 라벨이 다시 배치된다(화면 px 기준 크기)', async () => {
  const { ctx, page } = await open();
  const size = () => page.evaluate(() => document.querySelector('[data-testid=plan] g.v-labels text')?.getAttribute('font-size'));
  const a = await size();
  await page.locator('[data-testid=zoom-200]').click();
  const b = await size();
  assert.ok(a && b && a !== b, `${a} → ${b}`);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('ZONE 표시 이름: 적용·원본 복원·실행취소(Control+z), Excel 식별자는 그대로', async () => {
  const { ctx, page } = await open();
  await page.locator('[data-testid=rack-list] [data-rack]').first().click();
  const id = await page.evaluate(() => window.__warehouseView.selected[0]);
  const raw = (await labels(page)).find((l) => l.labelFor === id).zone;
  const input = page.locator('[data-testid=zone-name]');
  assert.equal(await input.inputValue(), raw);
  const code0 = await page.evaluate((i) => window.__warehouseSession.state.project.scenarios.after.objects.find((o) => o.id === i).code, id);

  await input.fill('입고 대기');
  await page.locator('[data-testid=zone-apply]').click();
  await saved(page);
  assert.equal((await labels(page)).find((l) => l.labelFor === id).zone, '입고 대기');
  assert.ok(Object.values(await zoneNames(page)).includes('입고 대기'));
  assert.equal(await page.evaluate((i) => window.__warehouseSession.state.project.scenarios.after.objects.find((o) => o.id === i).code, id), code0);

  await page.locator('[data-testid=zone-reset]').click();
  await saved(page);
  assert.equal((await labels(page)).find((l) => l.labelFor === id).zone, raw);
  assert.deepEqual(await zoneNames(page), {});

  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');
  await page.waitForFunction((v) => [...document.querySelectorAll('[data-testid=plan] g.v-labels')].some((g) => g.dataset.zone === v), '입고 대기');
  assert.ok(Object.values(await zoneNames(page)).includes('입고 대기'));
  await page.keyboard.press('Control+z');
  await page.waitForFunction(() => Object.keys(window.__warehouseSession.state.project.rackLabels.zoneNames.after).length === 0);
  assert.equal((await labels(page)).find((l) => l.labelFor === id).zone, raw);

  await input.fill('');
  await page.locator('[data-testid=zone-apply]').click();
  assert.match(await page.locator('[data-testid=toast]').textContent(), /표시 이름을 입력하세요/);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('최소 표시: 선택한 랙에만 라벨이 있고, 선택을 풀면 사라진다', async () => {
  const { ctx, page } = await open();
  await pick(page, 'label-layout', 'minimal');
  assert.equal((await labels(page)).length, 0);
  await page.locator('[data-testid=rack-list] [data-rack]').first().click();
  const id = await page.evaluate(() => window.__warehouseView.selected[0]);
  const one = await labels(page);
  assert.equal(one.length, 1);
  assert.equal(one[0].labelFor, id);
  await pick(page, 'label-layout', 'auto');
  await pick(page, 'label-mode', 'minimal');
  assert.deepEqual((await labels(page)).map((l) => l.labelFor), [id]);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});
