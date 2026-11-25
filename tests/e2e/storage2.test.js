// 실제 브라우저(file://, 오프라인) Phase 8 저장소 화면: 이전 버전·백업 복원, 저장소 진단, JSON 불러오기, 저장 공간 부족 문구.
// 기준본 75 V.renderBackups·V.storageSnapshot·V.install, 30 readFile.
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
before(async () => {
  browser = await chromium.launch({ headless: true, executablePath: process.env.WAREHOUSE_BROWSER_PATH || undefined });
});
after(async () => {
  await browser?.close();
});

const quotaHook = () => {
  const original = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    if (window.__failSlots && String(key).includes(':slot-')) throw new DOMException('quota', 'QuotaExceededError');
    return original.call(this, key, value);
  };
};

async function open() {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1400, height: 1500 }, acceptDownloads: true });
  await ctx.addInitScript(quotaHook);
  const page = await ctx.newPage();
  page.problems = [];
  page.on('pageerror', (e) => page.problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && page.problems.push(`console: ${m.text()}`));
  page.on('request', (r) => !/^(file|data|blob):/.test(r.url()) && page.problems.push(`network: ${r.url()}`));
  page.on('dialog', (d) => d.accept());
  await page.goto(fileUrl);
  await page.waitForFunction(() => window.__warehouseView && document.querySelector('[data-testid=plan] g[data-id]'));
  return { ctx, page };
}
const rackCount = (page) => page.evaluate(() => window.__warehouseSession.state.project.scenarios.after.objects.filter((o) => o.kind === 'rack').length);
const waitSaved = (page) => page.waitForFunction(() => document.querySelector('[data-testid=status]').dataset.state === 'saved');
const screen = (page, x, y) => page.evaluate(([x, y]) => {
  const svg = document.querySelector('[data-testid=plan]');
  const pt = svg.createSVGPoint();
  pt.x = x;
  pt.y = y;
  const s = pt.matrixTransform(svg.getScreenCTM());
  return { x: s.x, y: s.y };
}, [x, y]);
async function deleteTwoRacks(page) {
  await page.locator('[data-testid=allow-warnings]').check();
  const racks = await page.evaluate(() => window.__warehouseSession.state.project.scenarios.after.objects.filter((o) => o.kind === 'rack'));
  for (const [i, r] of [racks[12], racks[13]].entries()) {
    const c = await screen(page, r.x + r.width / 2, r.y + r.depth / 2);
    if (i) await page.keyboard.down('Shift');
    await page.mouse.click(c.x, c.y);
    if (i) await page.keyboard.up('Shift');
  }
  await page.keyboard.press('Delete');
  await page.waitForFunction(() => window.__warehouseSession.state.project.scenarios.after.objects.filter((o) => o.kind === 'rack').length === 45);
  await waitSaved(page);
}
const toastText = (page) => page.locator('[data-testid=toast]').textContent();

