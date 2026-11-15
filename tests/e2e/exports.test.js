// 실제 브라우저(file://, 오프라인) Phase 10: 내보내기 버튼(SVG·PNG·인쇄·CSV 4종)과 하단 패널(접기·복원·구역·높이 조절). 데스크톱 화면만 다룬다.
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
async function open(ctx0) {
  const ctx = ctx0 ?? await browser.newContext({ offline: true, viewport: { width: 1400, height: 900 }, acceptDownloads: true });
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
async function download(page, testid) {
  const [d] = await Promise.all([page.waitForEvent('download'), page.locator(`[data-testid=${testid}]`).click()]);
  return { name: d.suggestedFilename(), text: fs.readFileSync(await d.path()) };
}

test('SVG·CSV 내보내기: 파일명과 내용 시작', async () => {
  const { ctx, page } = await open();
  await page.locator('[data-testid=bottom-toggle]').click(); // 하단 패널은 기본으로 접혀 있다
  const svg = await download(page, 'export-svg');
  assert.equal(svg.name, 'warehouse_layout.svg');
  assert.match(svg.text.toString('utf8'), /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="1500"/);
  const cases = [['export-racks-csv', 'warehouse_racks.csv', '"id","code","block","type"'], ['export-history-csv', 'inventory_history.csv', '"scenario","date","rackId"'], ['export-template-csv', 'inventory_template.csv', '"date","rackId","capacity"'], ['export-compare-csv', 'warehouse_comparison.csv', '"지표","BEFORE","AFTER"']];
  for (const [id, name, head] of cases) {
    const f = await download(page, id);
    assert.equal(f.name, name);
    assert.equal(f.text.subarray(0, 3).toString('hex'), 'efbbbf', 'BOM');
    assert.ok(f.text.toString('utf8').startsWith('﻿' + head), id);
  }
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('PNG 내보내기: 보고서 크기의 PNG 파일', async () => {
  const { ctx, page } = await open();
  const png = await download(page, 'export-png');
  assert.equal(png.name, 'warehouse_layout.png');
  assert.equal(png.text.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.text.readUInt32BE(16), 1500);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('인쇄: 보고서 영역을 채우고 window.print 호출', async () => {
  const { ctx, page } = await open();
  await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed += 1; }; });
  await page.locator('[data-testid=export-print]').click();
  assert.equal(await page.evaluate(() => window.__printed), 1);
  assert.equal(await page.evaluate(() => document.querySelectorAll('#printArea > svg').length), 1);
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('printArea')).display), 'none', '화면에서는 숨김');
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('과거 조회 중 내보내기는 조회 배치를 따른다(보고서 제목 줄)', async () => {
  const { ctx, page } = await open();
  await page.locator('[data-testid=bottom-toggle]').click(); // 하단 패널은 기본으로 접혀 있다
  await page.locator('[data-testid=history-date]').fill('2026-10-01');
  await page.locator('[data-testid=history-date]').dispatchEvent('change');
  const svg = (await download(page, 'export-svg')).text.toString('utf8');
  assert.match(svg, /재고 조회 2026-10-01 \//);
  await ctx.close();
});

test('비교 대화상자 JSON 파일명은 주 내보내기와 같은 규칙', async () => {
  const { ctx, page } = await open();
  await page.locator('[data-testid=scenario-compare]').click();
  const re = /^warehouse_project_v2_3_6_\d{4}-\d{2}-\d{2}\.json$/;
  assert.match((await download(page, 'compare-json')).name, re);
  await page.locator('[data-testid=compare-close]').click();
  assert.match((await download(page, 'export')).name, re);
  await ctx.close();
});

test('하단 패널: 접기·구역 접기·높이 키보드 조절이 새로고침 뒤에도 유지, 기본 복원', async () => {
  const { ctx, page } = await open();
  const state = () => page.evaluate(() => { const p = window.__warehouseSession.state.project.panels; return { open: p.bottomOpen, h: p.bottomHeight, s: p.bottomSections, preset: p.layoutPreset }; });
  const panel = page.locator('[data-testid=bottom-panel]');
  assert.equal((await state()).open, false, '기본은 접힘(기준본 기본 상태)');
  assert.equal(await panel.isVisible(), false);
  await page.locator('[data-testid=bottom-toggle]').click();
  await panel.waitFor({ state: 'visible' });
  const s0 = await state();
  const rectH = () => page.evaluate(() => document.querySelector('[data-testid=bottom-panel]').getBoundingClientRect().height);
  const chrome = (await rectH()) - s0.h; // 날짜 막대 등 패널 높이 외 고정 부분(기준본과 동일 구조)
  // 높이: 키보드
  const grip = page.locator('[data-testid=bottom-grip]');
  await grip.focus();
  await page.keyboard.press('ArrowUp');
  assert.equal((await state()).h, s0.h + 20);
  await page.keyboard.press('Home');
  assert.equal((await state()).h, 160);
  await page.keyboard.press('End');
  assert.equal((await state()).h, 600);
  await page.keyboard.press('ArrowDown');
  assert.equal((await state()).h, 580);
  assert.equal(await rectH(), 580 + chrome);
  // 구역 접기
  await page.locator('[data-testid=inventory-section] > summary').click();
  await page.waitForFunction(() => window.__warehouseSession.state.project.panels.bottomSections.inventory === false); // toggle 이벤트는 비동기
  assert.equal((await state()).preset, 'custom');
  // 전체 접기
  await page.locator('[data-testid=bottom-toggle]').click();
  await panel.waitFor({ state: 'hidden' });
  assert.equal(await page.locator('[data-testid=bottom-toggle]').textContent(), '하단 전체 펼치기');
  await saved(page);
  await page.reload();
  await page.waitForFunction(() => window.__warehouseView);
  const s1 = await state();
  assert.deepEqual([s1.open, s1.h, s1.s.inventory], [false, 580, false]);
  await page.locator('[data-testid=bottom-toggle]').click();
  await panel.waitFor({ state: 'visible' });
  assert.equal(await page.locator('[data-testid=inventory-section]').evaluate((e) => e.open), false);
  // 기본 복원
  await page.locator('[data-testid=bottom-default]').click();
  const s2 = await state();
  assert.deepEqual([s2.h, s2.s.inventory, s2.preset], [300, true, 'restored-default']);
  await saved(page);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('하단 패널: 상태 문구가 바뀌어도 도면 크기가 변하지 않는다', async () => {
  const { ctx, page } = await open();
  const box = () => page.locator('[data-testid=canvas-wrap]').boundingBox();
  await page.locator('[data-testid=bottom-toggle]').click(); // 하단 패널은 기본으로 접혀 있다
  const b0 = await box();
  await page.locator('[data-testid=history-date]').fill('2026-10-01');
  await page.locator('[data-testid=history-date]').dispatchEvent('change');
  const b1 = await box();
  assert.deepEqual([b1.width, b1.height], [b0.width, b0.height]);
  await ctx.close();
});
