// D-039: 랙 텍스트 '랙 번호 + 높이 활용률' 선택 → 라벨이 높이 기준으로 바뀌고 저장·실행취소된다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '../..');
const meta = JSON.parse(fs.readFileSync(path.join(root, 'dist/build-metadata.json'), 'utf8'));

test('랙 번호 + 높이 활용률 라벨', async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.WAREHOUSE_BROWSER_PATH || undefined });
  try {
    const page = await (await browser.newContext({ offline: true, viewport: { width: 1600, height: 1000 } })).newPage();
    await page.goto(pathToFileURL(path.join(root, 'dist', meta.file)).href);
    await page.waitForSelector('[data-testid=plan] g.v-labels');
    const opts = await page.locator('#vLabelMode option').allTextContents();
    assert.deepEqual(opts, ['랙 번호만', '랙 번호 + 실제 적재율', '랙 번호 + 높이 활용률', '상세 정보', '최소 표시 · 선택 랙']);
    await page.selectOption('#vLabelMode', 'occupancy-height');
    // 샘플 랙은 좁아 기본 배율에선 비율 줄이 생략될 수 있다(기준본과 같은 맞춤 규칙) → 200%에서 확인
    await page.click('[data-testid=zoom-200]');
    await page.waitForFunction(() => document.querySelector('#plan').textContent.includes('높이'));
    const st = await page.evaluate(() => window.__warehouseSession.state.project.rackLabels);
    assert.equal(st.displayMode, 'occupancy');
    assert.equal(st.ratioSource, 'height');
    assert.ok(!(await page.locator('#plan').textContent()).includes('재고 미확인'));
    assert.equal(await page.locator('#vLabelMode').inputValue(), 'occupancy-height');
    await page.click('#undo');
    await page.waitForFunction(() => window.__warehouseSession.state.project.rackLabels.ratioSource === undefined);
    assert.equal(await page.locator('#vLabelMode').inputValue(), 'rack-code');
  } finally {
    await browser.close();
  }
});