test('대량 삭제 전 백업이 목록에 보이고, 복원하면 랙이 돌아오며 실행취소도 된다', async () => {
  const { ctx, page } = await open();
  await deleteTwoRacks(page);
  await page.locator('[data-testid=versions-open]').click();
  const row = page.locator('[data-testid=backup-row]', { hasText: '대량 객체 삭제 전' });
  await row.waitFor();
  assert.match(await row.textContent(), /BEFORE \+ AFTER/);
  // D-077: 시각은 한국 시각으로 표시하고 원래 ISO는 title에 남긴다
  assert.doesNotMatch(await row.textContent(), /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  assert.match(await row.locator('span[title]').first().getAttribute('title'), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
  const [dl] = await Promise.all([page.waitForEvent('download'), row.locator('[data-testid=backup-download]').click()]);
  assert.match(dl.suggestedFilename(), /^warehouse_previous_\d+\.json$/);
  await row.locator('[data-testid=backup-restore]').click();
  await page.waitForFunction(() => window.__warehouseSession.state.project.scenarios.after.objects.filter((o) => o.kind === 'rack').length === 47);
  await waitSaved(page);
  assert.match(await toastText(page), /프로젝트 이전 버전 복원 완료 · 저장 후 읽기 확인/);
  await page.locator('[data-testid=undo]').click();
  await page.waitForFunction(() => window.__warehouseSession.state.project.scenarios.after.objects.filter((o) => o.kind === 'rack').length === 45);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('저장소 관리: 행에 숫자가 보이고 현재 JSON을 내려받는다, 복구 JSON이 없으면 안내', async () => {
  const { ctx, page } = await open();
  await deleteTwoRacks(page);
  await page.locator('[data-testid=storage-open]').click();
  const summary = page.locator('[data-testid=storage-summary]');
  await page.waitForFunction(() => /실제 저장 · 프로젝트 백업/.test(document.querySelector('[data-testid=storage-summary]').textContent));
  const rows = await summary.locator('tr').evaluateAll((trs) => trs.map((tr) => [tr.querySelector('th').textContent, tr.querySelector('td').textContent]));
  const get = (label) => rows.find((r) => r[0] === label)?.[1];
  for (const label of ['현재 메모리 JSON · UTF8', '압축 저장 후보 · UTF8', '실제 저장 · 기본 프로젝트 · UTF8', '실제 저장 · 직전 확인 저장 · UTF8', '실제 저장 · 프로젝트 백업 · UTF8']) {
    assert.match(get(label), /^[\d,]+ bytes/, label);
    assert.notEqual(get(label), '0 bytes', label);
  }
  assert.match(get('앱 키+값'), /UTF8: [\d,]+ bytes/);
  assert.equal(get('현재 저장 상태'), '저장됨 (SAVED)');
  assert.match(await page.textContent('[data-testid=storage-estimate]'), /estimate/);
  assert.match(await page.textContent('[data-testid=storage-metrics]'), /wholeOriginAndApplication/);
  // F-031: 상세 진단 JSON의 크기·키·슬롯 단계
  const m = JSON.parse(await page.textContent('[data-testid=storage-metrics]'));
  assert.equal(m.status, 'saved');
  assert.ok(m.currentMemory.valid && m.currentMemory.projectJSONUTF8Bytes > 0);
  assert.ok(m.packedCurrentCandidate.packedUTF8Bytes > 0 && !m.packedCurrentCandidate.errorType);
  const { primary, lastGood, projectBackups } = m.actualStoredEntries;
  assert.match(primary.key, /^warehouse-layout-v2:slot-[ab]$/);
  assert.match(lastGood.key, /^warehouse-layout-v2:slot-[ab]$/);
  assert.notEqual(primary.key, lastGood.key);
  assert.ok(primary.present && primary.valueUTF8Bytes > 0 && primary.errorType === null);
  assert.ok(projectBackups.present && projectBackups.valueUTF8Bytes > 0);
  const o = m.wholeOriginAndApplication;
  assert.ok(o.complete && o.readKeys >= 3 && o.appUTF8Bytes > 0 && o.utf8Bytes >= o.appUTF8Bytes);
  assert.ok(m.lastConfirmedSave);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('[data-testid=storage-download]').click()]);
  assert.match(dl.suggestedFilename(), /^warehouse_project_v2_3_6_\d{4}-\d{2}-\d{2}\.json$/);
  assert.equal(JSON.parse(fs.readFileSync(await dl.path(), 'utf8')).scenarios.after.objects.filter((o) => o.kind === 'rack').length, 45);
  await page.locator('[data-testid=storage-recovery]').click();
  assert.equal(await toastText(page), '검증된 적용 전 복구 JSON이 없습니다. 현재 프로젝트 JSON을 확인하세요.');
  assert.equal(await page.locator('[data-testid=recovery-download]').isHidden(), true);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('JSON 불러오기: 내보낸 파일로 교체하고 적용 전 백업을 만든다, 12MB 초과·형식 오류는 거부', async () => {
  const { ctx, page } = await open();
  await deleteTwoRacks(page);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('[data-testid=export]').click()]);
  const exported = fs.readFileSync(await dl.path(), 'utf8');
  await page.locator('[data-testid=undo]').click(); // 현재 47랙(저장됨), 파일은 45랙
  await page.waitForFunction(() => window.__warehouseSession.state.project.scenarios.after.objects.filter((o) => o.kind === 'rack').length === 47);
  await waitSaved(page);
  await page.locator('[data-testid=import-file]').setInputFiles({ name: 'saved.json', mimeType: 'application/json', buffer: Buffer.from(exported) });
  await page.waitForFunction(() => window.__warehouseSession.state.project.scenarios.after.objects.filter((o) => o.kind === 'rack').length === 45);
  await waitSaved(page);
  assert.match(await toastText(page), /JSON saved\.json 복원 완료 · 저장 후 읽기 확인/);
  await page.locator('[data-testid=versions-open]').click();
  await page.locator('[data-testid=backup-row]', { hasText: 'JSON saved.json 적용 전' }).waitFor();
  await page.locator('[data-testid=backup-close]').click();
  await page.locator('[data-testid=import-file]').setInputFiles({ name: 'big.json', mimeType: 'application/json', buffer: Buffer.alloc(12e6 + 1, 32) });
  await page.waitForFunction(() => document.querySelector('[data-testid=toast]').textContent === '파일 처리 실패: 12MB 이하 파일만 지원합니다.');
  await page.locator('[data-testid=import-file]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{not json') });
  await page.waitForFunction(() => document.querySelector('[data-testid=toast]').textContent.startsWith('파일 처리 실패: '));
  assert.equal(await rackCount(page), 45);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('저장되지 않은 변경이 있으면 교체 보호 대화상자가 뜨고 취소하면 프로젝트를 유지한다', async () => {
  const { ctx, page } = await open();
  await deleteTwoRacks(page);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('[data-testid=export]').click()]);
  const exported = fs.readFileSync(await dl.path(), 'utf8');
  await page.evaluate(() => { window.__failSlots = true; });
  await page.fill('[data-testid=name]', 'UNSAVED-NAME');
  await page.locator('[data-testid=name]').dispatchEvent('change');
  await page.waitForFunction(() => document.querySelector('[data-testid=status]').dataset.state === 'error');
  await page.locator('[data-testid=import-file]').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from(exported) });
  const dialog = page.locator('[data-testid=replace-dialog]');
  await dialog.waitFor({ state: 'visible' });
  assert.match(await dialog.textContent(), /저장되지 않은 변경사항이 있습니다\. JSON x\.json로 교체하기 전에/);
  await page.locator('[data-testid=replace-cancel]').click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await page.inputValue('[data-testid=name]'), 'UNSAVED-NAME');
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('저장 공간 부족: 기준본 문구와 위험 안내를 보이고 프로젝트는 메모리에 남는다', async () => {
  const { ctx, page } = await open();
  await page.fill('[data-testid=name]', 'Q-BEFORE');
  await page.locator('[data-testid=name]').dispatchEvent('change');
  await waitSaved(page);
  await page.evaluate(() => { window.__failSlots = true; });
  await page.fill('[data-testid=name]', 'Q-AFTER');
  await page.locator('[data-testid=name]').dispatchEvent('change');
  await page.waitForFunction(() => document.querySelector('[data-testid=status]').dataset.state === 'error');
  const detail = await page.textContent('[data-testid=status-detail]');
  for (const t of ['저장 공간이 부족하여 저장에 성공하지 못했습니다.', '현재 작업은 메모리에 남아 있으며 저장되지 않았습니다 (UNSAVED).', 'JSON 백업을 보관하고 브라우저 저장 공간을 확인하세요.', 'localStorage의 실제 남은 용량은 알 수 없습니다.', '이전 저장에서 QuotaExceededError가 관측되었습니다.']) assert.ok(detail.includes(t), t);
  assert.equal(await page.evaluate(() => window.__warehouseSession.state.project.metadata.name), 'Q-AFTER');
  await page.locator('[data-testid=storage-open]').click();
  await page.waitForFunction(() => /QUOTA/.test(document.querySelector('[data-testid=storage-summary]').textContent));
  assert.deepEqual(page.problems, []);
  await ctx.close();
});
