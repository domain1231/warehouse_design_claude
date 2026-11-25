// E1(D-086) 실제 브라우저(file://, 오프라인): 상한 근처 합성 프로젝트(가상 시험값)를 JSON·ZIP으로 불러오고,
// 앱이 내려받은 JSON을 다시 불러온다. 12MB 초과 JSON 저장 시 크기 경고.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { sizedProject } from '../unit/size-fixture.js';
import { packProject } from '../../src/persistence/zip.js';

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

const racksBefore = (page) => page.evaluate(() => window.__warehouseSession.state.project.scenarios.before.objects.filter((o) => o.kind === 'rack').length);
const toast = (page) => page.locator('[data-testid=toast]').textContent();
async function importAndWait(page, file, label) {
  await page.evaluate(() => { document.querySelector('[data-testid=toast]').textContent = ''; });
  await page.locator('[data-testid=import-file]').setInputFiles(file);
  await page.waitForFunction((l) => document.querySelector('[data-testid=toast]').textContent.length > 0 && window.__warehouseSession.state.status !== 'saving', label, { timeout: 60000 });
  assert.equal(await toast(page), `JSON ${label} 복원 완료 · 저장 후 읽기 확인`);
  assert.equal(await page.evaluate(() => window.__warehouseSession.state.status), 'saved');
}

test('E1: 23.9MB JSON → 앱 JSON 저장(크기 경고) → 다시 불러오기, 12.1MB ZIP 불러오기', { timeout: 180000 }, async () => {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
  page.on('dialog', (d) => d.accept());
  await page.goto(fileUrl);
  await page.waitForFunction(() => window.__warehouseView && document.querySelector('[data-testid=plan] g[data-id]'));
  await page.evaluate(() => window.__warehouseSession.save());
  assert.equal(await page.evaluate(() => window.__warehouseSession.state.status), 'saved');
  assert.equal(await page.locator('[data-testid=import-file]').getAttribute('accept'), '.json,application/json,.zip,application/zip');

  const big = sizedProject(23.9e6);
  await importAndWait(page, { name: 'syn-23_9.json', mimeType: 'application/json', buffer: Buffer.from(big.text) }, 'syn-23_9.json');
  assert.equal(await racksBefore(page), 400);

  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('[data-testid=export]').click()]);
  const exported = fs.readFileSync(await dl.path());
  assert.ok(exported.length > 12e6 && exported.length <= 24e6, String(exported.length));
  assert.ok(Math.abs(exported.length - Buffer.byteLength(big.text)) < 200, '불러온 뒤 다시 저장해도 크기가 거의 같음(저장 시각 등만 추가)');
  assert.match(await toast(page), /^JSON 파일 2\d\.\dMB · 불러오기 상한 24MB의 50%를 넘었습니다\. 이력\(/);

  const small = sizedProject(12.1e6, { racks: 200 });
  const zip = Buffer.from(JSON.parse(await packProject(JSON.stringify(small.project))).data, 'base64');
  await importAndWait(page, { name: 'syn-12_1.zip', mimeType: 'application/zip', buffer: zip }, 'syn-12_1.zip');
  assert.equal(await racksBefore(page), 200);

  await importAndWait(page, { name: 'exported.json', mimeType: 'application/json', buffer: exported }, 'exported.json');
  assert.equal(await racksBefore(page), 400);
  assert.deepEqual(problems, []);
  await ctx.close();
});
