// 실제 브라우저(file://, 오프라인) 창고 치수 적용·면적 역산·참고 도면·임의 각도 회전(Phase 9a, 데스크톱만).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
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
const T = (id) => `[data-testid=${id}]`;
const screen = (page, x, y) => page.evaluate(([x, y]) => {
  const svg = document.querySelector('[data-testid=plan]');
  const pt = svg.createSVGPoint();
  pt.x = x;
  pt.y = y;
  const s = pt.matrixTransform(svg.getScreenCTM());
  return { x: s.x, y: s.y };
}, [x, y]);

/** 1×1 투명 PNG를 직접 만든다(zlib + CRC). */
function tinyPng() {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4), crc = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.from([0, 0, 0, 0, 0]))), chunk('IEND', Buffer.alloc(0))]);
}
const wh = async (page) => (await P(page)).scenarios.after.warehouse;

test('치수 적용: 창고만 바뀌고 실행취소로 복원, 잘못된 단위는 사유를 보이고 적용 버튼을 끈다', async () => {
  const { ctx, page } = await open();
  await page.locator(T('allow-warnings')).check(); // 기준 배치에 기존 공간 경고가 있어 허용해야 전체 객체 대상 검사가 막지 않는다
  const w0 = await wh(page), racks0 = (await P(page)).scenarios.after.objects;
  await page.fill(T('room-width'), '30');
  await page.fill(T('room-height'), '18');
  assert.equal(await page.inputValue(T('room-area')), '540');
  await page.click(T('room-apply'));
  await page.waitForFunction(() => window.__warehouseSession.state.project.scenarios.after.warehouse.width === 30);
  assert.deepEqual(await wh(page), { width: 30, height: 18, ceiling: null });
  assert.deepEqual((await P(page)).scenarios.after.objects.map(({ id, x, y }) => [id, x, y]), racks0.map(({ id, x, y }) => [id, x, y]));
  await page.click(T('undo'));
  await page.waitForFunction((w) => window.__warehouseSession.state.project.scenarios.after.warehouse.width === w, w0.width);
  assert.deepEqual(await wh(page), w0);
  assert.equal(await page.inputValue(T('room-width')), String(w0.width)); // 칸도 복원값으로
  await page.fill(T('room-width'), '12.34');
  assert.equal(await page.locator(T('room-apply')).isDisabled(), true);
  assert.equal(await page.locator(T('room-reason')).textContent(), '가로와 세로는 0.1m 단위로 입력하세요.');
  await page.fill(T('room-width'), '0.5');
  assert.equal(await page.locator(T('room-reason')).textContent(), '가로와 세로에 1~500m의 숫자를 입력하세요.');
  await page.fill(T('room-width'), '20');
  assert.equal(await page.locator(T('room-apply')).isDisabled(), false);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('면적 역산: 가로 기준 세로를 칸에 채운다(적용 전에는 창고가 바뀌지 않는다)', async () => {
  const { ctx, page } = await open();
  const w0 = await wh(page);
  await page.locator('summary', { hasText: '면적에서 치수 계산' }).click();
  await page.fill(T('room-area-in'), '240');
  await page.fill(T('room-known'), '20');
  await page.click(T('room-derive'));
  assert.deepEqual([await page.inputValue(T('room-width')), await page.inputValue(T('room-height')), await page.inputValue(T('room-area'))], ['20', '12', '240']);
  assert.match(await page.locator(T('toast')).textContent(), /치수를 계산했습니다/);
  assert.deepEqual(await wh(page), w0);
  await ctx.close();
});

test('참고 도면: 불러오기·투명도·두 점 축척 보정·제거가 모두 실행취소 가능하다', async () => {
  const { ctx, page } = await open();
  const sec = page.locator('details', { has: page.locator('summary', { hasText: '04 / 참고 도면 배경' }) });
  if (!(await sec.evaluate((e) => e.open))) await sec.locator('summary').click();
  const bgOf = async () => (await P(page)).settings.background;
  await page.setInputFiles(T('bg-file'), { name: 'ref.png', mimeType: 'image/png', buffer: tinyPng() });
  await page.waitForSelector('[data-testid=plan] image');
  const w0 = await wh(page);
  assert.deepEqual([(await bgOf()).show, (await bgOf()).width, (await bgOf()).height, (await bgOf()).x], [true, w0.width, w0.height, 0]);
  assert.equal(await page.getAttribute('[data-testid=plan] image', 'opacity'), '0.25');
  await page.locator(T('bg-opacity')).evaluate((e) => { e.value = '0.6'; e.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForFunction(() => document.querySelector('[data-testid=plan] image')?.getAttribute('opacity') === '0.6');
  // 기준 거리 4m(도면)를 실측 8m로: 첫 점(2,2) 기준 2배
  await page.fill(T('bg-length'), '8');
  await page.click(T('bg-calibrate'));
  for (const x of [2, 6]) {
    const at = await screen(page, x, 2);
    await page.mouse.click(at.x, at.y);
  }
  await page.waitForFunction((w) => window.__warehouseSession.state.project.settings.background.width > w * 1.9, w0.width);
  const b = await bgOf(), near = (a, e) => Math.abs(a - e) < 0.01; // 화면 픽셀 클릭이라 두 점이 1px 안팎으로 어긋난다
  assert.ok(near(b.width, w0.width * 2) && near(b.height, w0.height * 2) && near(b.x, -2) && near(b.y, -2), JSON.stringify(b));
  assert.equal(await page.getAttribute('[data-testid=plan] image', 'width'), String(b.width));
  await page.click(T('undo'));
  await page.waitForFunction((w) => window.__warehouseSession.state.project.settings.background.width === w, w0.width);
  await page.click(T('bg-clear'));
  await page.waitForFunction(() => !document.querySelector('[data-testid=plan] image'));
  assert.deepEqual([(await bgOf()).data, (await bgOf()).show], ['', false]);
  await page.click(T('undo'));
  await page.waitForSelector('[data-testid=plan] image');
  // 형식 오류는 안내만 하고 바꾸지 않는다
  await page.setInputFiles(T('bg-file'), { name: 'x.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') });
  await page.waitForFunction(() => /PNG\/JPEG\/WebP/.test(document.querySelector('[data-testid=toast]').textContent));
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('임의 각도 회전: 속성 칸에 22.5° 입력, 실행취소로 복원', async () => {
  const { ctx, page } = await open();
  const rack = (await P(page)).scenarios.after.objects.find((o) => o.kind === 'rack');
  const at = await screen(page, rack.x + rack.width / 2, rack.y + rack.depth / 2);
  await page.mouse.click(at.x, at.y);
  await page.fill('[data-field=rotation]', '22.5');
  await page.locator('[data-field=rotation]').dispatchEvent('change');
  const rot = () => page.evaluate((id) => window.__warehouseSession.state.project.scenarios.after.objects.find((o) => o.id === id).rotation, rack.id);
  await page.waitForFunction(([id]) => window.__warehouseSession.state.project.scenarios.after.objects.find((o) => o.id === id).rotation === 22.5, [rack.id]);
  await page.click(T('undo'));
  await page.waitForFunction(([id, r]) => window.__warehouseSession.state.project.scenarios.after.objects.find((o) => o.id === id).rotation === r, [rack.id, rack.rotation]);
  assert.equal(await rot(), rack.rotation);
  await ctx.close();
});
