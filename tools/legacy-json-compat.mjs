// 재구축에서 내보낸 프로젝트 JSON을 기준본 v2.4.1의 'JSON 불러오기'로 실제로 여는지 확인한다(되돌아가기 경로 검증).
// 가상 프로젝트(primary)를 재구축 검증기로 정리해 내보내고, 기준본 화면의 파일 입력 → 교체 대화상자 → '현재 프로젝트 저장 후 교체'를 거친다.
// 사용: BASELINE_REPO=../warehouse_design WAREHOUSE_BROWSER_PATH=<chrome> node tools/legacy-json-compat.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { validateProject } from '../src/core/project.js';

const base = process.env.BASELINE_REPO;
if (!base) {
  console.error('BASELINE_REPO=<기준본 저장소 경로>를 지정하세요.');
  process.exit(2);
}
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { stem } = require(path.join(base, 'tools/version.cjs'));
const p = validateProject(JSON.parse(fs.readFileSync(new URL('../fixtures/legacy/v2.4.1-primary.project.json', import.meta.url), 'utf8')));
p.metadata.name = '재구축 내보내기 호환 시험';
const rack = p.scenarios.after.objects.find((o) => o.kind === 'rack');
rack.x = Math.round((rack.x + 0.123) * 1000) / 1000;
const want = { name: p.metadata.name, x: rack.x };
const text = JSON.stringify(validateProject(p), null, 2);
const browser = await chromium.launch({ executablePath: process.env.WAREHOUSE_BROWSER_PATH || undefined });
const page = await (await browser.newContext({ offline: true })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('dialog', (d) => d.accept());
await page.goto(pathToFileURL(path.join(base, 'dist', stem + '.html')).href);
await page.waitForSelector('#vStorage', { state: 'visible' });
await page.locator('#jsonIn').setInputFiles({ name: 'rebuild.json', mimeType: 'application/json', buffer: Buffer.from(text) });
const replace = page.locator('#vReplaceDialog button', { hasText: '현재 프로젝트 저장 후 교체' });
await page.waitForTimeout(800);
if (await replace.isVisible()) await replace.click();
await page.waitForFunction((id) => P.metadata.name === '재구축 내보내기 호환 시험' || /취소|실패/.test(document.querySelector('#toast')?.textContent || ''), rack.id, { timeout: 10000 }).catch(() => {});
const got = await page.evaluate((id) => ({ name: P.metadata.name, x: P.scenarios.after.objects.find((o) => o.id === id)?.x, toast: document.querySelector('#toast')?.textContent || '', status: document.querySelector('#saveStatus')?.dataset.state }), rack.id);
await browser.close();
const ok = !errors.length && got.name === want.name && got.x === want.x && got.status === 'saved';
console.log(`${ok ? 'PASS' : 'FAIL'} 기준본 v2.4.1 JSON 불러오기: ${JSON.stringify({ want, got, errors })}`);
process.exit(ok ? 0 : 1);
