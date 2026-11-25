// D8(D-085): Δ 지도 크게 보기(대화상자 안 최대화)·전체 화면·Esc 단계 복귀·랙 코드 표시·D7 강조 유지·더블클릭 분리.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { openSyntheticCompare } from './compare-helpers.js';

let browser;
before(async () => { browser = await chromium.launch({ headless: true, executablePath: process.env.WAREHOUSE_BROWSER_PATH || undefined }); });
after(async () => { await browser?.close(); });
/** 지도 축척(화면 px / m), 도면 폭(px), 보이는 Δ 라벨 최소 글자 px, 보이는 랙 코드 수. */
const measure = (page) => page.evaluate(() => {
  const svg = document.querySelector('[data-testid=compare-delta]'), k = svg.getScreenCTM().a, W = window.__warehouseSession.state.project.scenarios.after.warehouse.width;
  const fonts = [...svg.querySelectorAll('g[data-rack] .r-dl')].map((t) => Number(t.getAttribute('font-size')) * k);
  const codes = [...svg.querySelectorAll('.r-code')].filter((t) => getComputedStyle(t).display !== 'none');
  return { k, drawW: W * k, minFont: Math.min(...fonts), codes: codes.length, codeText: codes[0]?.textContent ?? '', max: document.querySelector('[data-testid=compare-dialog]').classList.contains('r-max'), open: document.querySelector('[data-testid=compare-dialog]').open, full: !!document.fullscreenElement };
});

test('1366×768: 크게 보기 → 축척 2배 이상, Δ 라벨 9pt(12px) 이상, 랙 코드 표시, D7 강조·발표 모드 유지', async () => {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  await openSyntheticCompare(page);
  const base = await measure(page);
  assert.equal(base.codes, 0, '2단에서는 랙 코드 숨김');
  await page.locator('tr[data-metric=M8]').click();
  const btn = page.locator('[data-testid=compare-max]');
  assert.equal(await btn.getAttribute('aria-label'), 'Δ 지도 크게 보기');
  await btn.click();
  const z = await measure(page);
  assert.equal(z.max, true);
  assert.ok(z.k / base.k >= 2, `축척 ${base.k.toFixed(1)} → ${z.k.toFixed(1)}px/m (${(z.k / base.k).toFixed(2)}배)`);
  assert.ok(z.minFont >= 12, `Δ 라벨 최소 ${z.minFont.toFixed(1)}px`);
  assert.ok(z.codes >= 40, `랙 코드 ${z.codes}개`);
  assert.match(z.codeText, /^[A-K]-\d$/);
  assert.equal(await page.locator('[data-testid=compare-delta] g[data-rack].on').count(), 12, 'D7 강조 유지');
  assert.equal(await page.locator('[data-testid=compare-delta-legend]').isVisible(), true, '범례 유지');
  assert.equal(await page.locator('[data-testid=compare-full]').getAttribute('aria-label'), 'Δ 지도 전체 화면(F)');
  await page.locator('[data-testid=compare-present]').check();
  const zp = await measure(page);
  assert.equal(zp.max, true, '발표 모드 전환 후에도 크게 보기 유지');
  assert.ok(zp.k / base.k >= 2);
  const noOverlap = await page.evaluate(() => { const rs = [...document.querySelectorAll('[data-testid=compare-delta] text')].filter((t) => getComputedStyle(t).display !== 'none').map((t) => t.getBoundingClientRect()).filter((r) => r.width); let n = 0; for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) { const a = rs[i], b = rs[j]; if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) n++; } return n; });
  assert.equal(noOverlap, 0, 'Δ·랙 코드 라벨 겹침 0');
  assert.equal(await page.evaluate(() => window.__warehouseSession.state.project.settings.compareView?.zoom), undefined, '확대 상태는 저장하지 않음');
  assert.deepEqual(problems, []);
  await ctx.close();
});

test('키보드만으로: Enter 크게 보기 → F 전체 화면 → Esc 전체 화면 해제 → Esc 2단 → Esc 강조 해제 → Esc 닫기', async () => {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  await openSyntheticCompare(page);
  await page.locator('tr[data-metric=M9]').focus();
  await page.keyboard.press('Enter');
  await page.locator('[data-testid=compare-max]').focus();
  await page.keyboard.press('Enter');
  assert.equal((await measure(page)).max, true);
  await page.keyboard.press('f');
  await page.waitForFunction(() => !!document.fullscreenElement);
  assert.equal((await measure(page)).max, true, '전체 화면에서도 최대화 배치');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.fullscreenElement);
  let s = await measure(page);
  assert.equal(s.max, true, '전체 화면 → 최대화');
  await page.keyboard.press('Escape');
  s = await measure(page);
  assert.equal(s.max, false, '최대화 → 2단');
  assert.equal(s.open, true);
  assert.ok(await page.locator('[data-testid=compare-delta]').evaluate((e) => e.classList.contains('focus')), 'D7 강조는 아직 유지');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-testid=compare-delta]').evaluate((e) => e.classList.contains('focus')), false);
  await page.keyboard.press('Escape');
  assert.equal((await measure(page)).open, false);
  await ctx.close();
});

test('지도 더블클릭으로 크게 보기·복귀, D7 강조 상태 변화 0 · 1920×1080 크게 보기는 1366 2단 대비 2.8배 이상', async () => {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  await openSyntheticCompare(page);
  const base = await measure(page);
  await page.locator('tr[data-metric=M8]').click();
  const before = await page.evaluate(() => [...document.querySelectorAll('[data-testid=compare-delta] g.on')].map((g) => g.dataset.rack).join());
  await page.locator('[data-testid=compare-delta]').dblclick({ position: { x: 30, y: 30 } });
  assert.equal((await measure(page)).max, true);
  const mid = await page.evaluate(() => [...document.querySelectorAll('[data-testid=compare-delta] g.on')].map((g) => g.dataset.rack).join());
  assert.equal(mid, before, '더블클릭 후 강조 그대로');
  await page.locator('[data-testid=compare-delta]').dblclick({ position: { x: 30, y: 30 } });
  assert.equal((await measure(page)).max, false);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.locator('[data-testid=compare-max]').click();
  const big = await measure(page);
  assert.ok(big.k / base.k >= 2.8, `1920×1080 ${big.k.toFixed(1)} / 1366 2단 ${base.k.toFixed(1)} = ${(big.k / base.k).toFixed(2)}배`);
  await ctx.close();
});
