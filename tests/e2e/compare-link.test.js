// D7(D-084): 비교표 지표 행·랙 변화 목록 행 → Δ 지도 강조, 다시 누르면 해제, Enter·Esc.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { openSyntheticCompare } from './compare-helpers.js';

let browser;
before(async () => { browser = await chromium.launch({ headless: true, executablePath: process.env.WAREHOUSE_BROWSER_PATH || undefined }); });
after(async () => { await browser?.close(); });
const state = (page) => page.evaluate(() => {
  const svg = document.querySelector('[data-testid=compare-delta]');
  return { focus: svg.classList.contains('focus'), on: [...svg.querySelectorAll('g[data-rack].on')].map((g) => g.dataset.rack).sort(), dim: [...svg.querySelectorAll('g[data-rack]:not(.on)')].slice(0, 1).map((g) => getComputedStyle(g).opacity)[0], note: document.querySelector('[data-testid=compare-focus-note]').textContent, open: document.querySelector('[data-testid=compare-dialog]').open };
});

test('빈 랙 행 클릭 → 빈 랙 12대만 강조, 다시 클릭 → 해제 · 연결 불가 지표 행은 반응 없음', async () => {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  await openSyntheticCompare(page);
  const row = page.locator('tr[data-metric=M8]');
  await row.click();
  let s = await state(page);
  assert.equal(s.focus, true);
  assert.equal(s.on.length, 12);
  assert.ok(s.on.every((id) => /^R-[IJK]\d$/.test(id)), s.on.join(','));
  assert.equal(Number(s.dim), 0.15, '나머지 랙은 흐림');
  assert.match(s.note, /지도 강조: 빈 랙 12대/);
  assert.equal(await row.getAttribute('aria-pressed'), 'true');
  await row.click();
  s = await state(page);
  assert.equal(s.focus, false);
  assert.equal(s.on.length, 0);
  await page.locator('tr[data-metric=M6]').click();
  assert.equal((await state(page)).focus, false, '통로 비중은 랙 연동 없음');
  assert.equal(await page.locator('tr[data-metric=M6]').getAttribute('tabindex'), null);
  assert.deepEqual(problems, []);
  await ctx.close();
});

test('키보드: 저활용/평균 행 Enter로 강조, Esc는 강조만 해제하고 대화상자 유지 · 랙 변화 목록 행은 그 랙만', async () => {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  await openSyntheticCompare(page);
  await page.locator('tr[data-metric=M3]').focus();
  await page.keyboard.press('Enter');
  let s = await state(page);
  assert.equal(s.on.length, 44, '평균 용적률에 들어간 랙 44대');
  await page.keyboard.press('Escape');
  s = await state(page);
  assert.equal(s.focus, false);
  assert.equal(s.open, true, 'Esc 첫 번째는 강조 해제');
  const first = page.locator('[data-change-table] tr[data-rack-id]').first();
  const id = await first.getAttribute('data-rack-id');
  await first.click();
  s = await state(page);
  assert.deepEqual(s.on, [id]);
  assert.match(s.note, /^지도 강조: 랙 /);
  await page.locator('[data-testid=compare-mode]').selectOption('sides');
  await page.locator('tr[data-metric=M8]').click();
  assert.equal(await page.locator('[data-testid=compare-mode]').inputValue(), 'delta', '다른 보기에서 누르면 Δ 지도로 전환');
  assert.equal((await state(page)).on.length, 12);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  assert.equal((await state(page)).open, false, '강조가 없으면 Esc로 닫힘');
  await ctx.close();
});
