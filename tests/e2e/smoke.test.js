// 오프라인 단일 HTML 스모크 검사: file://로 열었을 때 네트워크 요청 없이 실행되는지 확인한다.
// 로컬 Chrome을 쓰려면 WAREHOUSE_BROWSER_PATH로 실행 파일 경로를 지정한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '../..');
const meta = JSON.parse(fs.readFileSync(path.join(root, 'dist/build-metadata.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const fileUrl = pathToFileURL(path.join(root, 'dist', meta.file)).href;

test('빌드 HTML이 오프라인으로 실행되고 버전을 분리해 표시한다', async () => {
  const executablePath = process.env.WAREHOUSE_BROWSER_PATH || undefined;
  const browser = await chromium.launch({ headless: true, executablePath });
  try {
    const context = await browser.newContext({ offline: true });
    const page = await context.newPage();
    const problems = [];
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') problems.push(`console: ${msg.text()}`);
    });
    page.on('request', (request) => {
      if (!request.url().startsWith('file:') && !request.url().startsWith('data:')) {
        problems.push(`network: ${request.url()}`);
      }
    });

    await page.goto(fileUrl);
    const versions = await page.locator('[data-testid="versions"]').textContent();
    assert.equal(versions, `앱 v${pkg.version} · 프로젝트 스키마 ${pkg.warehouse.projectSchemaVersion}`);
    assert.deepEqual(problems, []);
  } finally {
    await browser.close();
  }
});
