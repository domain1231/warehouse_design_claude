// D4(D-081): 비교표 'BEFORE → AFTER · 차이' 한 줄, 표 폭 720px 이하·줄바꿈 없음, 변화 0 행 흐림.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { openSyntheticCompare } from './compare-helpers.js';

let browser;
before(async () => { browser = await chromium.launch({ headless: true, executablePath: process.env.WAREHOUSE_BROWSER_PATH || undefined }); });
after(async () => { await browser?.close(); });

test('표 폭 ≤ 720px, 모든 칸 한 줄, 변화 0 행은 흐림', async () => {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  await openSyntheticCompare(page);
  const r = await page.evaluate(() => {
    const t = document.querySelector('[data-testid=compare-purpose] table.r-purpose');
    const lineH = parseFloat(getComputedStyle(t.querySelector('td')).lineHeight) || 18;
    return { width: t.getBoundingClientRect().width, head: [...t.querySelectorAll('th')].map((x) => x.textContent), wrapped: [...t.querySelectorAll('td')].filter((td) => td.getClientRects().length && td.getBoundingClientRect().height > lineH * 1.6 + 8).map((td) => td.textContent),
      zero: [...t.querySelectorAll('tr.r-zero')].map((tr) => [tr.dataset.metric, getComputedStyle(tr.querySelector('td')).opacity]), ba: t.querySelector('tr[data-metric=M3] td:nth-child(2)').textContent };
  });
  assert.deepEqual(r.head, ['목적 지표', 'BEFORE → AFTER', '차이']);
  assert.ok(r.width <= 720, `표 폭 ${r.width}`);
  assert.deepEqual(r.wrapped, [], '줄바꿈 없음');
  assert.match(r.ba, /^\d+\.\d% → \d+\.\d%$/);
  assert.ok(r.zero.length >= 2, `변화 0 행 ${JSON.stringify(r.zero)}`);
  assert.ok(r.zero.every(([, o]) => Number(o) === 0.5));
  assert.ok(r.zero.some(([id]) => id === 'M9') && r.zero.some(([id]) => id === 'M6'));
  await ctx.close();
});

test('D5: 공간 구성 막대 — 4% 이상 구간 숫자, 두 막대 사이 구간별 Δ, 바뀐 구간만 강조', async () => {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  await openSyntheticCompare(page);
  const r = await page.evaluate(() => {
    const C = document.querySelector('[data-testid=compare-composition]');
    const order = [...C.children].map((e) => e.dataset.bar || (e.matches('[data-testid=compare-composition-delta]') ? 'delta' : e.className));
    const segs = (k) => [...C.querySelectorAll(`[data-bar=${k}] .seg`)].map((s) => ({ n: s.dataset.seg, w: parseFloat(s.style.width), label: s.querySelector('b')?.textContent ?? '', changed: s.classList.contains('changed') }));
    const delta = [...C.querySelectorAll('[data-testid=compare-composition-delta] [data-seg]')].map((s) => ({ n: s.dataset.seg, text: s.textContent, zero: s.classList.contains('zero'), op: getComputedStyle(s).opacity }));
    return { order, before: segs('before'), after: segs('after'), delta };
  });
  assert.deepEqual(r.order.slice(0, 3), ['before', 'delta', 'after'], 'Δ는 두 막대 사이');
  for (const s of [...r.before, ...r.after]) {
    if (s.w >= 4) assert.match(s.label, /^\d+\.\d%$/, `${s.n} ${s.w}`);
    else assert.equal(s.label, '', `${s.n} ${s.w}% 미만은 숫자 없음`);
  }
  assert.equal(r.delta.length, 5);
  const by = Object.fromEntries(r.delta.map((d) => [d.n, d]));
  assert.match(by.emptyRack.text, /^빈 랙 \+\d+\.\d%p$/);
  assert.equal(by.emptyRack.zero, false);
  assert.match(by.aisle.text, /±0\.0%p$/);
  assert.equal(by.aisle.zero, true);
  assert.equal(Number(by.aisle.op), 0.45);
  for (const s of r.after) assert.equal(s.changed, !by[s.n].zero, `${s.n}: Δ≠0인 구간만 강조`);
  assert.ok(r.before.every((s) => !s.changed));
  await ctx.close();
});
