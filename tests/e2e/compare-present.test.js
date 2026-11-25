// D2(D-079): Δ 지도 발표 모드(바탕 글자 숨김·Δ 크게, 라벨 겹침 0)·열 단위 요약·범례 고정·설정 JSON 저장.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { openSyntheticCompare } from './compare-helpers.js';

let browser;
before(async () => { browser = await chromium.launch({ headless: true, executablePath: process.env.WAREHOUSE_BROWSER_PATH || undefined }); });
after(async () => { await browser?.close(); });

/** Δ 지도 안 모든 text의 화면 사각형이 서로 겹치는 쌍 수. */
const overlaps = (page) => page.evaluate(() => {
  const rs = [...document.querySelectorAll('[data-testid=compare-delta] text')].map((t) => t.getBoundingClientRect()).filter((r) => r.width && r.height);
  let n = 0;
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) { const a = rs[i], b = rs[j]; if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) n++; }
  return { n, count: rs.length };
});

test('발표 모드: 바탕 도면 글자 숨김 · Δ 라벨이 일반 모드보다 큼 · 라벨 겹침 0 · 설정 저장', async () => {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  await openSyntheticCompare(page);
  const legend = page.locator('[data-testid=compare-delta-legend]');
  assert.match(await legend.innerText(), /\? Excel 미연결 \d+/);
  assert.match(await legend.innerText(), /비움\(이전 완료\) 12/);
  assert.ok(await page.evaluate(() => { const l = document.querySelector('[data-testid=compare-delta-legend]'), s = document.querySelector('[data-testid=compare-delta]'); return !!(l.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING); }), '범례가 지도 위');
  assert.equal(await page.locator('[data-delta-head]').evaluate((e) => getComputedStyle(e).position), 'sticky');
  const fsOf = () => page.locator('[data-testid=compare-delta] g[data-rack] text').first().evaluate((t) => Number(t.getAttribute('font-size')));
  const normalFs = await fsOf();
  assert.ok(await page.locator('[data-testid=compare-delta] g[opacity] text').count() > 0, '일반 모드는 바탕 글자 있음');

  await page.locator('[data-testid=compare-present]').check();
  await page.waitForFunction(() => window.__warehouseSession.state.project.settings.compareView?.presentation === true);
  assert.equal(await page.locator('[data-testid=compare-delta] g[opacity] text').count(), 0, '통로 이름·치수·구조물 이름·랙 태그 숨김');
  assert.ok((await fsOf()) > normalFs * 1.5, 'Δ 값 크게');
  assert.match(await page.locator('[data-testid=compare-delta] g[data-rack] text').first().textContent(), /^[+−±]\d+$/, '발표 모드는 정수 %p');
  const o = await overlaps(page);
  assert.ok(o.count >= 56, `라벨 ${o.count}개`);
  assert.equal(o.n, 0, '라벨 겹침 0');

  await page.locator('[data-testid=compare-close]').click();
  await page.locator('[data-testid=scenario-compare]').click();
  assert.equal(await page.locator('[data-testid=compare-present]').isChecked(), true, '다시 열어도 유지');
  assert.deepEqual(problems, []);
  await ctx.close();
});

test('열 단위 요약: 열마다 라벨 하나(열 평균 Δ), 비운 열은 비움 · 발표 모드에서도 겹침 0', async () => {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  await openSyntheticCompare(page);
  await page.locator('[data-testid=compare-unit]').selectOption('column');
  await page.waitForFunction(() => window.__warehouseSession.state.project.settings.compareView?.unit === 'column');
  const labels = await page.locator('[data-testid=compare-delta] text[data-col]').evaluateAll((ts) => ts.map((t) => [...t.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('')));
  assert.equal(labels.length, 10);
  assert.ok(labels.some((t) => /^I 비움/.test(t)) && labels.some((t) => /^A \+\d+\.\d/.test(t)), labels.join(' | '));
  assert.equal(await page.locator('[data-testid=compare-delta] g[data-rack] text').count(), 0, '랙 개별 라벨 없음');
  await page.locator('[data-testid=compare-present]').check();
  assert.equal((await overlaps(page)).n, 0);
  assert.deepEqual(await page.evaluate(() => window.__warehouseSession.state.project.settings.compareView), { presentation: true, unit: 'column' });
  await ctx.close();
});
