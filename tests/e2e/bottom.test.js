// 실제 브라우저(file://, 오프라인) Phase 9b-5: 하단 패널(#sBottom)이 기준본 v2.4.1 구조·문구로 동작한다.
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
async function open() {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.problems = [];
  page.on('pageerror', (e) => page.problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && page.problems.push(`console: ${m.text()}`));
  page.on('request', (r) => !/^(file|data|blob):/.test(r.url()) && page.problems.push(`network: ${r.url()}`));
  page.on('dialog', (d) => d.accept());
  await page.goto(fileUrl);
  await page.waitForFunction(() => window.__warehouseView && document.querySelector('[data-testid=plan] g[data-id]'));
  await page.locator('[data-testid=bottom-toggle]').click();
  return { ctx, page };
}
const P = (page) => page.evaluate(() => window.__warehouseSession.state.project);
const rackOf = (p) => p.scenarios[p.settings.scenario].objects.filter((o) => o.kind === 'rack');
const csvFile = (text) => ({ name: 'inv.csv', mimeType: 'text/csv', buffer: Buffer.from(text, 'utf8') });
const toast = (page) => page.locator('[data-testid=toast]');

test('구역 머리글: ▾/▸ 토글, aria, 요약, 기준본 id', async () => {
  const { ctx, page } = await open();
  for (const id of ['bDatebar', 'bTopRow', 'bLowerRow', 'bInventoryRows', 'bLayoutRows', 'rackList', 'warnings', 'warningCount', 'measureResult', 'historyFirst', 'historyLast', 'saveSnapshot', 'csvIn', 'replaceCsv', 'rackCsv', 'bRackSort']) assert.equal(await page.locator('#' + id).count(), 1, id);
  assert.equal(await page.locator('#bExports').count(), 0);
  const heading = (k) => page.locator(`[data-bottom=${k}]`);
  const rackCount = rackOf(await P(page)).length;
  assert.equal(await heading('inventory').locator('.b-toggle-heading').textContent(), '▾ 재고기록');
  assert.equal(await heading('inventory').locator('.b-summary').textContent(), '기록 없음 · 0건');
  assert.equal(await heading('layout').locator('.b-toggle-heading').textContent(), '▾ 배치이력');
  assert.equal(await heading('racks').locator('.b-summary').textContent(), `${rackCount}개`);
  assert.equal(await heading('space').locator('.b-summary').textContent(), await page.locator('#warningCount').textContent());
  assert.equal(await heading('racks').getAttribute('aria-controls'), 'bContent-racks');
  assert.equal(await heading('racks').getAttribute('aria-label'), '랙 목록 접기');
  await heading('racks').click();
  await page.waitForFunction(() => window.__warehouseSession.state.project.panels.bottomSections.racks === false);
  assert.equal(await heading('racks').locator('.b-toggle-heading').textContent(), '▸ 랙 목록');
  assert.equal(await heading('racks').getAttribute('aria-expanded'), 'false');
  assert.equal(await heading('racks').getAttribute('aria-label'), '랙 목록 펼치기');
  assert.equal(await page.locator('#bContent-racks').isHidden(), true);
  await heading('racks').click();
  await page.waitForFunction(() => window.__warehouseSession.state.project.panels.bottomSections.racks === true);
  assert.equal(await heading('racks').locator('.b-toggle-heading').textContent(), '▾ 랙 목록');
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('재고 CSV 가져오기: 정상, 중복은 교체 허용 없이 차단, 오류는 전부 취소', async () => {
  const { ctx, page } = await open();
  const p0 = await P(page), [a, b] = rackOf(p0);
  const head = '날짜,랙ID,최대수량,현재수량,단위\n';
  await page.locator('#csvIn').setInputFiles(csvFile(`${head}2026-11-01,${a.id},100,40,${a.unit}\n2026-11-01,${b.id},,,${b.unit}\n`));
  await page.waitForFunction(() => window.__warehouseSession.state.project.inventoryHistory.length === 2);
  let p = await P(page);
  assert.deepEqual(p.inventoryHistory.map((r) => [r.rackId, r.quantity, r.capacity, r.source, r.scenario]), [[a.id, 40, 100, 'CSV 사용자 제공', p.settings.scenario], [b.id, null, null, 'CSV 사용자 제공', p.settings.scenario]]);
  assert.match(await toast(page).textContent(), /2개 재고 기록을 가져왔습니다/);
  assert.equal(await page.locator('[data-bottom=inventory] .b-summary').textContent(), '현재 2건 · 전체 2건');
  assert.match(await page.locator('#bInventoryRows').textContent(), /40 \/ 100 BOX40%/);
  assert.match(await page.locator('#bInventoryRows').textContent(), /미확인 \/ 미확인/);
  // 같은 날짜·랙: 교체 허용 없이는 차단되고 아무것도 바뀌지 않는다
  await page.locator('#csvIn').setInputFiles(csvFile(`${head}2026-11-01,${a.id},100,77,${a.unit}\n`));
  await page.waitForFunction(() => /중복 기록 · 교체 허용을 확인하세요/.test(document.querySelector('[data-testid=toast]').textContent));
  assert.deepEqual((await P(page)).inventoryHistory, p.inventoryHistory);
  // 둘째 행 오류면 첫 행도 반영하지 않는다
  await page.locator('#csvIn').setInputFiles(csvFile(`${head}2026-11-02,${a.id},100,5,${a.unit}\n2026-11-02,없는랙,1,1,${a.unit}\n`));
  await page.waitForFunction(() => /CSV 날짜·랙 ID·단위 오류/.test(document.querySelector('[data-testid=toast]').textContent));
  assert.equal((await P(page)).inventoryHistory.length, 2);
  // 교체 허용을 켜면 교체
  await page.locator('#replaceCsv').check();
  await page.locator('#csvIn').setInputFiles(csvFile(`${head}2026-11-01,${a.id},100,77,${a.unit}\n`));
  await page.waitForFunction((id) => window.__warehouseSession.state.project.inventoryHistory.find((r) => r.rackId === id).quantity === 77, a.id);
  assert.equal((await P(page)).inventoryHistory.length, 2);
  // 실행 취소로 되돌릴 수 있다
  await page.locator('[data-testid=undo]').click();
  await page.waitForFunction((id) => window.__warehouseSession.state.project.inventoryHistory.find((r) => r.rackId === id).quantity === 40, a.id);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('현재 재고·배치 저장: 재고 기록 생성, 배치 이력 함께 저장 선택, 날짜·출처 검증', async () => {
  const { ctx, page } = await open();
  const n = rackOf(await P(page)).length;
  await page.locator('#snapshotDate').fill('2026-11-03');
  await page.locator('#snapshotSource').fill('  ');
  await page.locator('#saveSnapshot').click();
  assert.match(await toast(page).textContent(), /유효한 날짜와 데이터 출처를 입력하세요/);
  assert.equal((await P(page)).inventoryHistory.length, 0);
  await page.locator('#snapshotSource').fill('현장 확인');
  await page.locator('#includeLayout').uncheck();
  await page.locator('#saveSnapshot').click();
  await page.waitForFunction((n) => window.__warehouseSession.state.project.inventoryHistory.length === n, n);
  let p = await P(page);
  assert.equal(p.layoutSnapshots.length, 0);
  assert.ok(p.inventoryHistory.every((r) => r.date === '2026-11-03' && r.source === '현장 확인' && r.quantity === null && r.capacity === null));
  await page.locator('#includeLayout').check();
  await page.locator('#saveSnapshot').click(); // 같은 날짜 → 교체 확인(자동 승인)
  await page.waitForFunction(() => window.__warehouseSession.state.project.layoutSnapshots.length === 1);
  p = await P(page);
  assert.equal(p.inventoryHistory.length, n);
  assert.equal(p.layoutSnapshots[0].date, '2026-11-03');
  assert.equal(p.layoutSnapshots[0].source, '현장 확인');
  assert.equal(await page.locator('[data-bottom=layout] .b-summary').textContent(), '1건');
  assert.match(await page.locator('#bLayoutRows').textContent(), /2026-11-03/);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('재고기록 범위·날짜·검색 필터와 전체 날짜, 배치이력 범위', async () => {
  const { ctx, page } = await open();
  const p0 = await P(page), [a, b] = rackOf(p0);
  await page.evaluate(([a, b]) => window.__warehouseSession.edit('시험 기록', (p) => {
    const add = (date, id, scenario, quantity, source) => p.inventoryHistory.push({ date, rackId: id, scenario, capacity: 10, quantity, unit: 'BOX', source });
    add('2026-11-01', a, 'after', 1, '가상A');
    add('2026-11-02', b, 'after', 2, '가상B');
    add('2026-11-02', a, 'before', 3, '가상C');
    add('2026-11-03', a, 'legacy', 4, '가상D');
  }), [a.id, b.id]);
  const rows = () => page.locator('#bInventoryRows tr');
  await page.waitForFunction(() => document.querySelectorAll('#bInventoryRows tr').length === 3); // 머리글 + 현재 편집안 2건
  assert.equal(await page.locator('#bInventoryPage').textContent(), '2건 · 1/1쪽');
  await page.locator('#rInventoryScope').selectOption('all');
  await page.waitForFunction(() => document.querySelectorAll('#bInventoryRows tr').length === 5);
  await page.locator('#rInventoryScope').selectOption('legacy');
  await page.waitForFunction(() => document.querySelectorAll('#bInventoryRows tr').length === 2);
  assert.match(await page.locator('#bInventoryRows').textContent(), /배치 미확인/);
  await page.locator('#rInventoryScope').selectOption('all');
  await page.locator('#bInventoryDate').fill('2026-11-02');
  await page.waitForFunction(() => document.querySelectorAll('#bInventoryRows tr').length === 3);
  await page.locator('#bInventoryQuery').fill('가상c');
  await page.waitForFunction(() => document.querySelectorAll('#bInventoryRows tr').length === 2);
  assert.equal(await page.locator('#bInventoryPage').textContent(), '1건 · 1/1쪽');
  await page.locator('#bInventoryClearDate').click();
  assert.equal(await page.locator('#bInventoryDate').inputValue(), '');
  await page.locator('#bInventoryQuery').fill('');
  await page.waitForFunction(() => document.querySelectorAll('#bInventoryRows tr').length === 5);
  assert.equal(await rows().count(), 5);
  await page.locator('#bInventoryQuery').fill('없는 값');
  await page.waitForFunction(() => document.querySelector('#bInventoryRows .b-empty'));
  assert.equal(await page.locator('#bInventoryRows .b-empty').textContent(), '기록 없음');
  // 배치이력 범위
  await page.evaluate(() => window.__warehouseSession.edit('시험 배치', (p) => {
    for (const k of ['before', 'after']) p.layoutSnapshots.push({ id: 'L-' + k, name: k, date: '2026-11-0' + (k === 'before' ? 1 : 2), scenario: k, recordedAt: '2026-11-05T00:00:00.000Z', source: 's', layout: structuredClone(p.scenarios[k]) });
  }));
  await page.waitForFunction(() => document.querySelectorAll('#bLayoutRows tbody tr').length === 1);
  await page.locator('#bLayoutScope').selectOption('all');
  await page.waitForFunction(() => document.querySelectorAll('#bLayoutRows tbody tr').length === 2);
  assert.equal(await page.locator('#bLayoutPage').textContent(), '2건 · 1/1쪽');
  assert.deepEqual(page.problems, []);
  await ctx.close();
});

test('랙 목록: 정렬·종류·적재율 필터, 행 role=button, 공간검토 배지', async () => {
  const { ctx, page } = await open();
  const total = await page.locator('#rackList [data-rack]').count();
  assert.equal(await page.locator('#rackList [data-rack]').first().getAttribute('role'), 'button');
  const codes = () => page.locator('#rackList [data-rack]').evaluateAll((rs) => rs.map((r) => r.textContent));
  await page.locator('#bRackSort').selectOption('codeDesc');
  await page.waitForFunction(() => window.__warehouseSession.state.project.panels.view.rackSort === 'codeDesc');
  const desc = await codes();
  assert.deepEqual(desc, [...desc].sort((x, y) => y.localeCompare(x, 'ko', { numeric: true })));
  await page.locator('#bRackSort').selectOption('code');
  await page.waitForFunction((first) => document.querySelector('#rackList [data-rack]').textContent !== first, desc[0]);
  const asc = await codes();
  assert.deepEqual(asc, [...asc].sort((x, y) => x.localeCompare(y, 'ko', { numeric: true })));
  await page.locator('#loadFilter').selectOption('over');
  await page.waitForFunction(() => document.querySelector('#rackList .empty')?.textContent === '해당 랙 없음');
  await page.locator('#loadFilter').selectOption('all');
  await page.locator('#typeFilter').selectOption('경량랙');
  await page.waitForFunction(() => document.querySelector('#rackList .empty')?.textContent === '해당 랙 없음');
  await page.locator('#typeFilter').selectOption('');
  await page.locator('#search').fill('a-70');
  await page.waitForFunction((n) => document.querySelectorAll('#rackList [data-rack]').length < n, total);
  await page.locator('#search').fill('');
  await page.waitForFunction((n) => document.querySelectorAll('#rackList [data-rack]').length === n, total);
  assert.match(await page.locator('#warningCount').textContent(), /^\d+건$/);
  assert.equal(await page.locator('#warnings li').count(), Number((await page.locator('#warningCount').textContent()).replace('건', '')) || 1);
  assert.deepEqual(page.problems, []);
  await ctx.close();
});
