// D3(D-079): 1366×768에서 결론·KPI·Δ 지도가 스크롤 없이 보임(2단 배치), 발표용 PNG/PDF 1장 내보내기(오프라인).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { openSyntheticCompare } from './compare-helpers.js';

let browser;
before(async () => { browser = await chromium.launch({ headless: true, executablePath: process.env.WAREHOUSE_BROWSER_PATH || undefined }); });
after(async () => { await browser?.close(); });

test('1366×768: 결론·KPI·지도가 스크롤 없이 대화상자 안에 보이고, 지도는 오른쪽 열', async () => {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  await openSyntheticCompare(page);
  await page.waitForTimeout(200);
  const r = await page.evaluate(() => {
    const d = document.querySelector('[data-testid=compare-dialog]'), box = (s) => document.querySelector(s).getBoundingClientRect();
    const db = d.getBoundingClientRect();
    return { scroll: d.scrollTop, bottom: db.bottom, top: db.top, head: box('[data-testid=compare-conclusion]'), kpi: box('[data-testid=compare-kpis]'), map: box('[data-testid=compare-delta]'), left: box('.r-cmp-left') };
  });
  assert.equal(r.scroll, 0);
  for (const k of ['head', 'kpi', 'map']) assert.ok(r[k].top >= r.top && r[k].bottom <= r.bottom + 0.5 && r[k].height > 0, `${k} ${JSON.stringify(r[k])} / 대화상자 ${r.top}–${r.bottom}`);
  assert.ok(r.map.height >= 280, `지도 높이 ${r.map.height}`);
  assert.ok(r.map.left > r.left.right - 1, '지도는 오른쪽 열');
  await ctx.close();
});

test('발표용 PNG(1754×1240) · PDF(A4 가로 1쪽) 내보내기, 오프라인', async () => {
  const ctx = await browser.newContext({ offline: true, acceptDownloads: true, viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  await openSyntheticCompare(page);
  const save = async (id) => { const [dl] = await Promise.all([page.waitForEvent('download'), page.locator(`[data-testid=${id}]`).click()]); return { name: dl.suggestedFilename(), buf: fs.readFileSync(await dl.path()) }; };
  const png = await save('compare-present-png');
  assert.equal(png.name, 'warehouse_compare_presentation.png');
  assert.equal(png.buf.toString('latin1', 1, 4), 'PNG');
  assert.deepEqual([png.buf.readUInt32BE(16), png.buf.readUInt32BE(20)], [1754, 1240]);
  assert.ok(png.buf.length > 50_000, `PNG ${png.buf.length} bytes(지도 포함)`);
  const pdf = await save('compare-present-pdf');
  const t = pdf.buf.toString('latin1');
  assert.equal(pdf.name, 'warehouse_compare_presentation.pdf');
  assert.ok(t.startsWith('%PDF-1.4') && t.trimEnd().endsWith('%%EOF'));
  assert.equal((t.match(/\/Type \/Page\b/g) ?? []).length, 1, '1쪽');
  assert.match(t, /\/MediaBox \[0 0 842 595\]/);
  assert.deepEqual(problems, []);
  await ctx.close();
});
