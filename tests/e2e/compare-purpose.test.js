// C2: 비교 대화상자 첫 화면의 목적 지표 표·공간 구성 막대·배치 변경 요약, 세부 지표 정리.
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
const click = (page, id) => page.locator(`[data-testid=${id}]`).click();

test('비교 목적 지표: 표 순서·툴팁, 구성 막대 합 100%, 배치 변경 요약, 세부 지표 정리', async () => {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(fileUrl);
  await page.waitForFunction(() => window.__warehouseView && document.querySelector('[data-testid=plan] g[data-id]'));
  // AFTER를 BEFORE의 독립 복제로 만든다(변경 없음).
  await click(page, 'scenario-clone');
  await page.locator('[data-testid=clone-choice]').selectOption('replace');
  await click(page, 'clone-apply');
  await page.waitForFunction(() => window.__warehouseSession.state.project.layoutBackups.length === 1);
  await page.locator('[data-testid=clone-dialog]').waitFor({ state: 'hidden' });

  await click(page, 'scenario-compare');
  const P = page.locator('[data-testid=compare-purpose]');
  assert.deepEqual(await P.locator('tr[data-metric] td:first-child').allTextContents(), ['평균 용적률', '80% 미만 로케이션', '빈 랙', '저활용 랙', '통로 비중', '공간 구성', '보관 가능 합계', '선반 여유 용적', '최소 통로 폭']);
  for (const t of await P.locator('tr[data-metric]').evaluateAll((l) => l.map((x) => x.title))) assert.ok(t);
  const bars = P.locator('[data-testid=compare-composition] .r-comp-row');
  assert.equal(await bars.count(), 2);
  for (const w of await bars.evaluateAll((l) => l.map((r) => [...r.querySelectorAll('.seg')].map((s) => parseFloat(s.style.width))))) {
    if (w.length) assert.ok(Math.abs(w.reduce((a, b) => a + b, 0) - 100) <= 0.5, `합 ${w}`);
  }
  assert.equal(await page.locator('[data-testid=compare-changes]').count(), 0);
  const M = await page.locator('[data-testid=compare-metrics]').textContent();
  assert.ok(!M.includes('데이터 기준일') && !M.includes('복수 유형 집계'));
  assert.ok(M.includes('전체 랙 수'));
  await click(page, 'compare-close');

  // AFTER 랙 하나 이동 → 배치 변경 요약 표시
  await page.evaluate(() => window.__warehouseSession.apply('가상 이동', (P) => { P.scenarios.after.objects.find((o) => o.kind === 'rack').x += 0.5; return { ok: true, project: P }; }));
  await click(page, 'scenario-compare');
  assert.match(await page.locator('[data-testid=compare-changes]').textContent(), /이동 1/);
  assert.deepEqual(problems, []);
  await ctx.close();
});
