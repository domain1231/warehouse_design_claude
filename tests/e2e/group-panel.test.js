// 실제 브라우저(file://, 오프라인) Phase 9b-3: 선택 정보 패널(다중 랙 편집 패널·크기 제한·정밀 좌표 표시·통로 단면 설정).
// 실제 마우스·터치패드는 NOT RUN(Playwright 합성 이벤트).
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


test('랙 2개 선택: 다중 랙 편집 패널, 12개 동작 단추, 단추 하나가 그룹 대화상자를 연다', async () => {
  const { ctx, page } = await open();
  const racks = (await objs(page)).filter((o) => o.kind === 'rack');
  await clickObject(page, racks[30]);
  await clickObject(page, racks[31], ['Shift']);
  const box = page.locator('#inspector');
  assert.equal(await box.locator('h3').first().textContent(), '다중 랙 편집 패널');
  assert.equal(await box.locator('[data-group-action]').count(), 12);
  assert.match(await box.locator('.info').first().textContent(), /^선택 2개 · 외곽 .* × .*m랙 면적 합계 .*㎡공간 경고 \d+건 \/ 통로 위반 \d+건/);
  for (const id of ['mGroupDuplicate', 'mGroupDelete', 'mGroupUndo', 'mGroupCheck', 'mGroupCompare', 'mGroupExport', 'wPositionLock', 'wReview']) assert.equal(await box.locator('#' + id).count(), 1, id);
  assert.equal(await box.locator('summary').textContent(), '최근 편집 명령');
  await box.locator('[data-group-action=spaceY]').click();
  await page.locator('[data-testid=group-dialog]').waitFor({ state: 'visible' });
  assert.equal(await page.locator('[data-testid=group-action]').inputValue(), 'spaceY');
  await page.locator('[data-testid=group-close]').click();
  // 공간 검토 = 통로 검토 대화상자, 비교 = 비교 대화상자
  await box.locator('#mGroupCheck').click();
  await page.locator('#mAisleDialog').waitFor({ state: 'visible' });
  await page.locator('[data-testid=aisle-close]').click();
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('현재 좌표 CSV: 파일명 selected_rack_positions.csv, 선택한 랙 좌표 그대로', async () => {
  const { ctx, page } = await open();
  const racks = (await objs(page)).filter((o) => o.kind === 'rack');
  await clickObject(page, racks[3]);
  await clickObject(page, racks[4], ['Shift']);
  const [d] = await Promise.all([page.waitForEvent('download'), page.locator('#mGroupExport').click()]);
  assert.equal(d.suggestedFilename(), 'selected_rack_positions.csv');
  const lines = fs.readFileSync(await d.path(), 'utf8').replace('\ufeff', '').split('\r\n');
  assert.equal(lines[0], '"id","code","x","y","rotation","width","depth","height"');
  assert.equal(lines.length, 3);
  const ids = lines.slice(1).map((l) => l.split(',')[0].replaceAll('"', ''));
  assert.deepEqual(ids.sort(), [racks[3].id, racks[4].id].sort());
  await ctx.close();
});

test('단일 랙: 기준본 구역·id, 크기 제한 입력과 비율 잠금이 실행취소 가능, 정밀 좌표 자릿수는 설정을 따른다', async () => {
  const { ctx, page } = await open();
  const rack = (await objs(page)).filter((o) => o.kind === 'rack')[5];
  await clickObject(page, rack);
  const box = page.locator('#inspector');
  for (const id of ['multiSelect', 'sSpec', 'sOpenInfo', 'sPhysical', 'sAspect', 'vObjectColor', 'vObjectColorApply', 'vObjectColorClear', 'qCoordinateReadout', 'qDistanceReadout', 'qZoneName', 'qZoneApply', 'qZoneReset', 'wPositionLock', 'wReview']) assert.equal(await box.locator('#' + id).count(), 1, id);
  assert.equal(await box.locator('[data-limit]').count(), 4);
  assert.equal(await box.locator('.q-measure h4').first().textContent(), '정밀 좌표 · 표시 3자리');
  await page.locator('[data-testid=display-decimals]').selectOption('2');
  await page.waitForFunction(() => /표시 2자리/.test(document.querySelector('.q-measure h4').textContent));
  const limit = (k) => box.locator(`[data-limit=${k}]`);
  await limit('maxWidth').fill('40');
  await limit('maxWidth').dispatchEvent('change');
  await page.waitForFunction((id) => window.__warehouseSession.state.project.scenarios.after.objects.find((o) => o.id === id).resizeConstraints.maxWidth === 40, rack.id);
  await box.locator('#sAspect').check();
  await page.waitForFunction((id) => window.__warehouseSession.state.project.scenarios.after.objects.find((o) => o.id === id).resizeConstraints.aspectLocked === true, rack.id);
  // 잘못된 값(최대 < 최소)은 전체 취소되고 이전 값이 유지된다
  await limit('maxWidth').fill('0.01');
  await limit('maxWidth').dispatchEvent('change');
  await page.waitForFunction(() => /전체 취소/.test(document.querySelector('[data-testid=toast]').textContent));
  assert.equal((await objs(page)).find((o) => o.id === rack.id).resizeConstraints.maxWidth, 40);
  await page.locator('[data-testid=undo]').click();
  await page.locator('[data-testid=undo]').click();
  await page.waitForFunction((id) => { const c = window.__warehouseSession.state.project.scenarios.after.objects.find((o) => o.id === id).resizeConstraints; return c.maxWidth === 500 && c.aspectLocked === false; }, rack.id);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('통로: 유효 통로 폭 구역, 단면 축 변경은 실행취소 가능하고 검사 범위 오류는 거부된다', async () => {
  const { ctx, page } = await open();
  await page.locator('[data-testid=allow-warnings]').check(); // 단면 방향이 바뀌면 통로 경고가 새로 생겨 기본(차단)에서는 전체 취소된다
  const aisle = (await objs(page)).find((o) => o.kind === 'aisle');
  await clickObject(page, aisle);
  const box = page.locator('#inspector');
  assert.equal(await box.locator('h3').first().textContent(), '유효 통로 폭');
  for (const id of ['mAisleAxis', 'mAisleEnabled', 'mAisleScope', 'mLinkedDoor']) assert.equal(await box.locator('#' + id).count(), 1, id);
  assert.equal(await box.locator('#qZoneName').count(), 0);
  assert.equal(await box.locator('#wPositionLock').count(), 0);
  const axis = () => objs(page).then((l) => l.find((o) => o.id === aisle.id).clearanceAxis);
  await box.locator('#mAisleAxis').selectOption('y');
  await page.waitForFunction((id) => window.__warehouseSession.state.project.scenarios.after.objects.find((o) => o.id === id).clearanceAxis === 'y', aisle.id);
  assert.equal(await page.locator('#inspector .info').filter({ hasText: '단면 Y' }).count(), 1);
  await box.locator('#mAisleScope').fill('없는 랙');
  await box.locator('#mAisleScope').dispatchEvent('change');
  await page.waitForFunction(() => /검사 대상 랙 번호를 확인하세요/.test(document.querySelector('[data-testid=toast]').textContent));
  assert.equal(await axis(), 'y');
  await page.locator('[data-testid=undo]').click();
  await page.waitForFunction((id) => window.__warehouseSession.state.project.scenarios.after.objects.find((o) => o.id === id).clearanceAxis !== 'y', aisle.id);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});
