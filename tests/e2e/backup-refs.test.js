// E5(D-089) 실제 브라우저(file://, 오프라인): 배치 이력이 쌓인 가상 프로젝트를 작은 JSON(백업 참조)으로 불러오고,
// 브라우저 저장본에도 참조로 저장된 뒤, 새로고침하면 메모리에는 참조 없이 원래 백업이 그대로 있는지.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { historyProject } from '../unit/size-fixture.js';
import { projectJsonText } from '../../src/persistence/project-file.js';

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

const backupsOf = (page) => page.evaluate(() => window.__warehouseSession.state.project.layoutBackups.map((b) => ({ id: b.id, ls: b.layoutSnapshots.length, es: b.excelSnapshots.length, refs: [...b.layoutSnapshots, ...b.excelSnapshots].filter((s) => s.$ref).length })));

test('E5: 백업 참조 파일 불러오기 → 브라우저 저장본도 참조 → 새로고침 후 백업 원래대로 · 기준본 호환 JSON 저장', { timeout: 120000 }, async () => {
  const ctx = await browser.newContext({ offline: true, viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
  page.on('dialog', (d) => d.accept());
  await page.goto(fileUrl);
  await page.waitForFunction(() => window.__warehouseView && document.querySelector('[data-testid=plan] g[data-id]'));
  await page.evaluate(() => window.__warehouseSession.save());

  const { p } = historyProject({ racks: 80, imports: 4 });
  const text = projectJsonText(p);
  assert.ok(text.includes('"$ref"'));
  const expected = p.layoutBackups.map((b) => ({ id: b.id, ls: b.layoutSnapshots.length, es: b.excelSnapshots.length, refs: 0 }));
  await page.locator('[data-testid=import-file]').setInputFiles({ name: 'history.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await page.waitForFunction(() => /history\.json 복원 완료/.test(document.querySelector('[data-testid=toast]').textContent) && window.__warehouseSession.state.status === 'saved', null, { timeout: 60000 });
  assert.deepEqual(await backupsOf(page), expected);

  const slotHasRefs = await page.evaluate(async () => {
    const keys = Object.keys(localStorage).filter((k) => /:slot-[ab]$/.test(k));
    const raws = keys.map((k) => localStorage.getItem(k));
    const { data } = JSON.parse(raws.sort((a, b) => b.length - a.length)[0]);
    const bin = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const view = new DataView(bin.buffer), nameLen = view.getUint16(26, true), size = view.getUint32(18, true);
    const body = bin.subarray(30 + nameLen, 30 + nameLen + size);
    const out = await new Response(new Blob([body]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
    return out.includes('"$ref"');
  });
  assert.ok(slotHasRefs, '브라우저 저장본에 백업 참조');

  await page.reload();
  await page.waitForFunction(() => window.__warehouseView && window.__warehouseSession?.state.status === 'saved', null, { timeout: 60000 });
  assert.deepEqual(await backupsOf(page), expected, '새로고침 후 메모리 백업은 참조 없이 원래대로');

  await page.locator('[data-testid=storage-open]').click();
  await page.locator('[data-testid=json-format]').selectOption('legacy');
  await page.locator('[data-testid=storage-close]').click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('[data-testid=export]').click()]);
  const legacy = fs.readFileSync(await dl.path(), 'utf8');
  assert.ok(!legacy.includes('"$ref"') && legacy.includes('\n  "'), '기준본 호환 JSON: 참조 없음 · 들여쓰기');
  assert.deepEqual(JSON.parse(legacy).layoutBackups.map((b) => b.layoutSnapshots.length), expected.map((b) => b.ls));
  assert.deepEqual(problems, []);
  await ctx.close();
});
