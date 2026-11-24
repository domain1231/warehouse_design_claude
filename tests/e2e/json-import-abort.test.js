// JSON 불러오기: 브라우저가 파일 읽기를 중단(AbortError)해도 다시 읽어 교체하고, 끝내 실패하면 단계·해결 안내를 보인다.
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
before(async () => { browser = await chromium.launch({ headless: true, executablePath: process.env.WAREHOUSE_BROWSER_PATH || undefined }); });
after(async () => { await browser?.close(); });

async function open() {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.problems = [];
  page.on('pageerror', (e) => page.problems.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(fileUrl);
  await page.waitForFunction(() => window.__warehouseView);
  return { ctx, page };
}

test('f.text()가 AbortError여도 FileReader로 다시 읽어 교체한다', async () => {
  const { ctx, page } = await open();
  const json = await page.evaluate(() => { const p = structuredClone(window.__warehouseSession.state.project); p.metadata.name = '가상 불러오기 시험'; return JSON.stringify(p); });
  await page.evaluate(() => { File.prototype.text = () => Promise.reject(new DOMException('The operation was aborted.', 'AbortError')); });
  await page.setInputFiles('#jsonIn', { name: 'virtual.json', mimeType: 'application/json', buffer: Buffer.from(json) });
  // 교체 확인 창은 파일을 읽은 뒤에 열린다. 창이 열리거나(미저장 상태) 바로 교체될 때(저장됨 상태: confirm 자동 수락)까지 기다린다.
  await page.waitForFunction(() => document.querySelector('[data-testid=replace-dialog]')?.open || window.__warehouseSession.state.project.metadata.name === '가상 불러오기 시험');
  if (await page.evaluate(() => !!document.querySelector('[data-testid=replace-dialog]')?.open)) await page.click('[data-testid=replace-save]');
  await page.waitForFunction(() => window.__warehouseSession.state.project.metadata.name === '가상 불러오기 시험' && window.__warehouseSession.state.status === 'saved');
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('다시 읽기도 실패하면 실패 단계·오류 종류·해결 안내를 보여주고 현재 프로젝트를 유지한다', async () => {
  const { ctx, page } = await open();
  const name0 = await page.evaluate(() => window.__warehouseSession.state.project.metadata.name);
  await page.evaluate(() => {
    File.prototype.text = () => Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
    FileReader.prototype.readAsText = function () { Object.defineProperty(this, 'error', { value: new DOMException('The operation was aborted.', 'AbortError') }); setTimeout(() => this.onerror?.(), 0); };
  });
  await page.setInputFiles('#jsonIn', { name: 'virtual.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
  await page.waitForFunction(() => /파일 처리 실패: The operation was aborted\. \(읽기 단계 · AbortError\)/.test(document.querySelector('[data-testid=toast]')?.textContent || ''));
  assert.match(await page.textContent('[data-testid=toast]'), /로컬 폴더로 복사/);
  assert.equal(await page.evaluate(() => window.__warehouseSession.state.project.metadata.name), name0);
  assert.equal(await page.locator('#jsonIn').isDisabled(), false, '입력 다시 사용 가능');
  assert.deepEqual(page.problems, []);
  await ctx.close();
});
