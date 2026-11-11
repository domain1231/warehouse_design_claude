// 실제 브라우저(file://, 오프라인) 저장 시나리오. localStorage를 공유하는 같은 컨텍스트의 페이지로 다중 탭을 재현한다.
// 명세 SV01·SV02·SV04·SV05·SV10·SV11·SV12, 다중 탭 보호(F-037), CAD08(실행취소)의 저장 측면.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '../..');
const meta = JSON.parse(fs.readFileSync(path.join(root, 'dist/build-metadata.json'), 'utf8'));
const fileUrl = pathToFileURL(path.join(root, 'dist', meta.file)).href;
const legacyRaw = fs.readFileSync(path.join(root, 'fixtures/legacy/v2.4.1-primary.txt'), 'utf8');
const LEGACY_KEY = 'warehouse-studio-v1';

let browser;
before(async () => {
  browser = await chromium.launch({ headless: true, executablePath: process.env.WAREHOUSE_BROWSER_PATH || undefined });
});
after(async () => {
  await browser?.close();
});

// 저장 공간 부족 주입: window.__failSlots가 켜지면 슬롯 키 쓰기에서 QuotaExceededError
const quotaHook = () => {
  const original = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    if (window.__failSlots && String(key).includes(':slot-')) throw new DOMException('quota', 'QuotaExceededError');
    return original.call(this, key, value);
  };
};

async function context() {
  const ctx = await browser.newContext({ offline: true });
  await ctx.addInitScript(quotaHook);
  return ctx;
}

async function open(ctx) {
  const page = await ctx.newPage();
  page.problems = [];
  page.on('pageerror', (e) => page.problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && page.problems.push(`console: ${m.text()}`));
  page.on('request', (r) => !/^(file|data|blob):/.test(r.url()) && page.problems.push(`network: ${r.url()}`));
  await page.goto(fileUrl);
  await page.waitForFunction(() => window.__warehouseSession && document.querySelector('[data-testid=status]').dataset.state !== 'loading');
  return page;
}

const state = (page) => page.locator('[data-testid=status]').getAttribute('data-state');
const waitState = (page, s) => page.waitForFunction((v) => document.querySelector('[data-testid=status]').dataset.state === v, s);
async function rename(page, value) {
  await page.fill('[data-testid=name]', value);
  await page.locator('[data-testid=name]').dispatchEvent('change');
  await page.waitForFunction(() => !['saving', 'unsaved'].includes(document.querySelector('[data-testid=status]').dataset.state));
}
const nameValue = (page) => page.inputValue('[data-testid=name]');

test('새로 시작 → 이름 변경 자동 저장 → 새로고침 복원 (SV01·SV02·SV11)', async () => {
  const ctx = await context();
  const page = await open(ctx);
  assert.equal(await state(page), 'unsaved');
  assert.match(await page.textContent('[data-testid=summary]'), /AFTER 랙 47개 · 출처 new/);
  await rename(page, 'E2E 창고');
  assert.equal(await state(page), 'saved');
  await page.reload();
  await waitState(page, 'saved');
  assert.equal(await nameValue(page), 'E2E 창고');
  assert.match(await page.textContent('[data-testid=status-detail]'), /리비전 1/);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('실행취소·다시 실행이 저장되고 새로고침 후에도 유지된다 (CAD08 저장 측면)', async () => {
  const ctx = await context();
  const page = await open(ctx);
  await rename(page, 'A');
  await rename(page, 'B');
  await page.click('[data-testid=undo]');
  await waitState(page, 'saved');
  assert.equal(await nameValue(page), 'A');
  await page.reload();
  await waitState(page, 'saved');
  assert.equal(await nameValue(page), 'A');
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('기준본 v2.4.1 저장 데이터를 불러오고, 저장해도 기준본 키는 바꾸지 않는다 (SV10, D-006)', async () => {
  const ctx = await context();
  const page = await open(ctx);
  await page.evaluate(({ k, v }) => { localStorage.clear(); localStorage.setItem(k, v); }, { k: LEGACY_KEY, v: legacyRaw });
  await page.reload();
  await page.waitForFunction(() => document.querySelector('[data-testid=status]').dataset.state !== 'loading');
  assert.match(await page.textContent('[data-testid=notice]'), /기준본\(v2\.4\.1\)/);
  assert.equal(await nameValue(page), 'SYNTHETIC legacy fixture');
  assert.match(await page.textContent('[data-testid=summary]'), /출처 legacy/);
  await page.click('[data-testid=save]');
  await waitState(page, 'saved');
  assert.equal(await page.evaluate((k) => localStorage.getItem(k), LEGACY_KEY), legacyRaw);
  await page.reload();
  await waitState(page, 'saved');
  assert.match(await page.textContent('[data-testid=summary]'), /출처 slot-a/);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('저장 공간 부족: 실패를 표시하고 기존 저장본 보존, 재시도하면 저장 (SV04·SV05·SV12)', async () => {
  const ctx = await context();
  const page = await open(ctx);
  await rename(page, 'BEFORE-QUOTA');
  await page.evaluate(() => { window.__failSlots = true; });
  await rename(page, 'AFTER-QUOTA');
  assert.equal(await state(page), 'error');
  assert.match(await page.textContent('[data-testid=status-detail]'), /저장 공간이 부족/);
  assert.equal(await nameValue(page), 'AFTER-QUOTA');
  const other = await open(ctx); // 저장소에는 이전 저장본
  assert.equal(await nameValue(other), 'BEFORE-QUOTA');
  await other.close();
  await page.evaluate(() => { window.__failSlots = false; });
  await page.click('[data-testid=save]');
  await waitState(page, 'saved');
  const check = await open(ctx);
  assert.equal(await nameValue(check), 'AFTER-QUOTA');
  assert.deepEqual([...page.problems, ...check.problems], []);
  await ctx.close();
});

test('다른 탭이 먼저 저장하면 알림·덮어쓰기 차단, 확인 시에만 덮어쓴다 (F-037)', async () => {
  const ctx = await context();
  const a = await open(ctx);
  await rename(a, 'BASE');
  const b = await open(ctx);
  await rename(a, 'A-1');
  await b.waitForFunction(() => document.querySelector('[data-testid=notice]').textContent.includes('다른 탭'));
  await rename(b, 'B-1');
  assert.equal(await state(b), 'error');
  assert.match(await b.textContent('[data-testid=status-detail]'), /CONFLICT/);
  assert.equal(await b.isVisible('[data-testid=overwrite]'), true);
  const fresh = await open(ctx);
  assert.equal(await nameValue(fresh), 'A-1');
  await fresh.close();
  b.once('dialog', (d) => d.dismiss());
  await b.click('[data-testid=overwrite]');
  assert.equal(await state(b), 'error');
  b.once('dialog', (d) => d.accept());
  await b.click('[data-testid=overwrite]');
  await waitState(b, 'saved');
  const after = await open(ctx);
  assert.equal(await nameValue(after), 'B-1');
  await rename(a, 'A-2'); // 이제 A가 오래된 탭
  assert.equal(await state(a), 'error');
  assert.deepEqual([...a.problems, ...b.problems, ...after.problems], []);
  await ctx.close();
});
