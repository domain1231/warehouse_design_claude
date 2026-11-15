// 실제 브라우저(file://, 오프라인) Phase 5c-2: 색 표시 모드, 임계값·색 적용, 객체별 지정색·실행취소, 잘못된 임계값 거부, 전체 복원.
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
const saved = (page) => page.waitForFunction(() => document.querySelector('[data-testid=status]').dataset.state === 'saved');
const project = (page) => page.evaluate(() => window.__warehouseSession.state.project);
const fills = (page) => page.evaluate(() => [...document.querySelectorAll('[data-testid=plan] > g[data-id]')].map((g) => [g.dataset.id, g.querySelector('rect,polygon').getAttribute('fill')]));
const rackFill = async (page, id) => (await fills(page)).find((f) => f[0] === id)[1];
const toast = (page) => page.locator('[data-testid=toast]').textContent();

// 시험용 재고(가상 값)를 첫 랙에 넣는다: 40% → 기본 색상 '여유'.
async function seed(page) {
  const id = await page.evaluate(async () => {
    const s = window.__warehouseSession;
    const o = s.state.project.scenarios.after.objects.find((x) => x.kind === 'rack');
    await s.edit('시험 재고', (d) => { const r = d.scenarios.after.objects.find((x) => x.id === o.id); r.capacity = 100; r.quantity = 40; r.unit = 'BOX'; });
    return o.id;
  });
  await saved(page);
  return id;
}

