// C3: Δ 용적률 지도 모드(기본 모드), 구간·라벨·변경 외곽선, 모드 전환.
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

test('Δ 지도: 기본 모드·구간·라벨·이동 외곽선·모드 전환', async () => {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(fileUrl);
  await page.waitForFunction(() => window.__warehouseView && document.querySelector('[data-testid=plan] g[data-id]'));
  await click(page, 'scenario-clone');
  await page.locator('[data-testid=clone-choice]').selectOption('replace');
  await click(page, 'clone-apply');
  await page.waitForFunction(() => window.__warehouseSession.state.project.layoutBackups.length === 1);
  await page.locator('[data-testid=clone-dialog]').waitFor({ state: 'hidden' });
  // 가상 높이: AFTER 랙 0은 +50%p 개선, 랙 1은 악화(BEFORE는 그대로).
  await page.evaluate(() => window.__warehouseSession.apply('가상 높이', (P) => {
    const row = (id, r) => ({ location: id + '-1-1-1', shelfHeight: 1000, materialHeight: r * 1000, rackWidth: 1000, rackDepth: 1000, rackHeight: 2000 });
    const link = (l) => { for (const o of l.objects) if (o.kind === 'rack') o.excel = { key: o.id, building: 'T', shelves: [{ level: 1, items: [row(o.id, 0.4)] }] }; };
    link(P.scenarios.before);
    link(P.scenarios.after);
    const racks = P.scenarios.after.objects.filter((o) => o.kind === 'rack');
    racks[0].excel.shelves[0].items[0].materialHeight = 950;
    racks[1].excel.shelves[0].items[0].materialHeight = 100;
    return { ok: true, project: P };
  }));
  await click(page, 'scenario-compare');
  assert.equal(await page.locator('[data-testid=compare-mode]').inputValue(), 'delta');
  const D = page.locator('[data-testid=compare-delta]');
  assert.ok(await D.isVisible());
  assert.ok(await page.locator('[data-testid=compare-delta-legend]').isVisible());
  assert.ok(await D.locator('g[data-bin] polygon').count() > 0);
  assert.ok(await D.locator('[data-bin=up40]').count() >= 1);
  assert.ok(await D.locator('[data-bin=worse]').count() >= 1);
  const labels = await D.locator('g[data-bin] text').allTextContents();
  assert.ok(labels.some((t) => t.startsWith('+')));
  assert.ok(labels.some((t) => t.startsWith('−')));
  assert.equal(await D.locator('[data-changed]').count(), 0);
  // AFTER 랙 이동 → 노랑 점선 외곽선, 화살표 없음
  await click(page, 'compare-close');
  await page.evaluate(() => window.__warehouseSession.apply('가상 이동', (P) => { P.scenarios.after.objects.find((o) => o.kind === 'rack').x += 0.5; return { ok: true, project: P }; }));
  await click(page, 'scenario-compare');
  assert.equal(await page.locator('[data-testid=compare-mode]').inputValue(), 'delta');
  assert.equal(await D.locator('[data-changed][stroke="#ffd54f"][stroke-dasharray]').count(), 1);
  assert.equal(await D.locator('path[stroke="#70b8ff"], marker').count(), 0);
  await page.locator('[data-testid=compare-mode]').selectOption('sides');
  assert.ok(await D.isHidden());
  assert.ok(await page.locator('#beforePlan').isVisible());
  assert.ok(await page.locator('#afterPlan').isVisible());
  assert.deepEqual(problems, []);
  await ctx.close();
});

test('AFTER 배치가 비면: 목적 지표 AFTER 칸 배치 없음·Δ 범례 안내', async () => {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(fileUrl);
  await page.waitForFunction(() => window.__warehouseView && document.querySelector('[data-testid=plan] g[data-id]'));
  await page.evaluate(() => window.__warehouseSession.apply('AFTER 비우기', (P) => { P.scenarios.after.objects = []; return { ok: true, project: P }; }));
  await click(page, 'scenario-compare');
  const rows = page.locator('[data-testid=compare-purpose] tr[data-metric]');
  for (let i = 0; i < await rows.count(); i++) {
    const c = await rows.nth(i).locator('td').allTextContents();
    assert.match(c[1], /→ 배치 없음$/, 'D4: BEFORE → AFTER 한 칸');
    assert.equal(c[2], '—');
  }
  assert.equal(await page.locator('[data-testid=compare-delta-legend]').textContent(), 'AFTER 배치가 없어 Δ를 계산할 수 없습니다.');
  assert.deepEqual(problems, []);
  await ctx.close();
});
