// 실제 브라우저(file://, 오프라인) Phase 9b-6a: 사용 안내·프로그램 정보·전후 비교 내보내기·첨부 도면 사용·Excel 배너·배치이력 안의 가져오기 이력.
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
const click = (page, id) => page.locator(`[data-testid=${id}]`).click();
async function download(page, id) {
  const [dl] = await Promise.all([page.waitForEvent('download'), click(page, id)]);
  const chunks = [];
  for await (const c of await dl.createReadStream()) chunks.push(c);
  return { name: dl.suggestedFilename(), data: Buffer.concat(chunks) };
}
const proj = (page) => page.evaluate(() => window.__warehouseSession.state.project);

test('사용 안내·프로그램 정보: 헤더 끝 단추로 열고 닫는다', async () => {
  const { ctx, page } = await open();
  const labels = await page.locator('.header-actions > *:is(button, label)').allTextContents();
  assert.deepEqual(labels.slice(-3).map((t) => t.trim()), ['불러오기', '프로그램 정보', '사용 안내']);
  await page.locator('#helpBtn').click();
  assert.equal(await page.locator('#helpDialog h2').textContent(), 'Warehouse Studio 사용 안내');
  assert.match(await page.locator('#helpDialog summary').textContent(), /오픈소스 사용 고지/);
  assert.equal(await page.locator('#helpDialog a').getAttribute('href'), 'https://docs.sheetjs.com/docs/getting-started/installation/standalone/');
  await page.locator('#helpDialog .close').click();
  assert.equal(await page.locator('#helpDialog').evaluate((d) => d.open), false);
  await page.locator('#aboutBtn').click();
  assert.equal(await page.locator('#aboutDialog h2').textContent(), 'Warehouse Layout Designer');
  const meta = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(await page.locator('#aboutVersion').textContent(), `프로그램 v${meta.version}`);
  assert.equal(await page.locator('#aboutSchema').textContent(), `프로젝트 데이터 ${meta.warehouse.projectSchemaVersion}`);
  assert.equal(await page.locator('#aboutRelease').textContent(), 'GitHub Release 이력');
  await page.locator('#aboutClose').click();
  assert.equal(await page.locator('#aboutDialog').evaluate((d) => d.open), false);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('전후 비교: SVG·PNG 내려받기 파일명과 내용', async () => {
  const { ctx, page } = await open();
  await click(page, 'scenario-compare');
  assert.equal(await page.locator('#compareDialog h2').textContent(), 'Before / After 배치 비교');
  const svg = await download(page, 'compare-svg');
  assert.equal(svg.name, 'warehouse_before_after.svg');
  assert.match(svg.data.toString('utf8'), /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="1800" height="900"/);
  assert.match(svg.data.toString('utf8'), /BEFORE \/ AFTER · 동일 미터 좌표·배율/);
  const png = await download(page, 'compare-png');
  assert.equal(png.name, 'warehouse_before_after.png');
  assert.equal(png.data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.data.readUInt32BE(16), 1800);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('첨부 도면 사용: 배경을 창고 크기로 켜고 실행취소로 되돌린다', async () => {
  const { ctx, page } = await open();
  await page.locator('summary', { hasText: '04 / 참고 도면 배경' }).click();
  const before = (await proj(page)).settings.background;
  assert.equal(before.data, '');
  await page.locator('#referenceImage').click();
  await page.waitForFunction(() => window.__warehouseSession.state.project.settings.background.show);
  const p = await proj(page), b = p.settings.background, w = p.scenarios[p.settings.scenario].warehouse;
  assert.match(b.data, /^data:image\/png;base64,/);
  assert.deepEqual([b.x, b.y, b.width, b.height], [0, 0, w.width, w.height]);
  await click(page, 'undo');
  await page.waitForFunction(() => !window.__warehouseSession.state.project.settings.background.show);
  assert.equal((await proj(page)).settings.background.data, '');
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('Excel 연결 배너와 배치이력 안의 가져오기 이력', async () => {
  const { ctx, page } = await open();
  await page.evaluate(() => window.__warehouseSession.edit('Excel 연결 시험', (p) => {
    const rack = p.scenarios[p.settings.scenario].objects.find((o) => o.kind === 'rack');
    rack.excel = { key: 'T-1', building: 'T', shelves: [] };
  }));
  await page.waitForFunction(() => /^Excel 연결/.test(document.querySelector('#sampleBanner').textContent));
  assert.equal(await page.locator('#sampleBanner').textContent(), 'Excel 연결 · 치수는 원본 기준 / 자동 생성 위치는 실측 아님 · 실제 재고 적재율 · 재고 수량과 높이 비율 분리');
  assert.equal(await page.locator('#bContent-layout #rImportHistory > summary').textContent(), 'Excel 가져오기·자동 백업 이력');
  await click(page, 'scenario-history');
  assert.equal(await page.locator('#rImportHistory').evaluate((d) => d.open), true);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});
