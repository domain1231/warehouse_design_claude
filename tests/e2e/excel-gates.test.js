// Phase 9b-6b(D-032): Excel 대화상자 적용 게이트·기본값·북쪽 표시 4방향·CSV·기존 객체 위치 선택. 가상 자료만 사용.
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

async function open(file) {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(fileUrl);
  await page.waitForFunction(() => window.__warehouseView);
  await page.locator('[data-testid=excel-open]').click();
  await page.locator('[data-testid=excel-file]').setInputFiles(path.join(root, 'fixtures/excel', file));
  await page.waitForFunction(() => /유효/.test(document.querySelector('[data-testid=excel-summary]').textContent));
  const cfg = (n) => page.locator(`[data-testid=excel-config] [name=${n}]`);
  return { ctx, page, problems, cfg };
}

test('Excel 기본값·고정 자동 백업·북쪽 표시 4방향·백업 버튼 숨김', async () => {
  const { ctx, page, problems, cfg } = await open('synthetic-many.xlsx');
  assert.deepEqual(await page.locator('#exNorth option').evaluateAll((o) => o.map((x) => x.value)), ['0', '90', '180', '270']);
  assert.equal(await cfg('building').inputValue(), 'B동');
  assert.equal(await cfg('source').inputValue(), '사용자 제공 Excel');
  assert.equal(await cfg('rotation').inputValue(), '90');
  assert.equal(await page.locator('#exRecordLayout').isChecked(), true);
  assert.equal(await page.locator('#exAllowWarnings').isChecked(), false);
  assert.equal(await page.locator('#rTargetConfirm').isChecked(), false);
  const backup = page.locator('#rTargetBox input[disabled]');
  assert.ok(await backup.isChecked());
  assert.match(await page.locator('#rTargetBox').textContent(), /적용 전 대상 자동 백업 \(필수 · 최신 최대 6개/);
  assert.equal(await page.locator('#rImportBackup').isHidden(), true);
  assert.equal(await page.locator('#exKeep option').first().textContent(), '병합/업데이트 시 선택 필요');
  await ctx.close();
  assert.deepEqual(problems, []);
});

test('Excel 적용 게이트: 대상 확인 → 경고 후 적용 허용 → 현재 경고 확인 순으로만 적용되고 북쪽 90이 저장된다', async () => {
  const { ctx, page, problems, cfg } = await open('synthetic-many.xlsx');
  await cfg('target').selectOption('after');
  await cfg('mode').selectOption('new');
  await cfg('keepManual').uncheck();
  await cfg('preserveStructures').uncheck();
  await cfg('width').fill('6');
  await cfg('depth').fill('4');
  await cfg('northRotation').selectOption('90');
  await page.waitForFunction(() => /선택 후보/.test(document.querySelector('[data-testid=excel-pstats]').textContent));
  const apply = page.locator('[data-testid=excel-apply]'), status = page.locator('[data-testid=excel-applymsg]');
  assert.ok(await apply.isDisabled());
  assert.match(await status.textContent(), /BEFORE\/AFTER 적용 대상을 확인해 주세요\./);
  await page.locator('#rTargetConfirm').check();
  assert.match(await apply.textContent(), /AFTER에 경고 확인 후 적용/, '좁은 창고는 경고가 있어야 한다');
  assert.ok(await apply.isDisabled());
  assert.match(await status.textContent(), /경고가 있는 배치를 적용하려면 경고 후 적용 허용을 확인해 주세요\./);
  await page.locator('#exAllowWarnings').check();
  assert.ok(await apply.isDisabled());
  assert.match(await status.textContent(), /현재 배치의 경고 확인을 체크해 주세요\./);
  await page.locator('#wAck').check();
  assert.ok(await apply.isEnabled());
  // 대상을 바꾸면 대상 확인이 해제되어 다시 차단된다
  await cfg('target').selectOption('before');
  assert.equal(await page.locator('#rTargetConfirm').isChecked(), false);
  assert.ok(await apply.isDisabled());
  await cfg('target').selectOption('after');
  await cfg('northRotation').selectOption('90'); // 대상 변경은 저장된 설정으로 칸을 다시 채운다(기준본 R.targetSettings)
  await page.locator('#rTargetConfirm').check();
  await page.locator('#wAck').check();
  assert.equal(await cfg('northRotation').inputValue(), '90');
  await apply.click();
  await page.waitForFunction(() => window.__warehouseSession.state.project.layoutBackups.length === 1 && window.__warehouseSession.state.status === 'saved');
  const r = await page.evaluate(() => { const p = window.__warehouseSession.state.project; return [p.scenarioMeta.after.locationLayout.northRotation, p.locationLayout.northRotation]; });
  assert.deepEqual(r, [90, 90]);
  await ctx.close();
  assert.deepEqual(problems, []);
});

test('Excel 기존 객체 위치 빈 선택은 병합 미리보기·적용을 막고, 검증 결과 CSV 파일명·머리글이 기준본과 같다', async () => {
  const { ctx, page, problems, cfg } = await open('synthetic-basic.xlsx');
  await page.locator('[data-testid=excel-dims] select').selectOption('1');
  await cfg('skip').check();
  await cfg('mode').selectOption('merge');
  assert.equal(await cfg('keep').inputValue(), 'keep', '모드 변경 시 빈 값은 keep으로 채워진다');
  await cfg('keep').selectOption('');
  await page.waitForFunction(() => /기존 객체의 위치 유지 또는 재배치를 선택하세요\./.test(document.querySelector('[data-testid=excel-pstats]').textContent));
  assert.ok(await page.locator('[data-testid=excel-apply]').isDisabled());
  assert.match(await page.locator('[data-testid=excel-applymsg]').textContent(), /기존 객체의 위치 유지 또는 재배치를 선택하세요\./);
  // 연동: keep → 수동 위치 유지 체크, 수동 위치 유지 해제 → reflow
  await cfg('keep').selectOption('keep');
  assert.equal(await cfg('keepManual').isChecked(), true);
  await cfg('keepManual').uncheck();
  assert.equal(await cfg('keep').inputValue(), 'reflow');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#exIssuesCsv').click()]);
  assert.equal(dl.suggestedFilename(), 'excel_import_validation.csv');
  const text = fs.readFileSync(await dl.path(), 'utf8');
  assert.match(text, /^﻿"구분","원본 행","내용"\r\n/);
  assert.match(text, /중복 로케이션/);
  await ctx.close();
  assert.deepEqual(problems, []);
});
