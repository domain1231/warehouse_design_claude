// 실제 브라우저(file://, 오프라인) Phase 3b-2: 크기 조절 핸들, 다중 랙 편집 대화상자, BEFORE/AFTER 전환·잠금.
// 명세 CAD05·CAD06 일부. 실제 마우스·터치패드는 NOT RUN(Playwright 합성 이벤트).
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
  page.on('dialog', (d) => d.accept());
  await page.goto(fileUrl);
  await page.waitForFunction(() => window.__warehouseView && document.querySelector('[data-testid=plan] g[data-id]'));
  return { ctx, page };
}
const P = (page) => page.evaluate(() => window.__warehouseSession.state.project);
const objs = async (page, k = 'after') => (await P(page)).scenarios[k].objects;
const screen = (page, x, y) => page.evaluate(([x, y]) => {
  const svg = document.querySelector('[data-testid=plan]');
  const pt = svg.createSVGPoint();
  pt.x = x;
  pt.y = y;
  const s = pt.matrixTransform(svg.getScreenCTM());
  return { x: s.x, y: s.y };
}, [x, y]);
const clickObject = async (page, o, modifiers) => {
  const c = await screen(page, o.x + o.width / 2, o.y + o.depth / 2);
  // page.mouse.click에는 modifiers 옵션이 없어 키를 직접 누른다
  for (const m of modifiers ?? []) await page.keyboard.down(m);
  await page.mouse.click(c.x, c.y);
  for (const m of modifiers ?? []) await page.keyboard.up(m);
};

