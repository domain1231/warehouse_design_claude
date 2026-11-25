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
