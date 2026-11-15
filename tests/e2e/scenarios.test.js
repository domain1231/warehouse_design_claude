// 실제 브라우저(file://, 오프라인) Phase 7a: BEFORE→AFTER 복제·비교·가져오기 이력/백업 복원.
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
  const ctx = await browser.newContext({ offline: true, viewport, acceptDownloads: true });
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
const proj = (page) => page.evaluate(() => window.__warehouseSession.state.project);
const rackIds = (p, k) => p.scenarios[k].objects.filter((o) => o.kind === 'rack').map((o) => o.id);
const click = (page, id) => page.locator(`[data-testid=${id}]`).click();

async function cloneReplace(page) {
  await click(page, 'scenario-clone');
  await page.locator('[data-testid=clone-choice]').selectOption('replace');
  await click(page, 'clone-apply');
  await page.waitForFunction(() => window.__warehouseSession.state.project.layoutBackups.length === 1);
}

test('복제: AFTER 랙 ID가 BEFORE와 같고 백업 1개, Ctrl+Z로 이전 AFTER 복원', async () => {
  const { ctx, page } = await open();
  const pre = await proj(page);
  await cloneReplace(page);
  const p = await proj(page);
  assert.deepEqual(rackIds(p, 'after'), rackIds(p, 'before'));
  assert.equal(p.layoutBackups.length, 1);
  await page.locator('[data-testid=clone-dialog]').waitFor({ state: 'hidden' });
  await page.keyboard.press('Control+z');
  await page.waitForFunction((n) => window.__warehouseSession.state.project.layoutBackups.length === n, pre.layoutBackups.length);
  assert.deepEqual(await page.evaluate(() => window.__warehouseSession.state.project.scenarios.after), pre.scenarios.after);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('비교: 지표표·변경 목록·CSV 다운로드, 랙 이동 후 변경 유형 이동', async () => {
  const { ctx, page } = await open();
  await cloneReplace(page);
  await click(page, 'scenario-compare');
  assert.match(await page.locator('[data-testid=compare-metrics]').textContent(), /전체 랙 수/);
  assert.match(await page.locator('[data-testid=compare-rows]').textContent(), /변경 유형 \(복수\)/);
  const [dl] = await Promise.all([page.waitForEvent('download'), click(page, 'compare-csv')]);
  assert.equal(dl.suggestedFilename(), 'warehouse_rack_changes.csv');
  const text = fs.readFileSync(await dl.path(), 'utf8');
  assert.equal(text.split('\r\n')[0], '﻿"랙","변경 유형","BEFORE 설계","AFTER 설계","원본 규격"');
  await click(page, 'compare-close');
  const id = (await proj(page)).scenarios.after.objects.find((o) => o.kind === 'rack').id;
  await page.evaluate(async (rid) => {
    await window.__warehouseSession.edit('이동', (p) => { p.scenarios.after.objects.find((o) => o.id === rid).x += 1; });
  }, id);
  await click(page, 'scenario-compare');
  assert.match(await page.locator('[data-testid=compare-rows]').textContent(), /이동/);
  await page.locator('[data-testid=compare-mode]').selectOption('overlay');
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('가져오기 이력: 백업 복원 시 AFTER가 복제 전 상태로 돌아간다', async () => {
  const { ctx, page } = await open({ width: 390, height: 800 });
  const pre = await proj(page);
  await cloneReplace(page);
  await click(page, 'scenario-history');
  await page.locator('[data-testid=backup-rows] [data-restore]').first().click();
  await page.waitForFunction((n) => window.__warehouseSession.state.project.layoutBackups.length === n + 1 && window.__warehouseSession.state.project.layoutRevisions.length >= 2, pre.layoutBackups.length + 1).catch(() => {});
  await page.waitForFunction((ids) => JSON.stringify(window.__warehouseSession.state.project.scenarios.after.objects.map((o) => o.id)) === ids, JSON.stringify(pre.scenarios.after.objects.map((o) => o.id)));
  assert.deepEqual(rackIds(await proj(page), 'after'), rackIds(pre, 'after'));
  assert.deepEqual(page.problems, []);
  await ctx.close();
});