test('크기 조절: 선택하면 8개 핸들, se 핸들 드래그로 폭·깊이 변경(스냅·좌상단 고정), 규격 이력·실행취소', async () => {
  const { ctx, page } = await open();
  await page.locator('[data-testid=allow-warnings]').check();
  const rack = (await objs(page)).filter((o) => o.kind === 'rack')[12];
  await clickObject(page, rack);
  assert.equal(await page.locator('[data-testid=plan] [data-resize]').count(), 8);
  await waitPlanStable(page); // 선택 직후 배치가 정착한 뒤에 좌표를 잰다
  const h = await screen(page, rack.x + rack.width, rack.y + rack.depth);
  const to = await screen(page, rack.x + rack.width + 0.2, rack.y + rack.depth + 0.1);
  await page.mouse.move(h.x, h.y);
  await page.mouse.down();
  await page.mouse.move((h.x + to.x) / 2, (h.y + to.y) / 2, { steps: 3 });
  assert.equal(await page.locator('[data-testid=resize-live]').count(), 1);
  await page.mouse.move(to.x, to.y, { steps: 3 });
  await page.mouse.up();
  await page.waitForFunction((id) => window.__warehouseSession.state.project.commandHistory.at(-1)?.type === '크기 조절', rack.id);
  const o = (await objs(page)).find((x) => x.id === rack.id);
  assert.ok(Math.abs(o.width - (rack.width + 0.2)) <= 0.011 && Math.abs(o.depth - (rack.depth + 0.1)) <= 0.011, JSON.stringify([o.width, o.depth]));
  assert.equal(Math.round(o.width * 100), o.width * 100); // 스냅 0.01
  assert.ok(Math.abs(o.x - rack.x) < 1e-9 && Math.abs(o.y - rack.y) < 1e-9); // 반대쪽(nw) 고정
  assert.equal((await P(page)).specificationHistory.at(-1).rackId, rack.id);
  await page.locator('[data-testid=undo]').click();
  await page.waitForFunction(([id, w]) => window.__warehouseSession.state.project.scenarios.after.objects.find((x) => x.id === id).width === w, [rack.id, rack.width]);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('다중 랙 편집: 왼쪽 정렬 대화상자 미리보기 후 적용, 2개 이상 회전은 그룹 회전 대화상자', async () => {
  const { ctx, page } = await open();
  await page.locator('[data-testid=allow-warnings]').check();
  const racks = (await objs(page)).filter((o) => o.kind === 'rack');
  const pick = [racks[30], racks[31], racks[32]];
  await clickObject(page, pick[0]);
  await clickObject(page, pick[1], ['Shift']);
  await clickObject(page, pick[2], ['Shift']);
  assert.equal(await page.locator('[data-testid=align-x]').isDisabled(), false);
  await page.locator('[data-testid=align-x]').click();
  const dialog = page.locator('[data-testid=group-dialog]');
  await dialog.waitFor({ state: 'visible' });
  assert.equal(await page.locator('[data-testid=group-action]').inputValue(), 'left');
  assert.match(await page.locator('[data-testid=group-summary]').textContent(), /3개 랙/);
  assert.ok((await page.locator('[data-testid=group-preview] g[data-id]').count()) > 10);
  await page.locator('[data-testid=group-apply]').click();
  await dialog.waitFor({ state: 'hidden' });
  const after1 = (await objs(page)).filter((o) => pick.some((p) => p.id === o.id));
  const minX = Math.min(...pick.map((o) => o.x));
  for (const o of after1) assert.ok(Math.abs(o.x - minX) < 1e-9, `${o.code} ${o.x} vs ${minX}`); // 회전 0 랙: 외곽=좌표
  assert.equal((await P(page)).commandHistory.at(-1).type, '그룹 왼쪽 정렬');
  await page.keyboard.press('r');
  await dialog.waitFor({ state: 'visible' });
  assert.equal(await page.locator('[data-testid=group-action]').inputValue(), 'rotate');
  await page.locator('[data-testid=group-close]').click();
  await dialog.waitFor({ state: 'hidden' });
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('다중 랙 편집: 공간 위반이 있으면 허용 확인 전까지 적용 단추가 잠긴다', async () => {
  const { ctx, page } = await open();
  const racks = (await objs(page)).filter((o) => o.kind === 'rack');
  await clickObject(page, racks[30]);
  await clickObject(page, racks[31], ['Shift']);
  await clickObject(page, racks[32], ['Shift']);
  await page.locator('[data-testid=align-y]').click();
  await page.locator('select[name=reference]').selectOption('warehouse');
  await page.waitForFunction(() => /위반 [1-9]/.test(document.querySelector('[data-testid=group-summary]').textContent));
  assert.equal(await page.locator('[data-testid=group-apply]').isDisabled(), true);
  await page.locator('[data-testid=group-allow]').check();
  assert.equal(await page.locator('[data-testid=group-apply]').isDisabled(), false);
  await page.locator('[data-testid=group-close]').click();
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('BEFORE/AFTER 전환·잠금: 전환하면 선택이 비고, 잠금 해제(확인) 후 BEFORE 편집 가능, 새로고침해도 유지', async () => {
  const { ctx, page } = await open();
  await page.locator('[data-testid=scenario-before]').click();
  await page.waitForFunction(() => window.__warehouseSession.state.project.settings.scenario === 'before');
  assert.equal(await page.locator('[data-testid=before-lock]').getAttribute('data-locked'), 'true');
  const rack = (await objs(page, 'before')).find((o) => o.kind === 'rack');
  await clickObject(page, rack);
  assert.equal(await page.locator('[data-testid=plan] [data-resize]').count(), 0); // 잠금: 핸들 없음
  await page.locator('[data-testid=before-lock]').click(); // confirm 자동 수락
  await page.waitForFunction(() => !window.__warehouseSession.state.project.scenarioMeta.before.locked);
  await clickObject(page, rack);
  assert.equal(await page.locator('[data-testid=delete]').isDisabled(), false);
  assert.equal(await page.locator('[data-testid=plan] [data-resize]').count(), 8);
  await page.locator('[data-testid=scenario-after]').click();
  await page.waitForFunction(() => window.__warehouseSession.state.project.settings.scenario === 'after');
  assert.deepEqual(await page.evaluate(() => window.__warehouseView.selected), []);
  await page.waitForFunction(() => document.querySelector('[data-testid=status]').dataset.state === 'saved');
  await page.reload();
  await page.waitForFunction(() => window.__warehouseSession?.state.project);
  const p = await P(page);
  assert.equal(p.settings.scenario, 'after');
  assert.equal(p.scenarioMeta.before.locked, false);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});