test('표시 모드: 도면 색상 기준을 바꾸면 랙 채움색과 범례가 바뀌고 실행취소된다', async () => {
  const { ctx, page } = await open();
  const id = await seed(page);
  const inv = await rackFill(page, id);
  assert.equal(inv, (await project(page)).settings.colors.low);
  await page.locator('[data-testid=viz-mode]').selectOption('management');
  await saved(page);
  assert.notEqual(await rackFill(page, id), inv);
  assert.match(await page.locator('[data-testid=legend]').textContent(), /품목별 관리 정보/);
  await page.locator('[data-testid=viz-mode]').selectOption('height');
  await page.locator('[data-testid=height-policy]').selectOption('max');
  await saved(page);
  assert.match(await page.locator('[data-testid=legend]').textContent(), /모든 등록 선반의 최대 자재 높이 비율 중 최댓값/);
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');
  await page.waitForFunction(() => window.__warehouseSession.state.project.settings.heightPolicy === 'weightedMax');
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('임계값·색 적용: 범례 문구가 바뀌고, 60/60은 거부되어 이전 값이 유지된다', async () => {
  const { ctx, page } = await open();
  const id = await seed(page);
  await page.locator('[data-testid=threshold-low]').fill('30');
  await page.locator('[data-testid=threshold-high]').fill('70');
  await page.locator('[data-testid=color-low]').fill('#112233');
  await page.locator('[data-testid=apply-colors]').click();
  await saved(page);
  const legend = await page.locator('[data-testid=legend]').textContent();
  assert.match(legend, /30% 이상 ~ 70% 미만/);
  assert.equal(await rackFill(page, id), '#80b3f1', '40%는 30~70 구간(보통)');
  assert.equal((await project(page)).settings.colors.low, '#112233');

  await page.locator('[data-testid=threshold-low]').fill('60');
  await page.locator('[data-testid=threshold-high]').fill('60');
  await page.locator('[data-testid=apply-colors]').click();
  await page.waitForFunction(() => /^색상·표시 설정 취소:/.test(document.querySelector('[data-testid=toast]').textContent));
  const st = (await project(page)).settings;
  assert.deepEqual([st.low, st.high], [30, 70]);
  assert.equal(await page.locator('[data-testid=threshold-low]').inputValue(), '30');
  assert.equal(await page.locator('[data-testid=threshold-high]').inputValue(), '70');
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('객체별 지정색: 적용하면 사용자 지정 모드·채움색이 바뀌고 Control+z로 복원, 해제는 항목만 지운다', async () => {
  const { ctx, page } = await open();
  await page.locator('[data-testid=bottom-toggle]').click(); // 하단 패널은 기본으로 접혀 있다
  await page.locator('[data-testid=rack-list] [data-rack]').first().click();
  const id = await page.evaluate(() => window.__warehouseView.selected[0]);
  const before = await rackFill(page, id);
  await page.locator('[data-testid=object-color]').fill('#aa4400');
  await page.locator('[data-testid=object-color-apply]').click();
  await saved(page);
  assert.equal(await rackFill(page, id), '#aa4400');
  assert.equal((await project(page)).theme.colorMode, 'custom');
  assert.equal(await page.locator('[data-testid=color-mode]').inputValue(), 'custom');
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');
  await page.waitForFunction(() => window.__warehouseSession.state.project.theme.colorMode === 'data');
  assert.equal(await rackFill(page, id), before);
  await page.keyboard.press('Control+Shift+z');
  await page.waitForFunction(() => window.__warehouseSession.state.project.theme.colorMode === 'custom');
  await page.locator('[data-testid=object-color-clear]').click();
  await saved(page);
  assert.equal(await rackFill(page, id), before);
  const p = await project(page);
  assert.deepEqual(p.theme.objectColors.after, {});
  assert.equal(p.theme.colorMode, 'custom');
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('전체 복원: 확인 후 기본 색·기준·지정색·데이터 기반 모드로 돌아가고, 취소하면 그대로', async () => {
  const { ctx, page } = await open();
  await page.locator('[data-testid=bottom-toggle]').click(); // 하단 패널은 기본으로 접혀 있다
  await page.locator('[data-testid=threshold-low]').fill('30');
  await page.locator('[data-testid=color-over]').fill('#010203');
  await page.locator('[data-testid=apply-colors]').click();
  await saved(page);
  await page.locator('[data-testid=rack-list] [data-rack]').first().click();
  await page.locator('[data-testid=object-color-apply]').click();
  await saved(page);
  await page.locator('[data-testid=theme-open]').click();
  await page.locator('[data-testid=reset-scope]').selectOption('all');
  const messages = [];
  page.once('dialog', (d) => { messages.push(d.message()); d.dismiss(); });
  await page.locator('[data-testid=reset-colors]').click();
  assert.match(messages[0], /사용자 지정 객체색까지 기본값으로 복원합니까/);
  assert.equal((await project(page)).settings.low, 30);
  page.once('dialog', (d) => d.accept());
  await page.locator('[data-testid=reset-colors]').click();
  await page.waitForFunction(() => window.__warehouseSession.state.project.settings.low === 50);
  await saved(page);
  const p = await project(page);
  assert.deepEqual([p.settings.high, p.settings.colors.over, p.theme.colorMode, p.theme.objectColors], [90, '#e46775', 'data', { before: {}, after: {} }]);
  assert.equal(await page.locator('[data-testid=color-over]').inputValue(), '#e46775');
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('UI 색상: 대화상자에서 적용하면 CSS 변수·도면 색이 바뀌고 실행취소되며, 복원 미리보기가 범위별 변경을 먼저 보여준다', async () => {
  const { ctx, page } = await open();
  const cssVar = (n) => page.evaluate((k) => document.documentElement.style.getPropertyValue(k).trim(), n);
  const floor = () => page.locator('[data-testid=plan] > rect').nth(0).getAttribute('fill');
  assert.equal(await cssVar('--canvas'), '#101a25');
  await page.locator('[data-testid=theme-open]').click();
  assert.match(await page.locator('[data-testid=reset-preview]').textContent(), /변경 0건/);
  await page.locator('[data-testid=theme-canvas]').fill('#123456');
  await page.locator('[data-testid=theme-floor]').fill('#223344');
  await page.locator('[data-testid=theme-apply]').click();
  await saved(page);
  assert.equal(await cssVar('--canvas'), '#123456');
  assert.equal(await floor(), '#223344');
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid=canvas-wrap]')).backgroundColor), 'rgb(18, 52, 86)');
  const p = await project(page);
  assert.deepEqual([p.theme.presetId, p.theme.customColors.canvas], ['custom', '#123456']);
  // 복원 미리보기: UI 범위는 바뀐 2건을 보여주고, 적재율 범위는 UI 색을 건드리지 않는다.
  await page.locator('[data-testid=theme-open]').click();
  const pv = page.locator('[data-testid=reset-preview]');
  assert.match(await pv.textContent(), /변경 2건/);
  assert.match(await pv.textContent(), /도면 바탕 #123456 → #101a25/);
  await page.locator('[data-testid=reset-scope]').selectOption('occupancy');
  assert.match(await pv.textContent(), /변경 0건/);
  await page.locator('[data-testid=reset-scope]').selectOption('ui');
  assert.equal(await cssVar('--canvas'), '#123456'); // 미리보기만으로는 적용되지 않는다
  await page.locator('[data-testid=reset-colors]').click();
  await page.waitForFunction(() => document.documentElement.style.getPropertyValue('--canvas').trim() === '#101a25');
  await saved(page);
  assert.equal(await floor(), '#152231');
  await page.locator('[data-testid=undo]').click();
  await page.waitForFunction(() => document.documentElement.style.getPropertyValue('--canvas').trim() === '#123456');
  await page.locator('[data-testid=undo]').click();
  await page.waitForFunction(() => document.documentElement.style.getPropertyValue('--canvas').trim() === '#101a25');
  assert.equal(await floor(), '#152231');
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('가까운 거리 표시: 랙을 선택하면 거리 문구가 나오고 크기 조절 드래그 중에는 사라진다', async () => {
  const { ctx, page } = await open();
  const id = await page.evaluate(() => window.__warehouseSession.state.project.scenarios.after.objects.find((o) => o.kind === 'rack').id);
  assert.equal(await page.locator('[data-testid=plan] [data-distance]').count(), 0);
  await page.locator(`[data-testid=plan] g[data-id="${id}"]`).first().click({ position: { x: 3, y: 3 } });
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=plan] [data-distance]').length > 0);
  assert.match(await page.locator('[data-testid=plan] .q-guide text').first().textContent(), /^(겹침 · )?\d+(\.\d+)?m$/);
  const box = await page.locator('[data-testid=plan] [data-resize=e] rect').nth(1).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2, { steps: 4 });
  await page.waitForSelector('[data-testid=resize-live]');
  assert.equal(await page.locator('[data-testid=plan] [data-distance]').count(), 0);
  await page.mouse.up();
  await saved(page);
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=plan] [data-distance]').length > 0);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});
