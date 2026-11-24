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
  // 샘플/수동 배치: 벽 이격만 활성(C6), 나머지 기준은 비활성
  assert.equal(await wall.isDisabled(), false);
  for (const k of ['columnGap', 'rackGap', 'aisleTarget']) assert.equal(await page.locator(`[data-testid=rule-${k}]`).isDisabled(), true);

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

test('D-057: 기준 기록이 없는 배치(예전 데이터)는 Excel 입력값을 미적용으로 표시하고, 고치면 그 배치에만 적용', async () => {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  await page.goto(fileUrl);
  await page.waitForFunction(() => window.__warehouseView);
  // 예전 데이터와 같은 구조: 배치에는 기록 없음, 프로젝트에만 Excel 입력값(가상 값)
  await page.evaluate(() => window.__warehouseSession.apply('가상 예전 데이터', (P) => {
    P.locationLayout = { ...(P.locationLayout || {}), columnGap: 0.6, rackGap: 0.2, wallGap: 0.1, aisleTarget: 1.2 };
    for (const k of ['before', 'after']) { delete P.scenarios[k].autoPlacementRules; delete P.scenarios[k].wallGap; P.scenarioMeta[k].locationLayout = { ...P.locationLayout }; }
    P.importHistory.push({ date: '2026-11-01', keys: [] });
    P.scenarioMeta.before.locked = false;
    return { ok: true, project: P };
  }));
  await page.locator('[data-testid=scenario-after]').click();
  const wall = page.locator('[data-testid=rule-wallGap]'), rack = page.locator('[data-testid=rule-rackGap]');
  await page.waitForFunction(() => !document.querySelector('[data-testid=rule-wallGap]').disabled);
  assert.equal(await page.locator('[data-testid=rule-state]').isVisible(), true, '미적용 안내');
  assert.deepEqual(await Promise.all(['columnGap', 'rackGap', 'wallGap', 'aisleTarget'].map((k) => page.locator(`[data-testid=rule-${k}]`).inputValue())), ['0.6', '0.2', '0.1', '1.2']);
  const beforeJson = await page.evaluate(() => JSON.stringify(window.__warehouseSession.state.project.scenarios.before));

  await rack.fill('0.25');
  await rack.dispatchEvent('change');
  await page.waitForFunction(() => window.__warehouseSession.state.project.scenarios.after.autoPlacementRules?.rackGap === 0.25);
  const r = await page.evaluate(() => window.__warehouseSession.state.project.scenarios.after.autoPlacementRules);
  assert.deepEqual(r, { mode: 'order', columnGap: 0.6, rackGap: 0.25, wallGap: 0.1, aisleTarget: 1.2 });
  assert.equal(await page.locator('[data-testid=rule-state]').isVisible(), false, '적용 후 안내 숨김');
  assert.equal(await page.evaluate(() => JSON.stringify(window.__warehouseSession.state.project.scenarios.before)), beforeJson, 'BEFORE 불변');
  // BEFORE로 전환하면 BEFORE는 여전히 미적용
  await page.locator('[data-testid=scenario-before]').click();
  await page.waitForFunction(() => window.__warehouseSession.state.project.settings.scenario === 'before');
  assert.equal(await page.locator('[data-testid=rule-state]').isVisible(), true);
  assert.equal(await rack.inputValue(), '0.2');
  assert.equal(await wall.isDisabled(), false);
  assert.deepEqual(problems, []);
  await ctx.close();
});
