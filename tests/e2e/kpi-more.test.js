// D-059: 상단 보관 가능 잔여 비중·최소 통로 폭, 오른쪽 공간 지표 5줄(잔여 비중·통로:랙 면적비·최소 통로 폭·BEFORE→AFTER 증감·평균 용적률).
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

const rows = (page) => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#spaceMetrics .metricline')].map((r) => [r.children[0].textContent, r.children[1].textContent])));

test('추가 공간 지표: 상단 8칸·오른쪽 5줄, 값 일치, BEFORE→AFTER 증감이 편집에 따라 바뀐다', async () => {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(fileUrl);
  await page.waitForFunction(() => window.__warehouseView);
  const labels = await page.$$eval('#topStats .stat small', (n) => n.map((e) => e.textContent));
  assert.deepEqual(labels, ['전체 창고 면적', '현재 랙 수', '랙 면적 점유율', '통로 비중', '보관 불가 구역 비중', '보관 가능 잔여 비중', '최소 통로 폭', '공간 경고']);
  let r = await rows(page);
  for (const k of ['보관 가능 잔여 비중', '통로 : 랙 면적비', '최소 통로 폭', 'BEFORE→AFTER 증감', '평균 용적률']) assert.ok(k in r, k);
  const area = Number(await page.textContent('#kArea'));
  const remain = Number(r['중복 제외 잔여 면적'].replace('㎡', ''));
  assert.equal(await page.textContent('#kRemainShare'), ((remain / area) * 100).toFixed(1));
  assert.equal(r['보관 가능 잔여 비중'], ((remain / area) * 100).toFixed(1) + '%');
  const aisle = Number(r['통로 / 작업 구역'].replace('㎡', '')), rack = Number(r['랙 면적 합계'].replace('㎡', ''));
  if (rack > 0) assert.ok(Math.abs(Number(r['통로 : 랙 면적비']) - aisle / rack) < 0.01);
  assert.match(r['평균 용적률'], /미확인|%/, '용적률 표시(가상 샘플은 Excel 높이 정보 없음)');

  // AFTER에서 랙 하나를 지우면 증감의 랙 수가 −1 만큼 바뀐다
  await page.locator('[data-testid=scenario-after]').click();
  await page.waitForFunction(() => window.__warehouseSession.state.project.settings.scenario === 'after');
  const n = await page.evaluate(() => { const P = window.__warehouseSession.state.project; return { b: P.scenarios.before.objects.filter((o) => o.kind === 'rack').length, a: P.scenarios.after.objects.filter((o) => o.kind === 'rack').length }; });
  if (n.a > 0 && n.b > 0) {
    const d0 = (await rows(page))['BEFORE→AFTER 증감'];
    await page.evaluate(() => window.__warehouseSession.apply('가상 삭제', (P) => { const i = P.scenarios.after.objects.findIndex((o) => o.kind === 'rack'); P.scenarios.after.objects.splice(i, 1); return { ok: true, project: P }; }));
    // 시험용 직접 수정(apply)은 화면을 다시 그리지 않으므로 시나리오를 바꿔 다시 그린다
    await page.locator('[data-testid=scenario-before]').click();
    await page.locator('[data-testid=scenario-after]').click();
    await page.waitForFunction((d) => document.querySelectorAll('#spaceMetrics .metricline')[7]?.children[1].textContent !== d, d0);
    const want = n.a - 1 - n.b;
    assert.match((await rows(page))['BEFORE→AFTER 증감'], new RegExp('^랙 ' + (want > 0 ? '\\+' : want < 0 ? '−' : '±') + Math.abs(want) + ' '));
  }
  assert.deepEqual(problems, []);
  await ctx.close();
});
