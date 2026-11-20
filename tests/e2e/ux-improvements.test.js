// UX 개선 e2e: 다중 삭제 확인, 도면 최소 높이·큰 화면 스크롤 없음, JSON 오류 토스트, 빈 X 입력, 벽 도구 안내, Ctrl+S 토스트.
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


const toastText = (page) => page.locator('[data-testid=toast]').textContent();
const waitToast = (page, re) => page.waitForFunction((s) => {
  const t = document.querySelector('[data-testid=toast]');
  return !t.hidden && new RegExp(s).test(t.textContent);
}, re.source);

test('다중 선택 삭제는 확인 대화상자를 거치고 단일 삭제는 거치지 않는다', async () => {
  const { ctx, page } = await open();
  const msgs = [];
  let accept = false;
  page.on('dialog', async (d) => { msgs.push(d.message()); accept ? await d.accept() : await d.dismiss(); });
  const n0 = (await after_(page)).length;
  await page.locator('[data-testid=select-all]').click();
  await page.locator('[data-testid=delete]').click();
  await page.waitForTimeout(300);
  assert.equal(msgs.length, 1);
  assert.ok(msgs[0].includes('개를 삭제합니다. 자동 백업 후 삭제되며 ↶로 되돌릴 수 있습니다.'), msgs[0]);
  assert.equal((await after_(page)).length, n0);
  accept = true;
  await page.locator('[data-testid=delete]').click();
  await page.waitForFunction((n) => window.__warehouseSession.state.project.scenarios.after.objects.length < n, n0);
  assert.equal(msgs.length, 2);
  // 단일 삭제: 대화상자 없음
  await page.evaluate(() => window.__warehouseSession.state.project.scenarios.after.objects.length);
  await ctx.close();
  const o2 = await open();
  const m2 = [];
  o2.page.on('dialog', async (d) => { m2.push(d.message()); await d.dismiss(); });
  const objs = await after_(o2.page);
  const n1 = objs.length;
  const c = await screen(o2.page, objs[0].x + objs[0].width / 2, objs[0].y + objs[0].depth / 2);
  await o2.page.mouse.click(c.x, c.y);
  assert.equal((await selected(o2.page)).length, 1);
  await o2.page.locator('[data-testid=delete]').click();
  await o2.page.waitForFunction((n) => window.__warehouseSession.state.project.scenarios.after.objects.length === n - 1, n1);
  assert.equal(m2.length, 0);
  await o2.ctx.close();
});

// D-051: 도면 칸은 어떤 화면에서도 기준본 높이(약 674px) 이상. 화면이 충분히 크면 스크롤 없이 화면을 채운다.
async function measure(width, height) {
  const ctx = await browser.newContext({ offline: true, viewport: { width, height } });
  const page = await ctx.newPage();
  await page.goto(fileUrl);
  await page.waitForFunction(() => window.__warehouseView && document.querySelector('[data-testid=plan] g[data-id]'));
  await waitPlanStable(page);
  const m = await page.evaluate(() => ({ sh: document.documentElement.scrollHeight, ih: innerHeight, canvas: document.getElementById('canvasWrap').getBoundingClientRect().height }));
  await ctx.close();
  return m;
}

test('도면 칸 최소 높이: 낮은 화면에서도 줄지 않는다(D-051)', async () => {
  for (const [w, h] of [[1920, 890], [1600, 1000], [1920, 1080]]) {
    const m = await measure(w, h);
    assert.ok(m.canvas >= 660, `${w}x${h} canvas ${m.canvas}`);
  }
});

test('큰 화면(1920x1400)에서는 하단 패널이 닫힌 채 세로 스크롤 없이 화면을 채운다(D-040·D-051)', async () => {
  const m = await measure(1920, 1400);
  assert.ok(m.sh <= m.ih + 1, `scrollHeight ${m.sh} innerHeight ${m.ih}`);
  assert.ok(m.canvas > 700, `canvas ${m.canvas}`);
});

test('잘못된 JSON 가져오기 토스트는 위치만 알리고 파일 내용을 노출하지 않는다', async () => {
  const { ctx, page } = await open();
  await page.locator('#jsonIn').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"secretMarker":1,,}') });
  await waitToast(page, /JSON 형식이 아닙니다 \(/);
  const t = await toastText(page);
  assert.ok(t.includes('번째 글자 근처)'), t);
  assert.ok(!t.includes('secretMarker'), t);
  await ctx.close();
});

test('X 입력을 비우면 안내 토스트를 보이고 위치를 유지한다', async () => {
  const { ctx, page } = await open();
  const o = (await after_(page)).find((v) => v.kind === 'rack');
  const c = await screen(page, o.x + o.width / 2, o.y + o.depth / 2);
  await page.mouse.click(c.x, c.y);
  assert.equal((await selected(page)).length, 1);
  const f = page.locator('#inspector [data-field="x"]');
  await f.fill('');
  await f.dispatchEvent('change');
  await waitToast(page, /X 값을 입력하세요/);
  assert.equal(await toastText(page), 'X 값을 입력하세요 · 0.001m 단위. 기존 위치·규격을 유지합니다.');
  assert.equal((await after_(page)).find((v) => v.id === o.id).x, o.x);
  await ctx.close();
});

test('벽 도구: 창고 밖 클릭과 경고 미허용 상태의 랙 위 클릭에 안내 토스트', async () => {
  const { ctx, page } = await open();
  const room = await page.evaluate(() => { const r = window.__warehouseSession.state.project.scenarios.after.warehouse; return { w: r.width, d: r.height }; });
  await page.locator('[data-testid=tool-wall]').click();
  assert.equal(await page.locator('#mAllowWarnings').isChecked(), false);
  const out = await screen(page, room.w + 1, room.d / 2);
  await page.mouse.click(out.x, out.y);
  await waitToast(page, /창고 범위 밖입니다/);
  const o = (await after_(page)).find((v) => v.kind === 'rack');
  const c = await screen(page, o.x + o.width / 2, o.y + o.depth / 2);
  await page.mouse.click(c.x, c.y);
  await waitToast(page, /전체 취소:/);
  assert.ok((await toastText(page)).includes("'공간 위반을 경고 후 허용'을 켜세요"), await toastText(page));
  await ctx.close();
});

test('Ctrl+S는 저장 상태 토스트를 보인다', async () => {
  const { ctx, page } = await open();
  await page.locator('[data-testid=plan]').click({ position: { x: 5, y: 5 } });
  // 첫 자동 저장·불러오기가 끝나 저장 버튼이 활성일 때 누른다(진행 중이면 '저장 중' 안내가 정상 동작).
  await page.waitForFunction(() => !document.getElementById('vSave').disabled, null, { timeout: 15000 });
  await page.keyboard.press('Control+s');
  await waitToast(page, /저장됨 \(SAVED\)|변경 없음 · 이미 저장됨 \(SAVED\)/);
  await ctx.close();
});
