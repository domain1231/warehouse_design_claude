// D-054: Excel 자동 배치 후 자동 배치 기준(열·랙 간격, 벽 이격, 통로 목표)을 왼쪽 정밀 배치 설정에서 수정. 가상 자료만 사용.
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

const state = (page) => page.evaluate(() => {
  const p = window.__warehouseSession.state.project, l = p.scenarios[p.settings.scenario];
  return { rules: l.autoPlacementRules ? { ...l.autoPlacementRules } : null, wallGap: l.wallGap, pos: l.objects.filter((o) => o.kind === 'rack').map((o) => [o.x, o.y, o.rotation]), before: JSON.stringify(p.scenarios.before) };
});

test('자동 배치 기준: 배치 전 비활성 → Excel 적용 후 값 표시 → 수정 시 랙 위치 그대로·기준만 변경 → 잘못된 값 거부 → 실행취소', async () => {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(fileUrl);
  await page.waitForFunction(() => window.__warehouseView);
  await page.locator('[data-testid=scenario-after]').click().catch(() => {});
  const wall = page.locator('[data-testid=rule-wallGap]');
  // 샘플/수동 배치에는 자동 배치 기준이 없으면 비활성
  const hasRules = await page.evaluate(() => { const p = window.__warehouseSession.state.project; return !!p.scenarios[p.settings.scenario].autoPlacementRules; });
  assert.equal(await wall.isDisabled(), !hasRules);

  await page.locator('[data-testid=excel-open]').click();
  await page.locator('[data-testid=excel-file]').setInputFiles(path.join(root, 'fixtures/excel/synthetic-basic.xlsx'));
  await page.waitForFunction(() => /유효/.test(document.querySelector('[data-testid=excel-summary]').textContent));
  await page.locator('[data-testid=excel-dims] select').selectOption('1');
  await page.locator('[data-testid=excel-config] [name=target]').selectOption('after');
  await page.locator('[data-testid=excel-config] [name=mode]').selectOption('new');
  await page.locator('[data-testid=excel-config] [name=building]').fill('SYN');
  await page.locator('[data-testid=excel-config] [name=wallGap]').fill('0.15');
  await page.locator('[data-testid=excel-config] [name=source]').fill('가상 자료');
  await page.locator('[data-testid=excel-config] [name=source]').dispatchEvent('change');
  await page.locator('[data-testid=excel-config] [name=skip]').check();
  await page.waitForFunction(() => /적용 후/.test(document.querySelector('[data-testid=excel-pstats]').textContent));
  await page.locator('#rTargetConfirm').check();
  if (/경고 확인/.test(await page.locator('[data-testid=excel-apply]').textContent())) {
    await page.locator('#exAllowWarnings').check();
    await page.locator('[data-testid=excel-ack]').check();
  }
  await page.locator('[data-testid=excel-apply]').click();
  await page.waitForFunction(() => window.__warehouseSession.state.project.importHistory.length === 1 && window.__warehouseSession.state.status === 'saved');

  const s0 = await state(page);
  assert.ok(s0.rules, 'Excel 적용 후 자동 배치 기준 저장');
  assert.equal(await wall.isDisabled(), false);
  assert.equal(Number(await wall.inputValue()), s0.rules.wallGap);
  assert.equal(s0.rules.wallGap, 0.15);
  assert.equal(Number(await page.locator('[data-testid=rule-rackGap]').inputValue()), s0.rules.rackGap);

  await wall.fill('0.05');
  await wall.dispatchEvent('change');
  await page.waitForFunction(() => { const p = window.__warehouseSession.state.project; return p.scenarios[p.settings.scenario].autoPlacementRules.wallGap === 0.05; });
  const s1 = await state(page);
  assert.equal(s1.wallGap, 0.05, '외벽 이격 검사 기준(layout.wallGap)도 함께 변경');
  assert.deepEqual(s1.pos, s0.pos, '랙 위치·회전은 그대로');
  assert.equal(s1.before, s0.before, 'BEFORE는 변경되지 않는다');
  assert.equal(s1.rules.rackGap, s0.rules.rackGap);

  const rack = page.locator('[data-testid=rule-rackGap]');
  await rack.fill('0.1234');
  await rack.dispatchEvent('change');
  await page.waitForTimeout(150);
  assert.equal((await state(page)).rules.rackGap, s0.rules.rackGap, '0.001m 단위가 아니면 거부');
  assert.equal(Number(await rack.inputValue()), s0.rules.rackGap, '거부되면 입력란도 기존 값으로 복귀');
  await rack.fill('51');
  await rack.dispatchEvent('change');
  await page.waitForTimeout(150);
  assert.equal((await state(page)).rules.rackGap, s0.rules.rackGap, '50m 초과 거부');

  await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.keyboard.press('Control+z');
  await page.waitForFunction(() => { const p = window.__warehouseSession.state.project; return p.scenarios[p.settings.scenario].autoPlacementRules?.wallGap === 0.15; });
  assert.equal(Number(await wall.inputValue()), 0.15, '실행취소 후 입력란도 복귀');
  assert.deepEqual(problems, []);
  await ctx.close();
});
